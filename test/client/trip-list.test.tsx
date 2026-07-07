import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));
vi.mock("../../src/client/lib/api", () => ({
  useTrips: () => ({
    data: { trips: [{ id: "t1", name: "Iceland Ring Road", startDate: "2026-07-12", points: [{ lat: 64.1, lng: -21.9 }, { lat: 63.4, lng: -19.0 }], routePolylines: [] }] },
    isPending: false,
  }),
  useCreateTrip: () => ({ mutateAsync: vi.fn(async () => ({ id: "t2", name: "New" })), isPending: false }),
  useDeleteTrip: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock("../../src/client/lib/auth", () => ({ signOut: vi.fn() }));

import { TripListScreen } from "../../src/client/screens/TripList";

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
);

describe("TripList", () => {
  it("lists trips and creates+navigates on new trip", async () => {
    wrap(<TripListScreen />);
    expect(screen.getByText("Iceland Ring Road")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /new trip/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/trips/t2"));
  });

  it("opens a trip client-side when its card is clicked (no full page load)", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/trips"]}>
          <Routes>
            <Route path="/trips" element={<TripListScreen />} />
            <Route path="/trips/:id" element={<div data-testid="editor-probe" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("link", { name: /iceland ring road/i }));
    expect(screen.getByTestId("editor-probe")).toBeTruthy();
  });

  it("renders a mini-map thumbnail per card", () => {
    const { container } = wrap(<TripListScreen />);
    expect(screen.getByRole("img", { name: /trip map preview/i })).toBeTruthy();
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("deletes a trip from the card menu after confirming", () => {
    wrap(<TripListScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" })); // confirm button in dialog
    expect(deleteMutate).toHaveBeenCalledWith("t1");
  });

  it("cancel closes the dialog without deleting", () => {
    deleteMutate.mockClear();
    wrap(<TripListScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Trip actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
