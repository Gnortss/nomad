import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));
vi.mock("../../src/client/lib/api", () => ({
  usePatchTrip: () => ({ mutate: vi.fn() }),
  useDeleteTrip: () => ({
    mutate: (id: string, opts?: { onSuccess?: () => void }) => { deleteMutate(id); opts?.onSuccess?.(); },
    isPending: false,
  }),
}));

import { TopBar } from "../../src/client/editor/TopBar";

const wrap = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <TopBar tripId="t1" tripName="Iceland" stats="3 days" onShare={() => {}} />
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
