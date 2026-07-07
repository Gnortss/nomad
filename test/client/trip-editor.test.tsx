import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ id: "t1" }) }));
vi.mock("@vis.gl/react-google-maps", () => ({ APIProvider: ({ children }: any) => <div>{children}</div>, Map: () => <div data-testid="map" /> }));
vi.mock("../../src/client/lib/api", () => ({
  useTrip: () => ({ data: {
    trip: { id: "t1", name: "Iceland", currency: "EUR", fuelLPer100km: null, fuelPricePerL: null },
    groups: [], points: [], days: [], dayStops: [], routes: [],
    stats: { totalDistanceM: 214000, totalDurationS: 11400, totalFuel: null, perDay: {} },
  }, isPending: false }),
}));
vi.mock("../../src/client/editor/DayRail", () => ({ DayRail: () => <div data-testid="rail" /> }));
vi.mock("../../src/client/editor/Pool", () => ({ Pool: () => <div data-testid="pool" /> }));
vi.mock("../../src/client/editor/DetailPanel", () => ({ DetailPanel: () => null }));
vi.mock("../../src/client/map/MapLayer", () => ({ MapLayer: () => null }));

import { TripEditorScreen } from "../../src/client/screens/TripEditor";

describe("TripEditor layout", () => {
  it("renders one map, the rail, and the trip stats", () => {
    render(<QueryClientProvider client={new QueryClient()}><TripEditorScreen /></QueryClientProvider>);
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(screen.getByTestId("rail")).toBeTruthy();
    expect(screen.getByText(/Iceland/)).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy();
  });
});
