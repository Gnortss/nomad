import { describe, it, expect } from "vitest";
import { dayFuelCost } from "../../src/worker/lib/fuel";

describe("dayFuelCost", () => {
  it("computes cost from distance, consumption and price", () => {
    // 200 km at 8 L/100km * €1.90/L = 16 L * 1.9 = 30.4
    expect(dayFuelCost(200_000, 8, 1.9)).toBeCloseTo(30.4, 5);
  });
  it("returns null when a fuel param is missing", () => {
    expect(dayFuelCost(200_000, null, 1.9)).toBeNull();
    expect(dayFuelCost(200_000, 8, undefined)).toBeNull();
  });
});
