import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import type { TripDetail } from "../../src/client/lib/types";

// Stub the map SDK: AdvancedMarker renders its onClick target; useMap returns null (no polyline draw in jsdom).
vi.mock("@vis.gl/react-google-maps", () => ({
  AdvancedMarker: ({ children, onClick, title }: any) => <button data-testid="marker" title={title} onClick={onClick}>{children}</button>,
  useMap: () => null,
}));

import { MapLayer } from "../../src/client/map/MapLayer";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [], points: [
    { id: "p0", tripId: "t1", name: "A", lat: 1, lng: 1, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
    { id: "p1", tripId: "t1", name: "B", lat: 2, lng: 2, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" }],
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0 }],
  routes: [{ dayId: "d0", polyline: "_p~iF~ps|U", distanceM: 1, durationS: 1, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 1, totalDurationS: 1, totalFuel: null, perDay: { d0: { distanceM: 1, durationS: 1, fuel: null, warnLongDay: false } } },
};

describe("MapLayer", () => {
  it("renders a marker per point", () => {
    render(<EditorStoreProvider><MapLayer detail={detail} /></EditorStoreProvider>);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });
});
