import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { DayRail } from "../../src/client/editor/DayRail";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "Sleep options", color: "#446677", dayId: "d0" }],
  points: [
    { id: "p0", tripId: "t1", name: "Reykjavík", lat: 1, lng: 1, type: "camp", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "booked", groupId: null },
    { id: "p1", tripId: "t1", name: "Gullfoss", lat: 2, lng: 2, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
    { id: "p2", tripId: "t1", name: "Vík", lat: 3, lng: 3, type: "camp", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
    { id: "p3", tripId: "t1", name: "Hótel Borg", lat: 4, lng: 4, type: "hotel", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "booked", groupId: "g1" },
    { id: "p4", tripId: "t1", name: "Bæjarins pylsur", lat: 5, lng: 5, type: "food", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [
    { id: "d0", tripId: "t1", position: 0, title: "Golden Circle" },
    { id: "d1", tripId: "t1", position: 1, title: "South Coast" },
  ],
  dayStops: [
    { dayId: "d0", pointId: "p0", position: 0, inRoute: true }, { dayId: "d0", pointId: "p1", position: 1, inRoute: true },
    { dayId: "d0", pointId: "p3", position: 2, inRoute: false }, { dayId: "d0", pointId: "p4", position: 3, inRoute: false },
    { dayId: "d1", pointId: "p2", position: 0, inRoute: true },
  ],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 214000, durationS: 34800, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 214000, totalDurationS: 34800, totalFuel: null, perDay: { d0: { distanceM: 214000, durationS: 34800, fuel: null, warnLongDay: true }, d1: { distanceM: 80000, durationS: 5400, fuel: null, warnLongDay: false } } },
};
const wrap = () => render(<QueryClientProvider client={new QueryClient()}><EditorStoreProvider><DayRail detail={detail} /></EditorStoreProvider></QueryClientProvider>);

describe("DayRail", () => {
  it("shows day title, distance, and long-day warning", () => {
    wrap();
    expect(screen.getByText("Golden Circle")).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy();
    expect(screen.getByText(/Long day/i)).toBeTruthy();
  });
  it("clicking the day row selects without expanding", () => {
    wrap();
    fireEvent.click(screen.getByText("Golden Circle"));
    expect(screen.queryByText("Reykjavík")).toBeNull();
  });
  it("expanded day lists attached stops apart from the route, grouped by day groups", () => {
    wrap();
    fireEvent.click(screen.getAllByLabelText("Toggle stops")[0]);
    expect(screen.getByText(/Also this day/i)).toBeTruthy();
    expect(screen.getByText("Hótel Borg")).toBeTruthy();       // attached, under its group
    expect(screen.getByText("Sleep options")).toBeTruthy();    // day-scoped group header
    expect(screen.getByText("Bæjarins pylsur")).toBeTruthy();  // attached, ungrouped
    // END belongs to the last ROUTE stop, not an attached stop
    const gullfossRow = screen.getByText("Gullfoss").parentElement!;
    expect(gullfossRow.textContent).toContain("END");
    const hotelRow = screen.getByText("Hótel Borg").parentElement!;
    expect(hotelRow.textContent).not.toContain("END");
  });
  it("chevron expands stops; multiple days expand independently", () => {
    wrap();
    const chevrons = screen.getAllByLabelText("Toggle stops");
    fireEvent.click(chevrons[0]);
    expect(screen.getByText("Reykjavík")).toBeTruthy();
    expect(screen.getByText("END")).toBeTruthy();
    expect(screen.queryByText("START")).toBeNull(); // day drives start at the prior overnight, not here
    fireEvent.click(chevrons[1]);
    expect(screen.getByText("Reykjavík")).toBeTruthy(); // d0 stays expanded
    expect(screen.getByText("Vík")).toBeTruthy();
    fireEvent.click(chevrons[0]);                        // collapse d0 only
    expect(screen.queryByText("Reykjavík")).toBeNull();
    expect(screen.getByText("Vík")).toBeTruthy();
  });
});
