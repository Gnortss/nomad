import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ token: "tok1" }) }));
vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: any) => <div>{children}</div>,
  Map: ({ children }: any) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({ children, title }: any) => <div data-testid="marker" title={title}>{children}</div>,
  useMap: () => null,
  useMapsLibrary: () => null,
}));
const payload = {
  trip: { name: "Iceland Ring Road", startDate: "2026-07-12" }, groups: [],
  points: [
    { id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, googlePlaceId: null, links: [], bookingStatus: "idea", groupId: null },
    { id: "p1", name: "Hótel Katla", type: "hotel", lat: 2, lng: 2, googlePlaceId: null, links: [], bookingStatus: "booked", groupId: null },
    { id: "p2", name: "Dettifoss", type: "viewpoint", lat: 3, lng: 3, googlePlaceId: null, links: [], bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", position: 0, title: "Vík" }],
  stops: [{ dayId: "d0", pointId: "p0", position: 0, inRoute: true }, { dayId: "d0", pointId: "p1", position: 1, inRoute: false }],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};
vi.mock("../../src/client/lib/api", async (orig) => ({
  ...(await orig<any>()),
  getShare: vi.fn(async () => payload),
  useSharePlaceInfo: () => ({ data: { status: "none" } }), // hook mocked — the panel is exercised in share-point-panel.test
}));

import { ShareView } from "../../src/client/share/ShareView";

const wrap = () => render(<QueryClientProvider client={new QueryClient()}><ShareView /></QueryClientProvider>);

describe("ShareView", () => {
  it("renders the editor-style shell with view-only chrome and zero edit affordances", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Iceland Ring Road")).toBeTruthy());
    expect(screen.getByText(/view only/i)).toBeTruthy();
    expect(screen.getByText("Vík")).toBeTruthy();                                   // day rail renders the day
    expect(screen.getByText("Dettifoss")).toBeTruthy();                             // unassigned pool renders read-only
    expect(screen.queryByRole("button", { name: /add day/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /search a place/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /drop a pin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /refine day/i })).toBeNull();       // no AI planner
    expect(screen.queryByRole("button", { name: /assign to day/i })).toBeNull();
    expect(screen.queryByText(/DRAG →/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();                               // nothing editable anywhere
  });

  it("clicking a stop in the rail opens the read-only detail panel", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Vík")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Toggle stops"));
    fireEvent.click(screen.getByText("Reynisfjara"));
    expect(screen.getByText("Day 1 — Vík")).toBeTruthy();       // day line
    expect(screen.getByText("Idea")).toBeTruthy();              // booking word
    expect(screen.getByText(/open in google maps/i)).toBeTruthy();
    expect(screen.queryByText(/delete stop/i)).toBeNull();
    fireEvent.click(screen.getByLabelText("Close details"));
    expect(screen.queryByText("Day 1 — Vík")).toBeNull();
  });

  it("marks attached stops as off route in the panel", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Vík")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Toggle stops"));
    fireEvent.click(screen.getByText("Hótel Katla"));
    expect(screen.getByText(/off route/i)).toBeTruthy();
    expect(screen.getByText("Booked")).toBeTruthy();
  });

  it("mounts a map marker for every shared point", async () => {
    wrap();
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(3));
  });
});
