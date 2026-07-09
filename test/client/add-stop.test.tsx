import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PLACE_DETAILS_FIELDS } from "../../src/client/editor/AddStop";

const create = vi.fn(async (_body: object) => ({ id: "p9" }));
vi.mock("../../src/client/lib/api", () => ({ useCreatePoint: () => ({ mutateAsync: create }) }));

const place = { fetchFields: vi.fn(async () => {}), id: "gp1", displayName: "Gullfoss", location: { lat: () => 64.3, lng: () => -20.1 } };
const fakePlaces = {
  AutocompleteSessionToken: class {},
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: vi.fn(async () => ({
      suggestions: [{ placePrediction: { text: { text: "Gullfoss" }, placeId: "gp1", toPlace: () => place } }],
    })),
  },
};
vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => fakePlaces }));

import { AddStop } from "../../src/client/editor/AddStop";

describe("AddStop", () => {
  it("keeps the Essentials-tier field mask frozen", () => {
    expect(PLACE_DETAILS_FIELDS).toEqual(["id", "displayName", "location", "formattedAddress"]);
  });
  it("resolves a suggestion and creates a google-sourced pooled point", async () => {
    render(<AddStop tripId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /search a place/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gull" } });
    await waitFor(() => screen.getByRole("button", { name: "Gullfoss" }));
    fireEvent.click(screen.getByRole("button", { name: "Gullfoss" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Gullfoss", lat: 64.3, lng: -20.1, coordSource: "google", googlePlaceId: "gp1" }));
    expect(place.fetchFields).toHaveBeenCalledWith({ fields: ["id", "displayName", "location", "formattedAddress"] });
  });

  it("Enter picks the first suggestion", async () => {
    create.mockClear();
    render(<AddStop tripId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /search a place/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gull" } });
    await waitFor(() => screen.getByRole("button", { name: "Gullfoss" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Gullfoss", lat: 64.3, lng: -20.1, coordSource: "google", googlePlaceId: "gp1" }));
  });
});
