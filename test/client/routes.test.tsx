import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AppRoutes } from "../../src/client/routes";

vi.mock("../../src/client/lib/auth", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, isPending: false }),
  signInWithGoogle: vi.fn(), signOut: vi.fn(),
}));
vi.mock("../../src/client/screens/TripList", () => ({ TripListScreen: () => <div data-testid="trip-list" /> }));
vi.mock("../../src/client/screens/TripEditor", () => ({ TripEditorScreen: () => <div data-testid="trip-editor" /> }));
vi.mock("../../src/client/share/ShareView", () => ({ ShareView: () => <div data-testid="share-view" /> }));

function at(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe("routes", () => {
  it("renders the trip list at /trips", () => {
    expect(at("/trips").getByTestId("trip-list")).toBeTruthy();
  });
  it("renders the editor at /trips/:id", () => {
    expect(at("/trips/abc").getByTestId("trip-editor")).toBeTruthy();
  });
  it("renders the public share view at /s/:token", () => {
    expect(at("/s/tok123").getByTestId("share-view")).toBeTruthy();
  });
});
