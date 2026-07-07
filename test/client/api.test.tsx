import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTrip, putStops, createTrip } from "../../src/client/lib/api";

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("getTrip fetches and returns JSON", async () => {
    const detail = { trip: { id: "t1" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(detail), { status: 200 })));
    const r = await getTrip("t1");
    expect((r as any).trip.id).toBe("t1");
    expect((fetch as unknown as { mock: { calls: any[][] } }).mock.calls[0][0]).toBe("/api/trips/t1");
  });

  it("putStops PUTs pointIds to the day", async () => {
    const body = { stops: [], routes: {}, routeStatus: {} };
    const f = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal("fetch", f);
    await putStops("d0", ["p0", "p1"]);
    expect(f.mock.calls[0][0]).toBe("/api/days/d0/stops");
    expect(f.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({ pointIds: ["p0", "p1"] });
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(createTrip("X")).rejects.toThrow();
  });
});
