import { describe, it, expect } from "vitest";
import { routeStopsForDay, attachedStopsForDay, pooledPoints, daysWithStats, groupColor, rewriteDayStops } from "../../src/client/lib/tripModel";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "Iceland", startDate: "2026-07-12", currency: "EUR", fuelLPer100km: 8, fuelPricePerL: 1.9 } as any,
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B", dayId: null }],
  points: [
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, type: "poi", bookingStatus: "idea", groupId: "g1", links: [] } as any,
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, type: "camp", bookingStatus: "booked", groupId: null, links: [] } as any,
    { id: "p2", tripId: "t1", name: "P2", lat: 3, lng: 3, type: "viewpoint", bookingStatus: "idea", groupId: null, links: [] } as any,
    { id: "p3", tripId: "t1", name: "Hotel", lat: 4, lng: 4, type: "hotel", bookingStatus: "booked", groupId: null, links: [] } as any,
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" } as any],
  dayStops: [
    { dayId: "d0", pointId: "p1", position: 1, inRoute: true },
    { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
    { dayId: "d0", pointId: "p3", position: 2, inRoute: false },
  ],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 200000, durationS: 36000, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 200000, totalDurationS: 36000, totalFuel: 30.4, perDay: { d0: { distanceM: 200000, durationS: 36000, fuel: 30.4, warnLongDay: true } } },
};

describe("tripModel", () => {
  it("route stops = inRoute rows ordered by position; attached kept apart", () => {
    expect(routeStopsForDay(detail, "d0").map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(attachedStopsForDay(detail, "d0").map((p) => p.id)).toEqual(["p3"]);
  });
  it("pooled = points with no day_stops row (attached counts as assigned)", () => {
    expect(pooledPoints(detail).map((p) => p.id)).toEqual(["p2"]);
  });
  it("joins days to route + attached stops and per-day stats incl. long-day warning", () => {
    const d = daysWithStats(detail)[0];
    expect(d.stops.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(d.attached.map((p) => p.id)).toEqual(["p3"]);
    expect(d.distanceM).toBe(200000);
    expect(d.warnLongDay).toBe(true);
    expect(d.fuel).toBeCloseTo(30.4, 3);
  });
  it("groupColor falls back to Basalt when ungrouped", () => {
    expect(groupColor(detail, "g1")).toBe("#C64A3B");
    expect(groupColor(detail, null)).toBe("#16211F");
    expect(groupColor(detail, "nope")).toBe("#16211F");
  });
});

describe("rewriteDayStops", () => {
  const two: TripDetail = {
    ...detail,
    days: [...detail.days, { id: "d1", tripId: "t1", position: 1, title: "B" } as any],
    dayStops: [
      { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
      { dayId: "d0", pointId: "p1", position: 1, inRoute: true },
      { dayId: "d0", pointId: "p3", position: 2, inRoute: false },
    ],
  };

  it("reorders within a day, reindexes 0..n, and keeps attached rows", () => {
    const next = rewriteDayStops(two, [{ dayId: "d0", pointIds: ["p1", "p0"] }]);
    expect(routeStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p1", "p0"]);
    expect(attachedStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p3"]);
    expect(two.dayStops.map((s) => s.pointId)).toEqual(["p0", "p1", "p3"]); // input untouched
  });

  it("moves a stop across days with two writes", () => {
    const next = rewriteDayStops(two, [
      { dayId: "d0", pointIds: ["p0"] },
      { dayId: "d1", pointIds: ["p1"] },
    ]);
    expect(routeStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p0"]);
    expect(routeStopsForDay(next, "d1").map((p) => p.id)).toEqual(["p1"]);
  });

  it("pulls a moved point out of an unaffected day (single-write cross-day)", () => {
    const next = rewriteDayStops(two, [{ dayId: "d1", pointIds: ["p1"] }]);
    expect(routeStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p0"]);
    expect(routeStopsForDay(next, "d1").map((p) => p.id)).toEqual(["p1"]);
  });

  it("pulls an attached point into a route when moved (no duplicate rows)", () => {
    const next = rewriteDayStops(two, [{ dayId: "d1", pointIds: ["p3"] }]);
    expect(routeStopsForDay(next, "d1").map((p) => p.id)).toEqual(["p3"]);
    expect(attachedStopsForDay(next, "d0")).toEqual([]);
  });

  it("assigns a pooled point to a day", () => {
    const next = rewriteDayStops(two, [{ dayId: "d0", pointIds: ["p0", "p1", "p2"] }]);
    expect(routeStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(pooledPoints(next)).toEqual([]);
  });

  it("unassigns: rewriting a day without a point returns it to the pool", () => {
    const next = rewriteDayStops(two, [{ dayId: "d0", pointIds: ["p0"] }]);
    expect(routeStopsForDay(next, "d0").map((p) => p.id)).toEqual(["p0"]);
    expect(pooledPoints(next).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
