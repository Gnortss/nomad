import { describe, it, expect } from "vitest";
import { markerStyle } from "../../src/client/editor/markers";

describe("markerStyle", () => {
  it("idea = dashed thin ring at 88% opacity", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "idea", focused: false, dimmed: false });
    expect(s).toMatchObject({ fill: "#C64A3B", ringStyle: "dashed", ringWidth: 1.5, opacity: 0.88, showCheck: false, scale: 1 });
  });
  it("booked = solid 2px ring + check badge, full opacity", () => {
    const s = markerStyle({ groupColor: "#1E2A2C", bookingStatus: "booked", focused: false, dimmed: false });
    expect(s).toMatchObject({ ringStyle: "solid", ringWidth: 2, showCheck: true, opacity: 1 });
  });
  it("focused day scales up", () => {
    expect(markerStyle({ groupColor: "#1E2A2C", bookingStatus: "to_book", focused: true, dimmed: false }).scale).toBe(1.12);
  });
  it("dimmed overrides status opacity and desaturates", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "booked", focused: false, dimmed: true });
    expect(s.opacity).toBe(0.32);
    expect(s.grayscale).toBe(0.6);
  });
});
