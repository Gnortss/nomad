import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, afterEach } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { DayMenu } from "../../src/client/editor/DayMenu";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null, vehicle: "car" as const, evRangeKm: null, avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null },
  groups: [],
  points: [{ id: "p0", tripId: "t1", name: "Dettifoss", lat: 1, lng: 1, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null }],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" }],
  dayStops: [],
  routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}><EditorStoreProvider>{ui}</EditorStoreProvider></QueryClientProvider>
);

const origRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
  Element.prototype.getBoundingClientRect = origRect;
  delete (HTMLElement.prototype as any).offsetHeight;
});

describe("DayMenu positioning", () => {
  it("clamps the popover so it stays inside the viewport when the trigger is near the bottom", () => {
    // Trigger sits near the bottom of the 768px-tall jsdom viewport.
    Element.prototype.getBoundingClientRect = () =>
      ({ top: 726, bottom: 750, left: 240, right: 300, width: 60, height: 24, x: 240, y: 726, toJSON: () => ({}) }) as DOMRect;
    // Menu renders 200px tall.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 200 });

    wrap(<DayMenu detail={detail} pointId="p0" />);
    fireEvent.click(screen.getByRole("button", { name: /assign to day/i }));

    const menu = screen.getByText(/Day 1 — A/, { selector: "button" }).parentElement as HTMLElement;
    const top = parseFloat(menu.style.top);
    expect(top + 200).toBeLessThanOrEqual(window.innerHeight - 8); // fully visible, with margin
    expect(top).toBeGreaterThanOrEqual(8);
  });
});
