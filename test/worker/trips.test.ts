import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { appWith } from "../helpers/session";
import { makeTripsRouter } from "../../src/worker/routes/trips";
import { getDb, trips, points, days, dayStops, dayRoutes } from "../../src/worker/db/schema";

const tripsRouter = makeTripsRouter();

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// Trip with one point, one day holding that point as a stop, and a computed route.
async function seedTrip(id: string, userId: string) {
  const db = getDb(env);
  const now = Date.now();
  await db.insert(trips).values({ id, userId, name: "Seed", currency: "EUR", createdAt: now, updatedAt: now });
  await db.insert(points).values({ id: `${id}-p0`, tripId: id, name: "Reykjavik", lat: 64.15, lng: -21.94, createdAt: now });
  await db.insert(days).values({ id: `${id}-d0`, tripId: id, position: 0 });
  await db.insert(dayStops).values({ dayId: `${id}-d0`, pointId: `${id}-p0`, position: 0 });
  await db.insert(dayRoutes).values({ dayId: `${id}-d0`, waypointsHash: "h", polyline: "enc", distanceM: 1000, durationS: 600, computedAt: now });
}

describe("trips", () => {
  it("creates a trip and lists only the owner's trips", async () => {
    const alice = appWith("alice", tripsRouter);
    const created = await call(alice, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Iceland" }),
    }));
    expect(created.status).toBe(201);
    const trip = await created.json<{ id: string; name: string }>();
    expect(trip.name).toBe("Iceland");

    const aliceList = await (await call(alice, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(aliceList.trips).toHaveLength(1);

    const bob = appWith("bob", tripsRouter);
    const bobList = await (await call(bob, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(bobList.trips).toHaveLength(0);
  });

  it("renames a trip for the owner only", async () => {
    const alice = appWith("alice", tripsRouter);
    const created = await call(alice, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Iceland" }),
    }));
    const trip = await created.json<{ id: string }>();

    const renamed = await call(alice, new Request(`http://x/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  Norway " }),
    }));
    expect(renamed.status).toBe(200);
    expect((await renamed.json<{ name: string }>()).name).toBe("Norway");

    const blank = await call(alice, new Request(`http://x/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    }));
    expect(blank.status).toBe(400);

    const bob = appWith("bob", tripsRouter);
    const stranger = await call(bob, new Request(`http://x/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hijack" }),
    }));
    expect(stranger.status).toBe(404);
  });

  it("lists trips with point coords and route polylines for thumbnails", async () => {
    await seedTrip("t3", "alice");
    const now = Date.now();
    await getDb(env).insert(trips).values({ id: "t4", userId: "alice", name: "Empty", currency: "EUR", createdAt: now, updatedAt: now });
    await seedTrip("t5", "bob");

    const alice = appWith("alice", tripsRouter);
    const { trips: list } = await (await call(alice, new Request("http://x/api/trips")))
      .json<{ trips: { id: string; points: unknown[]; routePolylines: string[] }[] }>();

    expect(list.map((t) => t.id).sort()).toEqual(["t3", "t4"]);
    const t3 = list.find((t) => t.id === "t3")!;
    expect(t3.points).toEqual([{ lat: 64.15, lng: -21.94 }]); // coords only, no name/id leak
    expect(t3.routePolylines).toEqual(["enc"]);
    const t4 = list.find((t) => t.id === "t4")!;
    expect(t4.points).toEqual([]);
    expect(t4.routePolylines).toEqual([]);
  });

  it("deletes a trip and cascades to its children", async () => {
    await seedTrip("t1", "alice");

    const alice = appWith("alice", tripsRouter);
    const res = await call(alice, new Request("http://x/api/trips/t1", { method: "DELETE" }));
    expect(res.status).toBe(204);

    const db = getDb(env);
    expect(await db.select().from(trips).where(eq(trips.id, "t1"))).toHaveLength(0);
    expect(await db.select().from(points).where(eq(points.tripId, "t1"))).toHaveLength(0);
    expect(await db.select().from(days).where(eq(days.tripId, "t1"))).toHaveLength(0);
    expect(await db.select().from(dayStops).where(eq(dayStops.dayId, "t1-d0"))).toHaveLength(0);
    expect(await db.select().from(dayRoutes).where(eq(dayRoutes.dayId, "t1-d0"))).toHaveLength(0);
  });

  it("404s when a stranger deletes and 401s unauthenticated", async () => {
    await seedTrip("t2", "alice");

    const bob = appWith("bob", tripsRouter);
    expect((await call(bob, new Request("http://x/api/trips/t2", { method: "DELETE" }))).status).toBe(404);

    const anon = appWith(null, tripsRouter);
    expect((await call(anon, new Request("http://x/api/trips/t2", { method: "DELETE" }))).status).toBe(401);

    expect(await getDb(env).select().from(trips).where(eq(trips.id, "t2"))).toHaveLength(1);
  });

  it("patches profile fields and recomputes routes only on constraint change", async () => {
    await seedTrip("t6", "alice");
    // A second stop so the day has >= 2 waypoints — otherwise reconcile just
    // drops the route row and never calls compute.
    await getDb(env).insert(points).values({ id: "t6-p1", tripId: "t6", name: "Vik", lat: 63.42, lng: -19.01, createdAt: Date.now() });
    await getDb(env).insert(dayStops).values({ dayId: "t6-d0", pointId: "t6-p1", position: 1 });
    let computeCalls = 0;
    const compute = async () => { computeCalls++; return { polyline: "p", distanceM: 1, durationS: 1 }; };
    const alice = appWith("alice", makeTripsRouter(compute));

    // Profile-only PATCH (vehicle/range): no constraint change → no recompute.
    const res = await call(alice, new Request("http://x/api/trips/t6", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vehicle: "ev", evRangeKm: 350 }),
    }));
    expect(res.status).toBe(200);
    const t = await res.json<{ vehicle: string; evRangeKm: number; name: string }>();
    expect(t.vehicle).toBe("ev");
    expect(t.evRangeKm).toBe(350);
    expect(t.name).toBe("Seed"); // untouched
    expect(computeCalls).toBe(0);

    // Constraint PATCH → inline reconcile under the new cache key.
    const res2 = await call(alice, new Request("http://x/api/trips/t6", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avoidTolls: true }),
    }));
    expect(res2.status).toBe(200);
    expect((await res2.json<{ avoidTolls: boolean }>()).avoidTolls).toBe(true);
    expect(computeCalls).toBeGreaterThan(0);
  });

  it("rejects invalid profile values", async () => {
    await seedTrip("t7", "alice");
    const alice = appWith("alice", tripsRouter);
    const bad = (body: object) => call(alice, new Request("http://x/api/trips/t7", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    expect((await bad({ vehicle: "boat" })).status).toBe(400);
    expect((await bad({ evRangeKm: 10 })).status).toBe(400);
    expect((await bad({ avoidTolls: "yes" })).status).toBe(400);
    expect((await bad({})).status).toBe(400); // nothing to update
  });

  it("rejects unauthenticated create", async () => {
    const anon = appWith(null, tripsRouter);
    const res = await call(anon, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    }));
    expect(res.status).toBe(401);
  });
});
