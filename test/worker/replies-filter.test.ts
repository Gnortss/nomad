import { describe, it, expect } from "vitest";
import { RepliesFilter, stripRepliesTag, withInjectedState } from "../../src/worker/lib/ai/planner";
import type Anthropic from "@anthropic-ai/sdk";

async function run(chunks: string[]): Promise<{ text: string; replies: string[] }> {
  let text = "";
  const f = new RepliesFilter((d) => { text += d; });
  for (const c of chunks) await f.push(c);
  const replies = await f.finish();
  return { text, replies };
}

describe("RepliesFilter", () => {
  it("passes plain text through untouched", async () => {
    const r = await run(["Hello ", "world"]);
    expect(r).toEqual({ text: "Hello world", replies: [] });
  });

  it("strips a trailing tag and parses chips", async () => {
    const r = await run(["Which pace do you prefer? ", "<replies>Relaxed|Packed days|You decide</replies>"]);
    expect(r.text).toBe("Which pace do you prefer? ");
    expect(r.replies).toEqual(["Relaxed", "Packed days", "You decide"]);
  });

  it("handles the tag split across many chunks", async () => {
    const r = await run(["Sounds good?", "<rep", "lies>Y", "es|No", "</repl", "ies>"]);
    expect(r.text).toBe("Sounds good?");
    expect(r.replies).toEqual(["Yes", "No"]);
  });

  it("flushes a lone '<' that never becomes the tag", async () => {
    const r = await run(["a < b ", "and a <re", "d car"]);
    expect(r.text).toBe("a < b and a <red car");
    expect(r.replies).toEqual([]);
  });

  it("flushes an unterminated tag as text at finish", async () => {
    const r = await run(["Pick one ", "<replies>Yes|No"]);
    expect(r.text).toBe("Pick one <replies>Yes|No");
    expect(r.replies).toEqual([]);
  });

  it("caps at 4 chips and drops empties", async () => {
    const r = await run(["<replies>a| |b|c|d|e</replies>"]);
    expect(r.replies).toEqual(["a", "b", "c", "d"]);
  });
});

describe("stripRepliesTag", () => {
  it("removes only a trailing tag", () => {
    expect(stripRepliesTag("Question?<replies>Yes|No</replies>")).toBe("Question?");
    expect(stripRepliesTag("no tag here")).toBe("no tag here");
  });
});

describe("withInjectedState", () => {
  it("appends the state, pins the cache breakpoint on the last stable block, and never mutates input", () => {
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: [{ type: "text", text: "plan me a trip" }] },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "done" }] as never },
    ];
    const snapshot = JSON.parse(JSON.stringify(messages));
    const out = withInjectedState(messages, "<trip_state>{}</trip_state>");

    expect(out).toHaveLength(4);
    const injected = out[3];
    expect(injected.role).toBe("user");
    expect((injected.content as Array<{ text: string }>)[0].text).toContain("trip_state");
    // Breakpoint sits on the last STABLE message, not the injected one.
    const stableLast = out[2].content as Array<{ cache_control?: unknown }>;
    expect(stableLast[stableLast.length - 1].cache_control).toEqual({ type: "ephemeral" });
    expect((injected.content as Array<{ cache_control?: unknown }>)[0].cache_control).toBeUndefined();
    expect(messages).toEqual(snapshot); // persisted state untouched
  });

  it("converts a string-content last message to blocks", () => {
    const out = withInjectedState([{ role: "user", content: "hi" }], "<trip_state>{}</trip_state>");
    const blocks = out[0].content as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(blocks[0].text).toBe("hi");
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });
});
