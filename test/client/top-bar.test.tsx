import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
const deleteMutate = vi.fn();
const patchMutate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));
let isMobile = false;
vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => isMobile }));
vi.mock("../../src/client/lib/api", () => ({
  usePatchTrip: () => ({ mutate: patchMutate, isPending: false }),
  useDeleteTrip: () => ({
    mutate: (id: string, opts?: { onSuccess?: () => void }) => { deleteMutate(id); opts?.onSuccess?.(); },
    isPending: false,
  }),
}));

import { TopBar } from "../../src/client/editor/TopBar";
import type { Trip } from "../../src/client/lib/types";

const trip: Trip = {
  id: "t1", name: "Iceland", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null,
  vehicle: "car", evRangeKm: null, avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null,
};

const wrap = (onShare: () => void = () => {}) => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <TopBar trip={trip} stats="214 km · 3 h" onShare={onShare} />
    </MemoryRouter>
  </QueryClientProvider>
);

describe("TopBar", () => {
  it("links the brand back to the dashboard", () => {
    wrap();
    expect(screen.getByRole("link", { name: "NOMAD" }).getAttribute("href")).toBe("/trips");
  });

  it("deletes after confirm and navigates to /trips", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete trip" }).at(-1)!); // dialog confirm
    expect(deleteMutate).toHaveBeenCalledWith("t1");
    expect(navigate).toHaveBeenCalledWith("/trips");
  });

  it("opens trip settings and saves the vehicle profile in one PATCH", () => {
    patchMutate.mockClear();
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Trip settings" })).toBeTruthy();

    // EV reveals the range field; tolls/ferries are plain checkboxes.
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "ev" } });
    fireEvent.change(screen.getByLabelText("EV range in km"), { target: { value: "400" } });
    fireEvent.click(screen.getByLabelText("Avoid toll roads"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(patchMutate).toHaveBeenCalledTimes(1);
    expect(patchMutate.mock.calls[0][0]).toEqual({ vehicle: "ev", evRangeKm: 400, avoidTolls: true, allowFerries: true });
  });

  it("collapses actions into a trip menu on mobile", () => {
    isMobile = true;
    wrap();
    expect(screen.queryByText("Delete trip")).toBeNull();
    expect(screen.queryByText(/214 km/)).toBeNull(); // stats live in the bottom sheet on mobile
    fireEvent.click(screen.getByLabelText("Trip menu"));
    expect(screen.getByText("Share trip")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Delete trip")).toBeTruthy();
    isMobile = false;
  });

  it("menu Share trip invokes onShare on mobile", () => {
    isMobile = true;
    const onShare = vi.fn();
    wrap(onShare);
    fireEvent.click(screen.getByLabelText("Trip menu"));
    fireEvent.click(screen.getByText("Share trip"));
    expect(onShare).toHaveBeenCalled();
    isMobile = false;
  });

  it("cancel closes without deleting or navigating", () => {
    deleteMutate.mockClear();
    navigate.mockClear();
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
