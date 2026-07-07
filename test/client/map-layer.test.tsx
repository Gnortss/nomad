import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";
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
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0, inRoute: true }],
  routes: [{ dayId: "d0", polyline: "_p~iF~ps|U", distanceM: 1, durationS: 1, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 1, totalDurationS: 1, totalFuel: null, perDay: { d0: { distanceM: 1, durationS: 1, fuel: null, warnLongDay: false } } },
};

describe("MapLayer", () => {
  it("renders a marker per point with its category icon", () => {
    render(<EditorStoreProvider><MapLayer detail={detail} /></EditorStoreProvider>);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(2);
    for (const m of markers) expect(m.querySelector("svg.lucide-map-pin")).toBeTruthy(); // poi glyph
  });

  it("highlights attached stops of the selected day, dims the rest", () => {
    const withAttached: TripDetail = {
      ...detail,
      points: [...detail.points,
        { id: "p2", tripId: "t1", name: "C", lat: 3, lng: 3, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
      ],
      dayStops: [...detail.dayStops, { dayId: "d0", pointId: "p1", position: 0, inRoute: false }],
    };
    function Harness() {
      const { selectDay } = useEditorStore();
      return <><button onClick={() => selectDay("d0")}>sel</button><MapLayer detail={withAttached} /></>;
    }
    render(<EditorStoreProvider><Harness /></EditorStoreProvider>);
    fireEvent.click(screen.getByText("sel"));
    const pin = (name: string) => screen.getByTitle(name).firstElementChild as HTMLElement;
    expect(pin("A").style.transform).toBe("scale(1.12)"); // route stop: focused
    expect(pin("B").style.transform).toBe("scale(1.12)"); // attached stop: focused too
    expect(pin("C").style.opacity).toBe("0.32");          // pooled point: dimmed
  });
});
