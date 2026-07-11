import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ id: "t1" }) }));
let isMobile = false;
vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => isMobile }));
vi.mock("@vis.gl/react-google-maps", () => ({ APIProvider: ({ children }: any) => <div>{children}</div>, Map: () => <div data-testid="map" /> }));
vi.mock("../../src/client/lib/api", () => ({
  useTrip: () => ({ data: {
    trip: { id: "t1", name: "Iceland", currency: "EUR", fuelLPer100km: null, fuelPricePerL: null, vehicle: "car" as const, evRangeKm: null, avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null },
    groups: [], points: [{ id: "p0", tripId: "t1", name: "P", lat: 1, lng: 1, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null }], days: [], dayStops: [], routes: [],
    stats: { totalDistanceM: 214000, totalDurationS: 11400, totalFuel: null, perDay: {} },
  }, isPending: false }),
  useMoveStop: () => ({ mutate: vi.fn() }),
  useAttachStop: () => ({ mutate: vi.fn() }),
  useCreatePoint: () => ({ mutate: vi.fn() }),
  usePatchTrip: () => ({ mutate: vi.fn() }),
  useDeleteTrip: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../src/client/editor/DayRail", () => ({ DayRail: () => <div data-testid="rail" /> }));
vi.mock("../../src/client/editor/Pool", () => ({ Pool: () => <div data-testid="pool" />, StopCard: () => null }));
vi.mock("../../src/client/editor/DetailPanel", () => ({ DetailPanel: () => null }));
vi.mock("../../src/client/map/MapLayer", () => ({ MapLayer: () => null }));

import { TripEditorScreen } from "../../src/client/screens/TripEditor";

describe("TripEditor layout", () => {
  it("renders one map, the rail, and the trip stats", () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><TripEditorScreen /></MemoryRouter></QueryClientProvider>);
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(screen.getByTestId("rail")).toBeTruthy();
    expect(screen.getByDisplayValue("Iceland")).toBeTruthy(); // trip name is now an inline-edit input
    expect(screen.getByText(/214 km/)).toBeTruthy();
  });

  it("renders the mobile layout: map + bottom sheet with rail, pool and stats", () => {
    isMobile = true;
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><TripEditorScreen /></MemoryRouter></QueryClientProvider>);
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(screen.getByLabelText("Resize day list")).toBeTruthy(); // BottomSheet handle
    expect(screen.getByTestId("rail")).toBeTruthy();
    expect(screen.getByTestId("pool")).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy(); // stats in the sheet header
    isMobile = false;
  });
});
