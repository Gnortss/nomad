import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb, trips, tripChatLog } from "../db/schema";
import { googleRouteComputer } from "../lib/routes-google";
import { googleGeocoder } from "../lib/geocode";
import { runPlannerTurn, stripRepliesTag, type PlannerEvents, type PlannerTurnResult } from "../lib/ai/planner";
import { loadContext, appendContext, appendLog, clearChat } from "../lib/ai/chat-context";
import { newId } from "../lib/id";
import type { PlannerDeps } from "../lib/ai/tools";
import type { AppEnv } from "../auth";

type MessageParam = Anthropic.Messages.MessageParam;
type Db = ReturnType<typeof getDb>;
type Vars = { user: { id: string } | null };

const MAX_USER_TEXT_CHARS = 4_000;
// The lock heartbeats after every tool round; a few missed beats means the
// holder is dead and the lock is stealable.
const LOCK_STALE_MS = 3 * 60_000;

export type RunTurn = (apiKey: string, incoming: MessageParam[], deps: PlannerDeps, events: PlannerEvents) => Promise<PlannerTurnResult>;

// Owner-only guard: the chat can edit the trip, so it is never reachable via
// share token (share views hit /api/share/:token, a different surface).
async function ownTrip(db: Db, tripId: string, userId: string) {
  const [trip] = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1);
  return trip ?? null;
}

// CAS turn lock. D1 serializes writes, so of two concurrent claims only one
// UPDATE matches the WHERE; the follow-up SELECT tells each caller whether the
// token it wrote is the one that stuck.
async function claimTurnLock(db: Db, tripId: string): Promise<string | null> {
  const token = newId();
  const now = Date.now();
  await db.update(trips)
    .set({ chatTurnToken: token, chatTurnClaimedAt: now })
    .where(and(eq(trips.id, tripId), or(isNull(trips.chatTurnToken), lt(trips.chatTurnClaimedAt, now - LOCK_STALE_MS))));
  const [row] = await db.select({ token: trips.chatTurnToken }).from(trips).where(eq(trips.id, tripId));
  return row?.token === token ? token : null;
}

async function heartbeatLock(db: Db, tripId: string, token: string): Promise<void> {
  await db.update(trips).set({ chatTurnClaimedAt: Date.now() })
    .where(and(eq(trips.id, tripId), eq(trips.chatTurnToken, token)));
}

async function releaseLock(db: Db, tripId: string, token: string): Promise<void> {
  await db.update(trips).set({ chatTurnToken: null, chatTurnClaimedAt: null })
    .where(and(eq(trips.id, tripId), eq(trips.chatTurnToken, token)));
}

