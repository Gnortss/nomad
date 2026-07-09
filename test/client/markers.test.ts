import { describe, it, expect } from "vitest";
import { markerStyle } from "../../src/client/editor/markers";

describe("markerStyle", () => {
  it("idea = dashed casing, no badge", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "idea", focused: false, dimmed: false });
    expect(s).toMatchObject({ fill: "#C64A3B", casingStyle: "dashed", badge: "none", size: 32, radius: 10, casingWidth: 2.5, opacity: 1, halo: false });
  });

  it("to_book grows a sulfur corner dot; booked a moss check badge", () => {
    expect(markerStyle({ groupColor: "#16211F", bookingStatus: "to_book", focused: false, dimmed: false }).badge).toBe("toBook");
    const booked = markerStyle({ groupColor: "#16211F", bookingStatus: "booked", focused: false, dimmed: false });
    expect(booked.badge).toBe("booked");
    expect(booked.casingStyle).toBe("solid");
  });

  it("focused day = 34px; selected stop = 38px with lupine halo", () => {
    const focused = markerStyle({ groupColor: "#16211F", bookingStatus: "to_book", focused: true, dimmed: false });
    expect(focused).toMatchObject({ size: 34, iconSize: 17, halo: false });
    const selected = markerStyle({ groupColor: "#16211F", bookingStatus: "to_book", focused: true, dimmed: false, selected: true });
    expect(selected).toMatchObject({ size: 38, radius: 11, iconSize: 19, halo: true });
  });

  it("dimmed shrinks to 26px, fades, desaturates and hides badges", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "booked", focused: false, dimmed: true });
    expect(s).toMatchObject({ size: 26, radius: 8, casingWidth: 2, opacity: 0.32, grayscale: 0.6, badge: "none" });
  });

  it("stacks overlapping markers: selected > focused day > default > dimmed", () => {
    const z = (o: { focused: boolean; dimmed: boolean; selected?: boolean }) =>
      markerStyle({ groupColor: "#16211F", bookingStatus: "idea", ...o }).zIndex;
    const selected = z({ focused: true, dimmed: false, selected: true });
    const focused = z({ focused: true, dimmed: false });
    const dflt = z({ focused: false, dimmed: false });
    const dimmed = z({ focused: false, dimmed: true });
    expect(selected).toBeGreaterThan(focused);
    expect(focused).toBeGreaterThan(dflt);
    expect(dflt).toBeGreaterThan(dimmed);
  });
});
