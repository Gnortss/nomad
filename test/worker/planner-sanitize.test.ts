import { describe, it, expect } from "vitest";
import { stripPendingToolUses } from "../../src/worker/lib/ai/planner";
import type Anthropic from "@anthropic-ai/sdk";

type Msg = Anthropic.Messages.MessageParam;
const user: Msg = { role: "user", content: "plan me a trip" };

describe("stripPendingToolUses", () => {
  it("leaves a clean end_turn transcript untouched", () => {
    const msgs: Msg[] = [user, { role: "assistant", content: [{ type: "text", text: "What dates?" }] as never }];
    expect(stripPendingToolUses(msgs)).toBe(msgs);
  });

  it("drops an unresolved custom tool_use but keeps the text", () => {
    const msgs: Msg[] = [user, {
      role: "assistant",
      content: [
        { type: "text", text: "Checking drive times…" },
        { type: "tool_use", id: "tu1", name: "check_drive_time", input: {} },
      ] as never,
    }];
    const out = stripPendingToolUses(msgs);
    const content = out[1].content as Array<{ type: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
  });

  it("drops a pending server_tool_use but keeps a resolved one", () => {
    const msgs: Msg[] = [user, {
      role: "assistant",
      content: [
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "a" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
        { type: "text", text: "Found it. Searching more…" },
        { type: "server_tool_use", id: "s2", name: "web_search", input: { query: "b" } }, // pending
      ] as never,
    }];
    const content = stripPendingToolUses(msgs)[1].content as Array<{ type: string; id?: string }>;
    expect(content.map((b) => b.type)).toEqual(["server_tool_use", "web_search_tool_result", "text"]);
    expect(content[0].id).toBe("s1");
  });

  it("drops the whole assistant message when only thinking would remain", () => {
    const msgs: Msg[] = [user, {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "tool_use", id: "tu1", name: "geocode_places", input: {} },
      ] as never,
    }];
    const out = stripPendingToolUses(msgs);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });
});
