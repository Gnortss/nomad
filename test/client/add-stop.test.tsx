import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PLACE_DETAILS_FIELDS } from "../../src/client/editor/AddStop";

const create = vi.fn(async (_tripId: string, _body: object) => ({ id: "p9" }));
vi.mock("../../src/client/lib/api", () => ({ createPoint: (t: string, b: object) => create(t, b) }));

import { AddStop } from "../../src/client/editor/AddStop";

describe("AddStop", () => {
  it("keeps the Essentials-tier field mask frozen", () => {
    expect(PLACE_DETAILS_FIELDS).toEqual(["id", "displayName", "location", "formattedAddress"]);
  });
  it("creates a pooled point from a resolved place (via test resolver)", async () => {
    render(<AddStop tripId="t1" testResolve={async () => ({ name: "Gullfoss", lat: 64.3, lng: -20.1, googlePlaceId: "gp1" })} />);
    fireEvent.click(screen.getByRole("button", { name: /search a place/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gullfoss" } });
    fireEvent.click(screen.getByRole("button", { name: /use result/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("t1", { name: "Gullfoss", lat: 64.3, lng: -20.1, coordSource: "google", googlePlaceId: "gp1" }));
  });
});
