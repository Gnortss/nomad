import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import type { TripDetail } from "../../src/client/lib/types";

// AddStop (embedded in Pool) reads the places library; not loaded in jsdom.
vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => null }));

import { Pool } from "../../src/client/editor/Pool";

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

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}><EditorStoreProvider>{ui}</EditorStoreProvider></QueryClientProvider>
);

describe("Pool", () => {
  it("lists only unassigned points with their group chip and add buttons", () => {
    wrap(<Pool detail={detail} />);
    expect(screen.getByText("Dettifoss")).toBeTruthy();
    expect(screen.queryByText("Assigned")).toBeNull();
    expect(screen.getAllByText("backup options").length).toBeGreaterThan(0);  // filter chip + point's group label
    expect(screen.getByRole("button", { name: /search a place/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /drop a pin/i })).toBeTruthy();
  });

  it("assigns a pooled point to a day via the ＋ Day menu (appended at the end)", async () => {
    const f = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(JSON.stringify({ stops: [], routes: {}, routeStatus: {} }), { status: 200 })));
    vi.stubGlobal("fetch", f);
    wrap(<Pool detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /assign to day/i }));
    fireEvent.click(screen.getByText(/Day 1 — A/, { selector: "button" }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][0]).toBe("/api/days/d0/stops");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({ pointIds: ["p1", "p0"] });
  });
});
