import { describe, it, expect } from "vitest";
import { computeDrop, resolveDrop } from "../../src/client/editor/assign";
import type { TripDetail } from "../../src/client/lib/types";

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

const point = (id: string) => ({ id, tripId: "t1", name: id, lat: 0, lng: 0, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null });
const detail = {
  trip: { id: "t1", name: "T", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null, vehicle: "car" as const, evRangeKm: null, avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null },
  groups: [],
  points: [point("a"), point("b"), point("c"), point("x")],
  days: [{ id: "d1", tripId: "t1", position: 0, title: null }, { id: "d2", tripId: "t1", position: 1, title: null }],
  dayStops: [
    { dayId: "d1", pointId: "a", position: 0, inRoute: true },
    { dayId: "d1", pointId: "b", position: 1, inRoute: true },
    { dayId: "d2", pointId: "c", position: 0, inRoute: true },
  ],
  routes: [],
  stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
} satisfies TripDetail;

describe("resolveDrop", () => {
  it("over a day container appends to the end of that day", () => {
    expect(resolveDrop("x", { id: "d1", data: { type: "day" } }, detail)).toEqual({ toDayId: "d1", toIndex: 2, fromDayId: null });
  });
  it("over a stop row inserts at that row's index", () => {
    expect(resolveDrop("x", { id: "b", data: { type: "dayStop", dayId: "d1", sortable: { index: 1 } } }, detail)).toEqual({ toDayId: "d1", toIndex: 1, fromDayId: null });
  });
  it("carries fromDayId for a same-day reorder", () => {
    expect(resolveDrop("a", { id: "b", data: { type: "dayStop", dayId: "d1", sortable: { index: 1 } } }, detail)).toEqual({ toDayId: "d1", toIndex: 1, fromDayId: "d1" });
  });
  it("carries fromDayId for a cross-day move", () => {
    expect(resolveDrop("c", { id: "d1", data: { type: "day" } }, detail)).toEqual({ toDayId: "d1", toIndex: 2, fromDayId: "d2" });
  });
  it("returns null when the target is not a day or stop row", () => {
    expect(resolveDrop("x", { id: "nope" }, detail)).toBeNull();
  });
});
