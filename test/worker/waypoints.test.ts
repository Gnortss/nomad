import { describe, it, expect } from "vitest";
import { dayWaypoints, waypointsHash } from "../../src/worker/lib/waypoints";

const A = { lat: 1, lng: 1 }, B = { lat: 2, lng: 2 }, C = { lat: 3, lng: 3 };

describe("dayWaypoints", () => {
  it("prepends the previous day's last stop as origin", () => {
    expect(dayWaypoints(A, [B, C])).toEqual([A, B, C]);
  });
  it("uses the day's own stops when there is no previous overnight", () => {
    expect(dayWaypoints(null, [B, C])).toEqual([B, C]);
  });
  it("returns [] when fewer than 2 points would result", () => {
    expect(dayWaypoints(null, [B])).toEqual([]);
    expect(dayWaypoints(null, [])).toEqual([]);
    expect(dayWaypoints(A, [])).toEqual([]); // origin alone is not a route
  });
  it("with a previous overnight, a single-stop day IS a route", () => {
    expect(dayWaypoints(A, [B])).toEqual([A, B]);
  });
});

describe("waypointsHash", () => {
  it("is stable and order-sensitive", async () => {
    const h1 = await waypointsHash([A, B, C], "DRIVE");
    const h2 = await waypointsHash([A, B, C], "DRIVE");
    const h3 = await waypointsHash([C, B, A], "DRIVE");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
