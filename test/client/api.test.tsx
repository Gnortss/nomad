import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getTrip, putStops, createTrip, deleteTrip, useMoveStop, usePutStops } from "../../src/client/lib/api";
import type { TripDetail } from "../../src/client/lib/types";

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

  it("deleteTrip DELETEs and resolves on 204", async () => {
    const f = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", f);
    await expect(deleteTrip("t1")).resolves.toBeUndefined();
    expect(f.mock.calls[0][0]).toBe("/api/trips/t1");
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(createTrip("X")).rejects.toThrow();
  });
});

describe("optimistic stop moves", () => {
  const detail = {
    trip: { id: "t1", name: "Iceland" },
    groups: [], points: [], days: [], routes: [],
    dayStops: [
      { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
      { dayId: "d0", pointId: "p1", position: 1, inRoute: true },
    ],
    stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
  } as unknown as TripDetail;
  const ok = () => new Response(JSON.stringify({ stops: [], routes: {}, routeStatus: {} }), { status: 200 });

  // fetch stub whose responses are resolved manually, so tests can assert
  // cache state while the PUTs are still in flight.
  function deferFetch() {
    const resolvers: ((r: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((res) => resolvers.push(res))));
    return resolvers;
  }
  function setup<T>(hook: (tripId: string) => T) {
    const qc = new QueryClient();
    qc.setQueryData(["trip", "t1"], detail);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => hook("t1"), { wrapper });
    const stops = () => qc.getQueryData<TripDetail>(["trip", "t1"])!.dayStops;
    return { qc, result, stops };
  }

  it("useMoveStop rewrites the cache before the server responds", async () => {
    const resolvers = deferFetch();
    const { result, stops } = setup(useMoveStop);
    act(() => result.current.mutate({ fromDayId: "d0", fromPointIds: ["p0"], toDayId: "d1", toPointIds: ["p1"] }));
    await waitFor(() => expect(stops()).toEqual([
      { dayId: "d0", pointId: "p0", position: 0, inRoute: true },
      { dayId: "d1", pointId: "p1", position: 0, inRoute: true },
    ]));
    expect(resolvers).toHaveLength(1); // first PUT still in flight
    resolvers[0](ok());
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1](ok());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("useMoveStop rolls back the cache when a PUT fails", async () => {
    const resolvers = deferFetch();
    const { result, stops } = setup(useMoveStop);
    act(() => result.current.mutate({ fromDayId: "d0", fromPointIds: ["p0"], toDayId: "d1", toPointIds: ["p1"] }));
    await waitFor(() => expect(stops()).toContainEqual({ dayId: "d1", pointId: "p1", position: 0, inRoute: true }));
    resolvers[0](new Response("nope", { status: 500 }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(stops()).toEqual(detail.dayStops);
  });

  it("usePutStops rewrites the cache before the server responds", async () => {
    const resolvers = deferFetch();
    const { result, stops } = setup(usePutStops);
    act(() => result.current.mutate({ dayId: "d0", pointIds: ["p1", "p0"] }));
    await waitFor(() => expect(stops()).toEqual([
      { dayId: "d0", pointId: "p1", position: 0, inRoute: true },
      { dayId: "d0", pointId: "p0", position: 1, inRoute: true },
    ]));
    resolvers[0](ok());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("usePutStops rolls back the cache when the PUT fails", async () => {
    const resolvers = deferFetch();
    const { result, stops } = setup(usePutStops);
    act(() => result.current.mutate({ dayId: "d0", pointIds: ["p1", "p0"] }));
    await waitFor(() => expect(stops()[0]).toEqual({ dayId: "d0", pointId: "p1", position: 0, inRoute: true }));
    resolvers[0](new Response("nope", { status: 500 }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(stops()).toEqual(detail.dayStops);
  });
});
