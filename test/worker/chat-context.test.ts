import { describe, it, expect } from "vitest";
import { pruneContextRows, type ContextRow } from "../../src/worker/lib/ai/chat-context";

// Turn 0: user + assistant(tool_use) + user(tool_result) + assistant. Turn 1: user + assistant.
function turn(turnNo: number, startSeq: number, pad: number): ContextRow[] {
  const p = "x".repeat(pad);
  return [
    { seq: startSeq, turn: turnNo, message: JSON.stringify({ role: "user", content: [{ type: "text", text: `hi ${p}` }] }) },
    { seq: startSeq + 1, turn: turnNo, message: JSON.stringify({ role: "assistant", content: [{ type: "tool_use", id: `tu${turnNo}`, name: "t", input: {} }] }) },
    { seq: startSeq + 2, turn: turnNo, message: JSON.stringify({ role: "user", content: [{ type: "tool_result", tool_use_id: `tu${turnNo}`, content: p }] }) },
    { seq: startSeq + 3, turn: turnNo, message: JSON.stringify({ role: "assistant", content: [{ type: "text", text: "done" }] }) },
  ];
}

describe("pruneContextRows", () => {
  it("returns rows unchanged when under budget", () => {
    const rows = [...turn(0, 0, 10), ...turn(1, 4, 10)];
    expect(pruneContextRows(rows, 100_000)).toBe(rows);
  });

  it("prunes whole turns only — a mid-tool-round cut never survives", () => {
    const rows = [...turn(0, 0, 5000), ...turn(1, 4, 5000), ...turn(2, 8, 100)];
    // Budget forces dropping some rows of turn 0 by size, but the cut must round up to the full turn.
    const kept = pruneContextRows(rows, 11_000);
    expect(kept[0].turn).toBe(1); // turn 0 dropped entirely
    const first = JSON.parse(kept[0].message) as { role: string; content: Array<{ type: string }> };
    expect(first.role).toBe("user");
    expect(first.content[0].type).toBe("text"); // starts at a plain user message, not a tool_result
  });

  it("never drops the latest turn even when it alone exceeds the budget", () => {
    const rows = turn(0, 0, 50_000);
    const kept = pruneContextRows(rows, 1_000);
    expect(kept).toHaveLength(4); // intact
  });
});
