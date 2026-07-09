import { describe, it, expect } from "vitest";
import { shareDays, shareToTripDetail, type SharePayload } from "../../src/client/share/shareModel";

const payload: SharePayload = {
  trip: { name: "Iceland", startDate: "2026-07-12" },
  groups: [], points: [
    { id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, links: [], bookingStatus: "idea", groupId: null },
    { id: "p1", name: "Vík", type: "food", lat: 2, lng: 2, links: [], bookingStatus: "booked", groupId: null },
    { id: "p2", name: "Hótel Katla", type: "hotel", lat: 3, lng: 3, links: [], bookingStatus: "booked", groupId: null },
  ],
  days: [{ id: "d0", position: 0, title: "Vík" }],
  stops: [
    { dayId: "d0", pointId: "p1", position: 1, inRoute: true },
    { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
    { dayId: "d0", pointId: "p2", position: 2, inRoute: false },
  ],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};

describe("shareModel", () => {
  it("orders route stops, keeps attached apart, exposes per-day distance/time", () => {
    const days = shareDays(payload);
    expect(days[0].title).toBe("Vík");
    expect(days[0].stops.map((s) => s.name)).toEqual(["Reynisfjara", "Vík"]);
    expect(days[0].attached.map((s) => s.name)).toEqual(["Hótel Katla"]);
    expect(days[0].distanceM).toBe(187000);
  });

  it("adapts the payload to the TripDetail shape the map components render", () => {
    const detail = shareToTripDetail(payload);
    expect(detail.points.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(detail.dayStops).toEqual(payload.stops);
    // routes record becomes the DayRoute[] MapLayer looks up by dayId
    expect(detail.routes).toEqual([{ dayId: "d0", polyline: "x", distanceM: 187000, durationS: 10500, waypointsHash: "", computedAt: 0 }]);
    expect(detail.stats.perDay.d0).toMatchObject({ distanceM: 187000, durationS: 10500 });
    expect(detail.trip.mapLat).toBeNull();
  });
});
