import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { Pool } from "../../src/client/editor/Pool";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "backup options", color: "#3E7CB1" }],
  points: [
    { id: "p0", tripId: "t1", name: "Dettifoss", lat: 1, lng: 1, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: "g1" },
    { id: "p1", tripId: "t1", name: "Assigned", lat: 2, lng: 2, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" }],
  dayStops: [{ dayId: "d0", pointId: "p1", position: 0 }],  // p1 assigned, p0 pooled
  routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

describe("Pool", () => {
  it("lists only unassigned points with their group chip and add buttons", () => {
    render(<EditorStoreProvider><Pool detail={detail} /></EditorStoreProvider>);
    expect(screen.getByText("Dettifoss")).toBeTruthy();
    expect(screen.queryByText("Assigned")).toBeNull();
    expect(screen.getAllByText("backup options").length).toBeGreaterThan(0);  // filter chip + point's group label
    expect(screen.getByRole("button", { name: /search a place/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /drop a pin/i })).toBeTruthy();
  });
});
