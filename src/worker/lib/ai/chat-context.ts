import { asc, eq, sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb, trips, tripChatContext, tripChatLog } from "../../db/schema";
import { stripUnresolvedServerToolUses } from "./planner";

type Db = ReturnType<typeof getDb>;
type MessageParam = Anthropic.Messages.MessageParam;

// Budget-capped pruning for the persisted Anthropic context (trip_chat_context).
// Cuts oldest-first by WHOLE turns only: a cut inside a turn could land between
// an assistant tool_use and its tool_result, making the array invalid (400 on
// every subsequent request). The retained history therefore always starts at
// the plain user text message that opened a turn.

export type ContextRow = { seq: number; turn: number; message: string };

// Serialized-size budget for the context sent to Anthropic. Web-search tool
// results dominate; ~400k chars ≈ 100k tokens leaves ample room for the
// system prompt, tools, and the ephemeral trip-state injection.
export const CONTEXT_CHAR_BUDGET = 400_000;

export function pruneContextRows(rows: ContextRow[], budget = CONTEXT_CHAR_BUDGET): ContextRow[] {
  let total = 0;
  for (const r of rows) total += r.message.length;
  if (total <= budget) return rows;
  // Drop oldest turns until under budget — but never the latest turn, however large.
  const lastTurn = rows[rows.length - 1]!.turn;
  let i = 0;
  while (total > budget && i < rows.length && rows[i].turn !== lastTurn) {
    const turn = rows[i].turn;
    while (i < rows.length && rows[i].turn === turn) total -= rows[i++].message.length;
  }
  return rows.slice(i);
}

// --- persistence -------------------------------------------------------------

export async function loadContext(db: Db, tripId: string): Promise<{ messages: MessageParam[]; nextSeq: number; nextTurn: number }> {
  const rows = await db.select({ seq: tripChatContext.seq, turn: tripChatContext.turn, message: tripChatContext.message })
    .from(tripChatContext).where(eq(tripChatContext.tripId, tripId)).orderBy(asc(tripChatContext.seq));
  const nextSeq = rows.length ? rows[rows.length - 1].seq + 1 : 0;
  const nextTurn = rows.length ? rows[rows.length - 1].turn + 1 : 0;
  const kept = pruneContextRows(rows);
  // Heal on load: an assistant message persisted mid-turn can carry an
  // unresolved server_tool_use (see stripUnresolvedServerToolUses) — re-sending
  // it would 400 every turn until the user clears the chat.
  const messages = kept.map((r) => {
    const m = JSON.parse(r.message) as MessageParam;
    if (m.role === "assistant" && Array.isArray(m.content))
      m.content = stripUnresolvedServerToolUses(m.content as Anthropic.Messages.ContentBlock[]);
    return m;
  });
  return { messages, nextSeq, nextTurn };
}

export async function appendContext(db: Db, tripId: string, turn: number, startSeq: number, messages: MessageParam[]): Promise<number> {
  if (messages.length === 0) return startSeq;
  await db.insert(tripChatContext).values(
    messages.map((m, i) => ({ tripId, seq: startSeq + i, turn, message: JSON.stringify(m) })),
  );
  return startSeq + messages.length;
}

export async function appendLog(db: Db, tripId: string, kind: "user" | "assistant" | "tool", text: string): Promise<void> {
  // seq is allocated atomically in SQL — log appends interleave with streaming.
  await db.run(sql`INSERT INTO trip_chat_log (trip_id, seq, kind, text)
    VALUES (${tripId}, (SELECT COALESCE(MAX(seq), -1) + 1 FROM trip_chat_log WHERE trip_id = ${tripId}), ${kind}, ${text})`);
}

export async function clearChat(db: Db, tripId: string): Promise<void> {
  await db.batch([
    db.delete(tripChatLog).where(eq(tripChatLog.tripId, tripId)),
    db.delete(tripChatContext).where(eq(tripChatContext.tripId, tripId)),
    db.update(trips).set({ chatTurnToken: null, chatTurnClaimedAt: null }).where(eq(trips.id, tripId)),
  ]);
}
