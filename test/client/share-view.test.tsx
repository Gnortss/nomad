import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ token: "tok1" }) }));
vi.mock("@vis.gl/react-google-maps", () => ({ APIProvider: ({ children }: any) => <div>{children}</div>, Map: () => <div data-testid="map" />, useMap: () => null }));
const payload = {
  trip: { name: "Iceland Ring Road", startDate: "2026-07-12" }, groups: [],
  points: [{ id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, links: [], bookingStatus: "idea", groupId: null }],
  days: [{ id: "d0", position: 0, title: "Vík" }], stops: [{ dayId: "d0", pointId: "p0", position: 0 }],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};
vi.mock("../../src/client/lib/api", () => ({ getShare: vi.fn(async () => payload) }));

import { ShareView } from "../../src/client/share/ShareView";

describe("ShareView", () => {
  it("renders read-only itinerary with view-only tag and no edit controls", async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText("Iceland Ring Road")).toBeTruthy());
    expect(screen.getByText(/view only/i)).toBeTruthy();
    expect(screen.getByText("1. Reynisfjara")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /share trip/i })).toBeNull();     // no edit affordances
    expect(screen.queryByText(/Refresh route/i)).toBeNull();
  });
});
