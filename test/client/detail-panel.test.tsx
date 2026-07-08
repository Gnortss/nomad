import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";
import { DetailPanel } from "../../src/client/editor/DetailPanel";
import type { TripDetail, PlaceInfo } from "../../src/client/lib/types";

const patch = vi.fn(async () => ({}));
const patchAsync = vi.fn(async () => ({}));
const delPoint = vi.fn(async () => ({}));
const toggleRoute = vi.fn();
const createGroupAsync = vi.fn(async () => ({ id: "g9", tripId: "t1", name: "Food", color: "#C64A3B", dayId: null }));
const placeInfo = vi.fn((_id: string, _enabled: boolean): { data?: PlaceInfo } => ({}));
vi.mock("../../src/client/lib/api", () => ({
  usePatchPoint: () => ({ mutate: patch, mutateAsync: patchAsync }),
  useDeletePoint: () => ({ mutateAsync: delPoint }),
  useMoveStop: () => ({ mutate: vi.fn() }),
  useUnassignStop: () => ({ mutate: vi.fn() }),
  useToggleStopRoute: () => ({ mutate: toggleRoute }),
  useCreateGroup: () => ({ mutateAsync: createGroupAsync }),
  usePlaceInfo: (id: string, enabled: boolean) => placeInfo(id, enabled),
}));

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B", dayId: null }],
  points: [
    { id: "p0", tripId: "t1", name: "Jökulsárlón", lat: 1, lng: 1, type: "viewpoint", notes: "Boat tour", links: [{ label: "site", url: "https://x" }], estCost: 59, costBasis: "per_person", bookingStatus: "booked", groupId: "g1" },
    { id: "p1", tripId: "t1", name: "Blue Lagoon", lat: 2, lng: 3, googlePlaceId: "gp1", type: "activity", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "South" }],
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0, inRoute: true }],
  routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

function Harness() {
  const { selectPoint } = useEditorStore();
  return <><button onClick={() => selectPoint("p0")}>sel</button><button onClick={() => selectPoint("p1")}>sel1</button><DetailPanel detail={detail} /></>;
}
const open = (btn = "sel") => {
  render(<EditorStoreProvider><Harness /></EditorStoreProvider>);
  fireEvent.click(screen.getByText(btn));
};

describe("DetailPanel", () => {
  beforeEach(() => { patch.mockClear(); patchAsync.mockClear(); delPoint.mockClear(); placeInfo.mockClear(); placeInfo.mockReturnValue({}); });

  it("shows point details and PATCHes booking status", async () => {
    open();
    expect((screen.getByLabelText("Stop name") as HTMLInputElement).value).toBe("Jökulsárlón");
    expect((screen.getByLabelText("Estimated cost") as HTMLInputElement).value).toBe("59");
    expect(screen.getByText("must-see")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^to book$/i }));
    await waitFor(() => expect(patchAsync).toHaveBeenCalledWith({ id: "p0", body: { bookingStatus: "to_book" } }));
  });

  it("commits an edited name on blur", () => {
    open();
    const input = screen.getByLabelText("Stop name");
    fireEvent.change(input, { target: { value: "Glacier lagoon" } });
    fireEvent.blur(input);
    expect(patch).toHaveBeenCalledWith({ id: "p0", body: { name: "Glacier lagoon" } });
  });

  it("PATCHes the type when a type pill is clicked", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Campsite/ }));
    expect(patch).toHaveBeenCalledWith({ id: "p0", body: { type: "camp" } });
  });

  it("removes a link (PATCHes the array without it)", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /remove link site/i }));
    expect(patch).toHaveBeenCalledWith({ id: "p0", body: { links: [] } });
  });

  it("adds a link", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /add link/i }));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "https://y" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(patch).toHaveBeenCalledWith({ id: "p0", body: { links: [{ label: "site", url: "https://x" }, { label: "https://y", url: "https://y" }] } });
  });

  it("shows the On-route toggle and PATCHes the stop off the route", () => {
    open();
    const box = screen.getByLabelText("On route") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(toggleRoute).toHaveBeenCalledWith({ dayId: "d0", pointId: "p0", inRoute: false });
  });

  it("assigns and clears the group via the picker", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /no group/i }));
    expect(patch).toHaveBeenCalledWith({ id: "p0", body: { groupId: null } });
  });

  it("creates a day-scoped group and assigns the point to it", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Food" } });
    fireEvent.change(screen.getByLabelText("Group scope"), { target: { value: "d0" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(createGroupAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "Food", dayId: "d0" })));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ id: "p0", body: { groupId: "g9" } }));
  });

  it("links a pin-dropped stop to Google Maps by coords and skips the details fetch", () => {
    open();
    const link = screen.getByRole("link", { name: /open in google maps/i }) as HTMLAnchorElement;
    expect(link.href).toBe("https://www.google.com/maps/search/?api=1&query=1,1");
    expect(placeInfo).toHaveBeenCalledWith("p0", false);
  });

  it("shows fetched place details and a place-id Maps link", () => {
    placeInfo.mockReturnValue({ data: { status: "ok", place: {
      formattedAddress: "Grindavík, Iceland", rating: 4.8, userRatingCount: 34211,
      weekdayHours: ["Monday: 8 AM – 9 PM"], websiteUri: "https://example.is", phone: "+354 555 1234",
    } } });
    open("sel1");
    expect(placeInfo).toHaveBeenCalledWith("p1", true);
    expect(screen.getByText(/★ 4.8/)).toBeTruthy();
    expect(screen.getByText(/34.211 reviews/)).toBeTruthy(); // '.' spans the locale-specific group separator
    expect(screen.getByText("Grindavík, Iceland")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Website" }) as HTMLAnchorElement).href).toBe("https://example.is/");
    fireEvent.click(screen.getByText("Opening hours"));
    expect(screen.getByText("Monday: 8 AM – 9 PM")).toBeTruthy();
    const maps = screen.getByRole("link", { name: /open in google maps/i }) as HTMLAnchorElement;
    expect(maps.href).toBe("https://www.google.com/maps/search/?api=1&query=Blue%20Lagoon&query_place_id=gp1");
  });

  it("degrades to the Maps link alone when the budget cap is hit", () => {
    placeInfo.mockReturnValue({ data: { status: "budget" } });
    open("sel1");
    expect(screen.queryByText(/reviews/)).toBeNull();
    expect(screen.getByRole("link", { name: /open in google maps/i })).toBeTruthy();
  });

  it("deletes the stop after confirm and closes the panel", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    open();
    fireEvent.click(screen.getByRole("button", { name: /delete stop/i }));
    await waitFor(() => expect(delPoint).toHaveBeenCalledWith("p0"));
    await waitFor(() => expect(screen.queryByLabelText("Stop name")).toBeNull());
  });
});
