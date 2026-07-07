import { describe, it, expect } from "vitest";
import { computeDrop } from "../../src/client/editor/assign";

describe("computeDrop", () => {
  it("inserts a new point at the target index", () => {
    expect(computeDrop(["a", "b", "c"], "x", 1)).toEqual(["a", "x", "b", "c"]);
  });
  it("moves an existing point (removes prior occurrence first)", () => {
    expect(computeDrop(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });
  it("appends when index is at/after the end", () => {
    expect(computeDrop(["a", "b"], "x", 5)).toEqual(["a", "b", "x"]);
  });
});
