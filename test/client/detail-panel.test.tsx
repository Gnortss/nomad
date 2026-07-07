import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";
import { DetailPanel } from "../../src/client/editor/DetailPanel";
import type { TripDetail } from "../../src/client/lib/types";

const patch = vi.fn(async () => ({}));
vi.mock("../../src/client/lib/api", () => ({ usePatchPoint: () => ({ mutateAsync: patch }) }));

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B" }],
  points: [{ id: "p0", tripId: "t1", name: "Jökulsárlón", lat: 1, lng: 1, type: "viewpoint", notes: "Boat tour", links: [{ label: "site", url: "https://x" }], estCost: 59, costBasis: "per_person", bookingStatus: "booked", groupId: "g1" }],
  days: [], dayStops: [], routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

function Harness() {
  const { selectPoint } = useEditorStore();
  return <><button onClick={() => selectPoint("p0")}>sel</button><DetailPanel detail={detail} /></>;
}

describe("DetailPanel", () => {
  it("shows point details and PATCHes booking status", async () => {
    render(<EditorStoreProvider><Harness /></EditorStoreProvider>);
    fireEvent.click(screen.getByText("sel"));
    expect(screen.getByText("Jökulsárlón")).toBeTruthy();
    expect(screen.getByText("€59 / person")).toBeTruthy();
    expect(screen.getByText("must-see")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^to book$/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ id: "p0", body: { bookingStatus: "to_book" } }));
  });
});
