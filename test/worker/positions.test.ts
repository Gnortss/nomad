import { describe, it, expect } from "vitest";
import { rewritePositions } from "../../src/worker/lib/positions";

describe("rewritePositions", () => {
  it("assigns contiguous 0-based positions", () => {
    expect(rewritePositions(["a", "b", "c"])).toEqual([
      { pointId: "a", position: 0 }, { pointId: "b", position: 1 }, { pointId: "c", position: 2 },
    ]);
  });
  it("dedupes, first occurrence wins", () => {
    expect(rewritePositions(["a", "b", "a"])).toEqual([
      { pointId: "a", position: 0 }, { pointId: "b", position: 1 },
    ]);
  });
});
