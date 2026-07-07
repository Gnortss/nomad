import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points, dayStops, dayRoutes } from "../../src/worker/db/schema";
import { shareRouter } from "../../src/worker/routes/share";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", startDate: "2026-07-12", vehicleNotes: "secret van", fuelLPer100km: 8, fuelPricePerL: 1.9, createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(points).values({ id: "p0", tripId: "t1", name: "P", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "booked", estCost: 99, costBasis: "per_night", createdAt: now });
  await getDb(env).insert(dayStops).values({ dayId: "d0", pointId: "p0", position: 0 });
  await getDb(env).insert(dayRoutes).values({ dayId: "d0", waypointsHash: "h", polyline: "poly", distanceM: 200000, durationS: 7200, computedAt: now });
});

describe("share", () => {
  it("mints a token then serves a public payload with fuel/cost stripped", async () => {
    const owner = appWith("alice", shareRouter);
    const { shareToken } = await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "POST" }))).json<{ shareToken: string }>();
    expect(shareToken).toHaveLength(21);

    const anon = appWith(null, shareRouter);
    const res = await call(anon, new Request(`http://x/s/${shareToken}`));
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.trip.name).toBe("Iceland");
    expect(body.trip.vehicleNotes).toBeUndefined();       // stripped
    expect(body.stats.totalFuel).toBeUndefined();         // no fuel in share
    expect(body.points[0].estCost).toBeUndefined();       // cost stripped
    expect(body.points[0].bookingStatus).toBe("booked");  // status kept
    expect(body.routes.d0.polyline).toBe("poly");
    expect(body.stats.totalDistanceM).toBe(200000);
  });

  it("rotating the token kills the old link", async () => {
    const owner = appWith("alice", shareRouter);
    const first = (await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "POST" }))).json<{ shareToken: string }>()).shareToken;
    const rotated = (await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "DELETE" }))).json<{ shareToken: string }>()).shareToken;
    expect(rotated).not.toBe(first);
    const anon = appWith(null, shareRouter);
    expect((await call(anon, new Request(`http://x/s/${first}`))).status).toBe(404);
    expect((await call(anon, new Request(`http://x/s/${rotated}`))).status).toBe(200);
  });
});
