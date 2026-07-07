import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, dayRoutes } from "../../src/worker/db/schema";
import { tripDetailRouter } from "../../src/worker/routes/trip-detail";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", fuelLPer100km: 8, fuelPricePerL: 1.9, createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(dayRoutes).values({ dayId: "d0", waypointsHash: "h", polyline: "p", distanceM: 200000, durationS: 36000, computedAt: now });
});

describe("GET trip detail", () => {
  it("returns nested data + per-day/total stats with fuel and long-day warning", async () => {
    const app = appWith("alice", tripDetailRouter);
    const res = await call(app, new Request("http://x/api/trips/t1"));
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.trip.id).toBe("t1");
    expect(body.stats.totalDistanceM).toBe(200000);
    expect(body.stats.perDay.d0.fuel).toBeCloseTo(30.4, 3);       // 200km*8/100*1.9
    expect(body.stats.perDay.d0.warnLongDay).toBe(true);          // 36000s = 10h > 9h
    expect(body.stats.totalFuel).toBeCloseTo(30.4, 3);
  });

  it("404s for a non-owner", async () => {
    const app = appWith("bob", tripDetailRouter);
    expect((await call(app, new Request("http://x/api/trips/t1"))).status).toBe(404);
  });
});
