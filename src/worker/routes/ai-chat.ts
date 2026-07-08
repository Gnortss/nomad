import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db/schema";
import { googleRouteComputer } from "../lib/routes-google";
import { googleGeocoder } from "../lib/geocode";
import { runPlannerTurn } from "../lib/ai/planner";
import { applyPlan } from "../lib/ai/apply-plan";
import type { AppEnv } from "../auth";

type MessageParam = Anthropic.Messages.MessageParam;
const MAX_MESSAGES = 200;
const MAX_BODY_CHARS = 1_500_000; // serialized conversation incl. search results
const MAX_USER_TEXT_CHARS = 4_000; // a trip brief fits comfortably; blocks prompt-stuffing

function lastUserTextLength(m: MessageParam): number {
  if (typeof m.content === "string") return m.content.length;
  return m.content.reduce((n, b) => n + (b.type === "text" ? b.text.length : 0), 0);
}

export const aiChatRouter = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

// One chat turn. The client owns the conversation: it sends the full Anthropic
// messages array (ending with the new user message) and stores the updated array
// we stream back — the server stays stateless. SSE events:
//   text {delta} · tool {label} · messages_state {messages} · trip_created {tripId} · error {message} · done
aiChatRouter.post("/api/ai/chat", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "ai_unconfigured" }, 503);

  const raw = await c.req.text();
  if (raw.length > MAX_BODY_CHARS) return c.json({ error: "conversation too large" }, 413);
  let body: { messages?: MessageParam[]; tripName?: string } | null = null;
  try { body = JSON.parse(raw); } catch { /* handled below */ }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return c.json({ error: "messages required" }, 400);
  const last = messages[messages.length - 1];
  if (last?.role !== "user") return c.json({ error: "last message must be from user" }, 400);
  if (lastUserTextLength(last) > MAX_USER_TEXT_CHARS) return c.json({ error: "message too long" }, 400);
  if (body?.tripName && body.tripName.length > 200) return c.json({ error: "trip name too long" }, 400);

  const deps = {
    geocode: googleGeocoder(c.env.GOOGLE_ROUTES_KEY),
    computeRoute: googleRouteComputer(c.env.GOOGLE_ROUTES_KEY),
  };

  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    try {
      const result = await runPlannerTurn(c.env.ANTHROPIC_API_KEY!, messages, deps, {
        onText: (delta) => send("text", { delta }),
        onTool: (label) => send("tool", { label }),
        onDebug: (label, data) => send("debug", { label, data }),
      });

      if (result.kind === "plan") {
        const applied = await applyPlan(getDb(c.env), user.id, result.plan, body?.tripName ?? null, deps.computeRoute);
        console.log("[ai-chat] plan applied:", JSON.stringify({ tripId: applied.tripId, ...applied.counts, routeStatus: applied.routeStatus }));
        await send("debug", { label: "plan_applied", data: { counts: applied.counts, routeStatus: applied.routeStatus } });
        await send("trip_created", { tripId: applied.tripId });
      } else {
        await send("messages_state", { messages: result.messages });
      }
      await send("done", {});
    } catch (e) {
      console.error("ai-chat turn failed:", e);
      await send("error", { message: e instanceof Error ? e.message : "AI request failed" });
    }
  });
});
