import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));
vi.mock("../../src/client/lib/api", () => ({
  useTrips: () => ({ data: { trips: [{ id: "t1", name: "Iceland Ring Road", startDate: "2026-07-12" }] }, isPending: false }),
  useCreateTrip: () => ({ mutateAsync: vi.fn(async () => ({ id: "t2", name: "New" })), isPending: false }),
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
});
