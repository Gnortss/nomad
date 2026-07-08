import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const createAiTrip = vi.fn();
const createTripAsync = vi.fn();
vi.mock("../../src/client/lib/aiChat", async (orig) => ({
  ...(await orig<object>()),
  createAiTrip: (body: object) => createAiTrip(body),
}));
vi.mock("../../src/client/lib/api", () => ({
  useCreateTrip: () => ({ mutateAsync: createTripAsync, isPending: false }),
}));

import { NewTripModal } from "../../src/client/components/NewTripModal";
import { AiUnconfiguredError } from "../../src/client/lib/aiChat";

const onCreated = vi.fn();
const wrap = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <NewTripModal onClose={() => {}} onCreated={onCreated} />
  </QueryClientProvider>
);

beforeEach(() => { createAiTrip.mockReset(); createTripAsync.mockReset(); onCreated.mockReset(); });

describe("NewTripModal", () => {
  it("creates via AI from a description and opens the trip", async () => {
    createAiTrip.mockResolvedValue({ tripId: "t9" });
    wrap();
    const create = screen.getByRole("button", { name: "Create trip" });
    expect((create as HTMLButtonElement).disabled).toBe(true); // needs a description

    fireEvent.change(screen.getByPlaceholderText(/Describe the trip/), { target: { value: "Dolomites, 10 days, EV" } });
    fireEvent.change(screen.getByPlaceholderText(/Trip name/), { target: { value: "Summer" } });
    fireEvent.click(create);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("t9"));
    expect(createAiTrip).toHaveBeenCalledWith({ name: "Summer", description: "Dolomites, 10 days, EV" });
  });

  it("shows the unconfigured hint and keeps the blank-trip escape hatch", async () => {
    createAiTrip.mockRejectedValue(new AiUnconfiguredError());
    createTripAsync.mockResolvedValue({ id: "blank1" });
    wrap();
    fireEvent.change(screen.getByPlaceholderText(/Describe the trip/), { target: { value: "anywhere" } });
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }));
    await screen.findByText(/isn't configured/);

    fireEvent.click(screen.getByRole("button", { name: /Skip — create a blank trip/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("blank1"));
    expect(createTripAsync).toHaveBeenCalledWith("New trip");
  });
});
