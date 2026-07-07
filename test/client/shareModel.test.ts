import { describe, it, expect } from "vitest";
import { shareDays, type SharePayload } from "../../src/client/share/shareModel";

const payload: SharePayload = {
  trip: { name: "Iceland", startDate: "2026-07-12" },
  groups: [], points: [
    { id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, links: [], bookingStatus: "idea", groupId: null },
    { id: "p1", name: "Vík", type: "food", lat: 2, lng: 2, links: [], bookingStatus: "booked", groupId: null },
  ],
  days: [{ id: "d0", position: 0, title: "Vík" }],
  stops: [{ dayId: "d0", pointId: "p1", position: 1 }, { dayId: "d0", pointId: "p0", position: 0 }],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};

describe("shareModel", () => {
  it("orders stops and exposes per-day distance/time", () => {
    const days = shareDays(payload);
    expect(days[0].title).toBe("Vík");
    expect(days[0].stops.map((s) => s.name)).toEqual(["Reynisfjara", "Vík"]);
    expect(days[0].distanceM).toBe(187000);
  });
});
