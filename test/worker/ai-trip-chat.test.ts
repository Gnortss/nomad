import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { asc, eq } from "drizzle-orm";
import { appWith } from "../helpers/session";
import { makeAiTripChatRouter, type RunTurn } from "../../src/worker/routes/ai-trip-chat";
import { getDb, trips, tripChatContext, tripChatLog } from "../../src/worker/db/schema";

const db = () => getDb(env);

async function seedTrip(over?: Partial<typeof trips.$inferInsert>) {
  const now = Date.now();
  await db().insert(trips).values({
    id: "t1", userId: "alice", name: "T", currency: "EUR", createdAt: now, updatedAt: now,
    chatSeed: "10 days Dolomites, camping", ...over,
  });
}

async function post(app: ReturnType<typeof appWith>, body: object, tripId = "t1") {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`http://x/api/ai/trips/${tripId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
  const text = res.body ? await res.text() : "";
  await waitOnExecutionContext(ctx);
  return { res, text };
}

// A fake turn: replies with text, simulates one tool round with persistence callback.
const happyTurn: RunTurn = async (_key, incoming, _deps, events) => {
  await events.onText("Planning day 1…");
  await events.onTool("Writing day 1");
  await events.onTripUpdated?.();
  const midMessages = [...incoming,
    { role: "assistant" as const, content: [{ type: "tool_use", id: "tu1", name: "upsert_days", input: {} }] as never },
    { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "tu1", content: "ok" }] as never },
  ];
  await events.onRound?.(midMessages);
  await events.onText(" Done. Want day 2?");
  await events.onReplies?.(["Yes", "Change day 1"]);
  const final = [...midMessages, { role: "assistant" as const, content: [{ type: "text", text: " Done. Want day 2?<replies>Yes|Change day 1</replies>" }] as never }];
  return { messages: final, replies: ["Yes", "Change day 1"] };
};

describe("POST /api/ai/trips/:id/chat", () => {
  beforeEach(() => seedTrip());

  it("runs a turn: streams events, persists log + context, releases the lock", async () => {
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    const { res, text } = await post(app, { text: "plan it" });
    expect(res.status).toBe(200);
    expect(text).toContain("event: text");
    expect(text).toContain("event: tool");
    expect(text).toContain("event: trip_updated");
    expect(text).toContain("event: replies");
    expect(text).toContain("event: done");

    const log = await db().select().from(tripChatLog).where(eq(tripChatLog.tripId, "t1")).orderBy(asc(tripChatLog.seq));
    expect(log.map((l) => l.kind)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(log[3].text).toBe("Done. Want day 2?"); // replies tag stripped from the log

    const ctxRows = await db().select().from(tripChatContext).where(eq(tripChatContext.tripId, "t1")).orderBy(asc(tripChatContext.seq));
    expect(ctxRows).toHaveLength(4); // user + assistant(tool_use) + tool_result + final assistant
    expect(ctxRows.every((r) => r.turn === 0)).toBe(true);
    expect(ctxRows.map((r) => r.seq)).toEqual([0, 1, 2, 3]);

    const [t] = await db().select().from(trips).where(eq(trips.id, "t1"));
    expect(t.chatTurnToken).toBeNull(); // lock released
  });

  it("second turn appends with the next turn number and full prior context", async () => {
    let seenIncoming = 0;
    const countingTurn: RunTurn = async (_k, incoming, _d, events) => {
      seenIncoming = incoming.length;
      await events.onText("ok");
      return { messages: [...incoming, { role: "assistant", content: [{ type: "text", text: "ok" }] as never }], replies: [] };
    };
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    await post(app, { text: "plan it" });
    const app2 = appWith("alice", makeAiTripChatRouter({ runTurn: countingTurn }));
    await post(app2, { text: "make day 2 slower" });

    expect(seenIncoming).toBe(5); // 4 persisted + new user message
    const rows = await db().select().from(tripChatContext).where(eq(tripChatContext.tripId, "t1")).orderBy(asc(tripChatContext.seq));
    expect(rows[rows.length - 1].turn).toBe(1);
  });

  it("kickoff consumes the seed once and logs it as the user message", async () => {
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    const { res } = await post(app, { start: true });
    expect(res.status).toBe(200);
    const log = await db().select().from(tripChatLog).where(eq(tripChatLog.tripId, "t1")).orderBy(asc(tripChatLog.seq));
    expect(log[0]).toMatchObject({ kind: "user", text: "10 days Dolomites, camping" });
    const [t] = await db().select().from(trips).where(eq(trips.id, "t1"));
    expect(t.chatSeedConsumed).toBe(true);

    // Double mount: second start is a no-op.
    const { res: res2 } = await post(app, { start: true });
    expect(res2.status).toBe(200);
    expect(await db().select().from(tripChatLog).where(eq(tripChatLog.tripId, "t1"))).toHaveLength(4); // unchanged
  });

  it("409s while another turn holds a fresh lock, steals a stale one", async () => {
    await db().update(trips).set({ chatTurnToken: "other", chatTurnClaimedAt: Date.now() }).where(eq(trips.id, "t1"));
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    expect((await post(app, { text: "hi" })).res.status).toBe(409);

    await db().update(trips).set({ chatTurnClaimedAt: Date.now() - 10 * 60_000 }).where(eq(trips.id, "t1"));
    expect((await post(app, { text: "hi" })).res.status).toBe(200);
  });

  it("sends an error event and releases the lock when the turn throws", async () => {
    const failingTurn: RunTurn = async () => { throw new Error("anthropic exploded"); };
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: failingTurn }));
    const { text } = await post(app, { text: "hi" });
    expect(text).toContain("event: error");
    expect(text).toContain("anthropic exploded");
    const [t] = await db().select().from(trips).where(eq(trips.id, "t1"));
    expect(t.chatTurnToken).toBeNull();
  });

  it("guards: 401 anon, 404 stranger, 400 empty", async () => {
    const anon = appWith(null, makeAiTripChatRouter({ runTurn: happyTurn }));
    expect((await post(anon, { text: "hi" })).res.status).toBe(401);
    const bob = appWith("bob", makeAiTripChatRouter({ runTurn: happyTurn }));
    expect((await post(bob, { text: "hi" })).res.status).toBe(404);
    const alice = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    expect((await post(alice, {})).res.status).toBe(400);
  });
});

describe("GET/DELETE /api/ai/trips/:id/chat", () => {
  beforeEach(() => seedTrip());

  it("GET returns the log, busy=false and pendingSeed", async () => {
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://x/api/ai/trips/t1/chat"), env, ctx);
    await waitOnExecutionContext(ctx);
    const body = await res.json<{ log: unknown[]; busy: boolean; pendingSeed: boolean }>();
    expect(body).toEqual({ log: [], busy: false, pendingSeed: true });
  });

  it("DELETE wipes log + context + lock but keeps the seed consumed", async () => {
    const app = appWith("alice", makeAiTripChatRouter({ runTurn: happyTurn }));
    await post(app, { start: true });
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://x/api/ai/trips/t1/chat", { method: "DELETE" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    expect(await db().select().from(tripChatLog).where(eq(tripChatLog.tripId, "t1"))).toHaveLength(0);
    expect(await db().select().from(tripChatContext).where(eq(tripChatContext.tripId, "t1"))).toHaveLength(0);
    const [t] = await db().select().from(trips).where(eq(trips.id, "t1"));
    expect(t.chatSeedConsumed).toBe(true); // clear must not re-trigger kickoff
  });
});
