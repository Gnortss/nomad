import { describe, it, expect } from "vitest";
import { stopsForDay, pooledPoints, daysWithStats, groupColor } from "../../src/client/lib/tripModel";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "Iceland", startDate: "2026-07-12", currency: "EUR", fuelLPer100km: 8, fuelPricePerL: 1.9 } as any,
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B" }],
  points: [
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, type: "poi", bookingStatus: "idea", groupId: "g1", links: [] } as any,
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, type: "camp", bookingStatus: "booked", groupId: null, links: [] } as any,
    { id: "p2", tripId: "t1", name: "P2", lat: 3, lng: 3, type: "viewpoint", bookingStatus: "idea", groupId: null, links: [] } as any,
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" } as any],
  dayStops: [
    { dayId: "d0", pointId: "p1", position: 1 },
    { dayId: "d0", pointId: "p0", position: 0 },
  ],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 200000, durationS: 36000, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 200000, totalDurationS: 36000, totalFuel: 30.4, perDay: { d0: { distanceM: 200000, durationS: 36000, fuel: 30.4, warnLongDay: true } } },
};

describe("tripModel", () => {
  it("orders a day's stops by position", () => {
    expect(stopsForDay(detail, "d0").map((p) => p.id)).toEqual(["p0", "p1"]);
  });
  it("pooled = points with no day_stops row", () => {
    expect(pooledPoints(detail).map((p) => p.id)).toEqual(["p2"]);
  });
  it("joins days to stops and per-day stats incl. long-day warning", () => {
    const d = daysWithStats(detail)[0];
    expect(d.stops.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(d.distanceM).toBe(200000);
    expect(d.warnLongDay).toBe(true);
    expect(d.fuel).toBeCloseTo(30.4, 3);
  });
  it("groupColor falls back to Basalt when ungrouped", () => {
    expect(groupColor(detail, "g1")).toBe("#C64A3B");
    expect(groupColor(detail, null)).toBe("#1E2A2C");
    expect(groupColor(detail, "nope")).toBe("#1E2A2C");
  });
});
