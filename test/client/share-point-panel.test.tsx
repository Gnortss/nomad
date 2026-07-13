import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";
import type { TripDetail } from "../../src/client/lib/types";

vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => false }));
// The hook itself is mocked (not the fetcher): inside the real module the hook
// calls its module-local getSharePlaceInfo, which a partial mock can't intercept.
vi.mock("../../src/client/lib/api", async (orig) => ({
  ...(await orig<any>()),
  useSharePlaceInfo: (_token: string, _pointId: string, enabled: boolean) => ({
    data: enabled
      ? { status: "ok", place: { formattedAddress: "Reynisfjara, Iceland", rating: 4.8, userRatingCount: 1234, weekdayHours: [], websiteUri: "https://example.is", phone: null } }
      : undefined,
  }),
}));

import { SharePointPanel } from "../../src/client/share/SharePointPanel";

const detail: TripDetail = {
  trip: { id: "", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null, vehicle: "car" as const, evRangeKm: null, avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null },
  groups: [{ id: "g1", tripId: "", name: "Beaches", color: "#2C6E8A", dayId: null }],
  points: [
    { id: "p0", tripId: "", name: "Reynisfjara", lat: 1, lng: 1, googlePlaceId: "gp0", type: "viewpoint", notes: null, links: [{ label: "Guide", url: "https://g.example" }], estCost: null, costBasis: null, bookingStatus: "to_book", groupId: "g1" },
    { id: "p1", tripId: "", name: "Hótel Katla", lat: 2, lng: 2, googlePlaceId: null, type: "hotel", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "booked", groupId: null },
    { id: "p2", tripId: "", name: "Dettifoss", lat: 3, lng: 3, googlePlaceId: null, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "", position: 0, title: "South Coast" }],
  dayStops: [
    { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
    { dayId: "d0", pointId: "p1", position: 1, inRoute: false },
  ],
  routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

function Select({ id }: { id: string }) {
  const { selectPoint } = useEditorStore();
  useEffect(() => selectPoint(id), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
const wrap = (id: string) => render(
  <QueryClientProvider client={new QueryClient()}>
    <EditorStoreProvider readOnly>
      <Select id={id} />
      <SharePointPanel detail={detail} token="tok1" />
    </EditorStoreProvider>
  </QueryClientProvider>
);

describe("SharePointPanel", () => {
  it("shows name, type, group, day, booking, links — and no edit controls", () => {
    wrap("p0");
    expect(screen.getByText("Reynisfjara")).toBeTruthy();
    expect(screen.getByText("Viewpoint")).toBeTruthy();
    expect(screen.getByText("Beaches")).toBeTruthy();
    expect(screen.getByText("Day 1 — South Coast")).toBeTruthy();
    expect(screen.getByText("To book")).toBeTruthy();
    expect(screen.getByText("Guide")).toBeTruthy();               // link card, read-only
    expect(screen.queryByRole("textbox")).toBeNull();             // no name/notes/cost inputs
    expect(screen.queryByText(/delete stop/i)).toBeNull();
    expect(screen.queryByText(/add link/i)).toBeNull();
    expect(screen.queryByText(/est\. cost/i)).toBeNull();         // private, never shown
    expect(screen.queryByText(/notes/i)).toBeNull();
  });

  it("renders the PLACE card from the share-scoped place info", () => {
    wrap("p0");
    expect(screen.getByText("Reynisfjara, Iceland")).toBeTruthy();
    expect(screen.getByText(/4\.8/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Website" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open in google maps/i })).toBeTruthy();
  });

  it("marks attached stops as off route and unassigned ones as Unassigned", () => {
    wrap("p1");
    expect(screen.getByText(/off route/i)).toBeTruthy();
    wrap("p2");
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.queryByText(/links/i)).toBeNull(); // section omitted without links
  });
});