export function makeAiTripChatRouter(overrides?: { runTurn?: RunTurn }) {
  const r = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

  // One chat turn, streamed as SSE: text {delta} · tool {label} · replies {replies}
  // · trip_updated {} · error {message} · done. Context and display log persist
  // incrementally after each tool round, so a dropped connection loses at most
  // the round in flight — the applied trip edits are already in D1.
  r.post("/api/ai/trips/:id/chat", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!c.env.ANTHROPIC_API_KEY && !overrides?.runTurn) return c.json({ error: "ai_unconfigured" }, 503);
    const db = getDb(c.env);
    const trip = await ownTrip(db, c.req.param("id"), user.id);
    if (!trip) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{ text?: string; start?: boolean }>().catch(() => null);
    let text = body?.text?.trim() ?? "";
    if (text.length > MAX_USER_TEXT_CHARS) return c.json({ error: "message too long" }, 400);
    if (!text && !body?.start) return c.json({ error: "text or start required" }, 400);

    const token = await claimTurnLock(db, trip.id);
    if (!token) return c.json({ error: "a turn is already running" }, 409);

    // Kickoff: consume the stored new-trip description exactly once. Safe under
    // the turn lock; a second {start:true} (double mount) finds it consumed.
    if (!text && body?.start) {
      if (!trip.chatSeed || trip.chatSeedConsumed) {
        await releaseLock(db, trip.id, token);
        return c.json({ started: false }, 200);
      }
      await db.update(trips).set({ chatSeedConsumed: true }).where(eq(trips.id, trip.id));
      text = trip.chatSeed;
    }

    const deps: PlannerDeps = {
      db,
      tripId: trip.id,
      geocode: googleGeocoder(c.env.GOOGLE_ROUTES_KEY),
      computeRoute: googleRouteComputer(c.env.GOOGLE_ROUTES_KEY),
      tripModifiers: { avoidTolls: trip.avoidTolls, allowFerries: trip.allowFerries },
    };
    const runTurn = overrides?.runTurn ?? runPlannerTurn;

    return streamSSE(c, async (stream) => {
      // The client may disconnect mid-turn; a failed SSE write must not abort
      // the loop — edits and persistence continue, the reload shows the log.
      const send = async (event: string, data: unknown) => {
        try { await stream.writeSSE({ event, data: JSON.stringify(data) }); } catch { /* client gone */ }
      };

      const { messages: history, nextSeq, nextTurn } = await loadContext(db, trip.id);
      const userMessage: MessageParam = { role: "user", content: [{ type: "text", text }] };
      const incoming = [...history, userMessage];
      let persistedCount = history.length;
      let seq = nextSeq;

      // Display log: assistant text accumulates and flushes before each tool
      // line (mirrors how the thread interleaves in the panel) and at turn end.
      let assistantBuf = "";
      const flushAssistant = async () => {
        const t = stripRepliesTag(assistantBuf).trim();
        assistantBuf = "";
        if (t) await appendLog(db, trip.id, "assistant", t);
      };
      await appendLog(db, trip.id, "user", text);

      const turnWork = (async () => {
        try {
          const result = await runTurn(c.env.ANTHROPIC_API_KEY ?? "", incoming, deps, {
            onText: async (delta) => { assistantBuf += delta; await send("text", { delta }); },
            onTool: async (label) => {
              await flushAssistant();
              await appendLog(db, trip.id, "tool", label);
              await send("tool", { label });
            },
            onReplies: (replies) => send("replies", { replies }),
            onTripUpdated: () => send("trip_updated", {}),
            onRound: async (messages) => {
              seq = await appendContext(db, trip.id, nextTurn, seq, messages.slice(persistedCount));
              persistedCount = messages.length;
              await heartbeatLock(db, trip.id, token);
            },
            onDebug: (label, data) => send("debug", { label, data }),
          });
          await appendContext(db, trip.id, nextTurn, seq, result.messages.slice(persistedCount));
          await flushAssistant();
        } catch (e) {
          console.error("[ai-trip-chat] turn failed:", e);
          await flushAssistant();
          await send("error", { message: e instanceof Error ? e.message : "AI request failed" });
        } finally {
          await releaseLock(db, trip.id, token);
          await send("done", {});
        }
      })();

      // waitUntil buys a bounded grace window after a disconnect — enough to
      // finish the current round, persist, and release the lock; incremental
      // persistence + the stale-lock cutoff cover anything beyond it.
      c.executionCtx.waitUntil(turnWork);
      await turnWork;
    });
  });

  // Display transcript for the panel (kind: user | assistant | tool).
  r.get("/api/ai/trips/:id/chat", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const trip = await ownTrip(db, c.req.param("id"), user.id);
    if (!trip) return c.json({ error: "not found" }, 404);
    const log = await db.select({ kind: tripChatLog.kind, text: tripChatLog.text })
      .from(tripChatLog).where(eq(tripChatLog.tripId, trip.id)).orderBy(asc(tripChatLog.seq));
    const [{ busy }] = await db.select({ busy: sql<number>`CASE WHEN chat_turn_token IS NOT NULL AND chat_turn_claimed_at > ${Date.now() - LOCK_STALE_MS} THEN 1 ELSE 0 END` })
      .from(trips).where(eq(trips.id, trip.id));
    return c.json({ log, busy: !!busy, pendingSeed: !!trip.chatSeed && !trip.chatSeedConsumed });
  });

  // Clear chat: wipes log + context and frees the lock. The consumed seed stays
  // consumed — clearing must not re-trigger the kickoff.
  r.delete("/api/ai/trips/:id/chat", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const trip = await ownTrip(db, c.req.param("id"), user.id);
    if (!trip) return c.json({ error: "not found" }, 404);
    await clearChat(db, trip.id);
    return c.body(null, 204);
  });

  return r;
}
