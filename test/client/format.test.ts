import { describe, it, expect } from "vitest";
import { formatDistance, formatDuration, formatCost, endpointLabel } from "../../src/client/lib/format";

describe("formatters", () => {
  it("distance in km", () => {
    expect(formatDistance(214000)).toBe("214 km");
    expect(formatDistance(0)).toBe("0 km");
  });
  it("duration as h + padded min, or min under an hour", () => {
    expect(formatDuration(11400)).toBe("3 h 10");   // 3h10m
    expect(formatDuration(0)).toBe("0 h 00");
    expect(formatDuration(2700)).toBe("45 min");     // 45m
  });
  it("cost with basis, free, and unknown", () => {
    expect(formatCost(22, "per_night", "EUR")).toBe("€22 / night");
    expect(formatCost(59, "per_person", "EUR")).toBe("€59 / person");
    expect(formatCost(8, "total", "EUR")).toBe("€8");
    expect(formatCost(0, "total", "EUR")).toBe("Free");
    expect(formatCost(null, null, "EUR")).toBe("—");
  });
  it("labels only the last stop END — a day's drive starts at the previous day's overnight", () => {
    expect(endpointLabel(0, 3)).toBe("");
    expect(endpointLabel(2, 3)).toBe("END");
    expect(endpointLabel(1, 3)).toBe("");
    expect(endpointLabel(0, 1)).toBe("END"); // a lone stop is where the day's drive ends
  });
});
