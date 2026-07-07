import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { DayRail } from "../../src/client/editor/DayRail";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [], points: [
    { id: "p0", tripId: "t1", name: "Reykjavík", lat: 1, lng: 1, type: "camp", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "booked", groupId: null },
    { id: "p1", tripId: "t1", name: "Gullfoss", lat: 2, lng: 2, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "Golden Circle" }],
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0 }, { dayId: "d0", pointId: "p1", position: 1 }],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 214000, durationS: 34800, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 214000, totalDurationS: 34800, totalFuel: null, perDay: { d0: { distanceM: 214000, durationS: 34800, fuel: null, warnLongDay: true } } },
};
const wrap = () => render(<EditorStoreProvider><DayRail detail={detail} /></EditorStoreProvider>);

describe("DayRail", () => {
  it("shows day title, distance, and long-day warning", () => {
    wrap();
    expect(screen.getByText("Golden Circle")).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy();
    expect(screen.getByText(/Long day/i)).toBeTruthy();
  });
  it("expands to stops with START/END on focus", () => {
    wrap();
    fireEvent.click(screen.getByText("Golden Circle"));
    expect(screen.getByText("Reykjavík")).toBeTruthy();
    expect(screen.getByText("START")).toBeTruthy();
    expect(screen.getByText("END")).toBeTruthy();
  });
});
