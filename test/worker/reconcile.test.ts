import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points, dayStops, dayRoutes } from "../../src/worker/db/schema";
import { reconcileDayRoutes } from "../../src/worker/lib/reconcile";
import { eq } from "drizzle-orm";

const db = () => getDb(env);
async function seed() {
  const now = Date.now();
  await db().insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
  await db().insert(days).values([
    { id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null },
    { id: "d1", tripId: "t1", position: 1, title: "B", notes: null, departureTime: null, targetArrivalTime: null },
  ]);
  await db().insert(points).values([
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p2", tripId: "t1", name: "P2", lat: 3, lng: 3, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
  ]);
  // day0: p0,p1  ; day1: p2  (so day1's route origin must be p1)
  await db().insert(dayStops).values([
    { dayId: "d0", pointId: "p0", position: 0 },
    { dayId: "d0", pointId: "p1", position: 1 },
    { dayId: "d1", pointId: "p2", position: 0 },
  ]);
}

describe("reconcileDayRoutes", () => {
  beforeEach(seed);

  it("computes day1 using day0's last stop as origin, and caches", async () => {
    const seenOrigins: Array<{ lat: number; lng: number }> = [];
    const compute = async (wp: Array<{ lat: number; lng: number }>) => {
      seenOrigins.push(wp[0]);
      return { polyline: "x", distanceM: 1000, durationS: 60 };
    };
    const status = await reconcileDayRoutes(db(), "t1", compute);
    expect(status.d1).toBe("ok");
    // day1's first waypoint is p1 (day0's last stop), not p2
    const day1Call = seenOrigins.find((o) => o.lat === 2);
    expect(day1Call).toBeTruthy();
    const cached = await db().select().from(dayRoutes).where(eq(dayRoutes.dayId, "d1"));
    expect(cached).toHaveLength(1);
  });

  it("only calls compute on a hash miss (second run is all cache hits)", async () => {
    let calls = 0;
    const compute = async () => { calls++; return { polyline: "x", distanceM: 1, durationS: 1 }; };
    await reconcileDayRoutes(db(), "t1", compute);
    const after = calls;
    await reconcileDayRoutes(db(), "t1", compute);
    expect(calls).toBe(after); // no new calls
  });

  it("marks a day failed but keeps other days when compute throws", async () => {
    const compute = async (wp: Array<{ lat: number; lng: number }>) => {
      if (wp[0].lat === 2) throw new Error("google down"); // fail only day1
      return { polyline: "x", distanceM: 1, durationS: 1 };
    };
    const status = await reconcileDayRoutes(db(), "t1", compute);
    expect(status.d0).toBe("ok");
    expect(status.d1).toBe("failed");
  });
});
