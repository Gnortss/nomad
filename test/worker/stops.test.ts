import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb, trips, days, points, dayStops } from "../../src/worker/db/schema";
import { makeStopsRouter } from "../../src/worker/routes/stops";
import { appWith } from "../helpers/session";

const fakeComputer = async () => ({ polyline: "poly", distanceM: 214000, durationS: 11400 });

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seed() {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(points).values([
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
  ]);
}

describe("PUT stops", () => {
  beforeEach(seed);

  it("assigns ordered stops and returns the computed route", async () => {
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json<{ stops: any[]; routeStatus: Record<string, string>; routes: Record<string, any> }>();
    expect(body.stops.map((s) => s.pointId)).toEqual(["p0", "p1"]);
    expect(body.routeStatus.d0).toBe("ok");
    expect(body.routes.d0.distanceM).toBe(214000);
  });

  it("commits stops even when routing fails (routeStatus failed)", async () => {
    const throwing = async () => { throw new Error("google down"); };
    const app = appWith("alice", makeStopsRouter(throwing));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json<{ stops: any[]; routeStatus: Record<string, string> }>();
    expect(body.stops).toHaveLength(2);          // stops persisted
    expect(body.routeStatus.d0).toBe("failed");  // route not computed
  });

  it("preserves attached stops when the route list is rewritten", async () => {
    const now = Date.now();
    await getDb(env).insert(points).values({ id: "p2", tripId: "t1", name: "Hotel", lat: 9, lng: 9, coordSource: "user", type: "hotel", bookingStatus: "idea", createdAt: now });
    await getDb(env).insert(dayStops).values({ dayId: "d0", pointId: "p2", position: 0, inRoute: false });
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p1", "p0"] }),
    }));
    expect(res.status).toBe(200);
    const rows = await getDb(env).select().from(dayStops).where(eq(dayStops.dayId, "d0"));
    expect(rows.filter((r) => r.inRoute).map((r) => r.pointId)).toEqual(["p1", "p0"]);
    expect(rows.find((r) => r.pointId === "p2")?.inRoute).toBe(false); // attached survived
  });

  it("removes a point's old row anywhere when it enters a route list", async () => {
    // p0 attached to d1; putting p0 into d0's route must not leave the d1 row behind.
    await getDb(env).insert(days).values({ id: "d1", tripId: "t1", position: 1, title: "B", notes: null, departureTime: null, targetArrivalTime: null });
    await getDb(env).insert(dayStops).values({ dayId: "d1", pointId: "p0", position: 0, inRoute: false });
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0"] }),
    }));
    expect(res.status).toBe(200);
    const rows = await getDb(env).select().from(dayStops).where(eq(dayStops.pointId, "p0"));
    expect(rows).toHaveLength(1);
    expect(rows[0].dayId).toBe("d0");
  });

  it("PATCH toggles a stop off the route (keeps position) and back on (appends)", async () => {
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    // off the route
    let res = await call(app, new Request("http://x/api/days/d0/stops/p0", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ inRoute: false }),
    }));
    expect(res.status).toBe(200);
    let row = (await getDb(env).select().from(dayStops).where(and(eq(dayStops.dayId, "d0"), eq(dayStops.pointId, "p0"))))[0];
    expect(row.inRoute).toBe(false);
    // back on: appended after p1
    res = await call(app, new Request("http://x/api/days/d0/stops/p0", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ inRoute: true }),
    }));
    expect(res.status).toBe(200);
    row = (await getDb(env).select().from(dayStops).where(and(eq(dayStops.dayId, "d0"), eq(dayStops.pointId, "p0"))))[0];
    expect(row.inRoute).toBe(true);
    const p1row = (await getDb(env).select().from(dayStops).where(and(eq(dayStops.dayId, "d0"), eq(dayStops.pointId, "p1"))))[0];
    expect(row.position).toBeGreaterThan(p1row.position);
  });

  it("DELETE unassigns a stop (route or attached) and recomputes", async () => {
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    const res = await call(app, new Request("http://x/api/days/d0/stops/p0", { method: "DELETE" }));
    expect(res.status).toBe(200);
    const rows = await getDb(env).select().from(dayStops).where(eq(dayStops.dayId, "d0"));
    expect(rows.map((r) => r.pointId)).toEqual(["p1"]);
  });

  it("POST attaches a point off-route, pulling it from wherever it sat", async () => {
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointId: "p1" }),
    }));
    expect(res.status).toBe(200);
    const rows = await getDb(env).select().from(dayStops).where(eq(dayStops.dayId, "d0"));
    const p1 = rows.find((r) => r.pointId === "p1")!;
    expect(p1.inRoute).toBe(false);           // attached, not routed
    expect(rows.find((r) => r.pointId === "p0")!.inRoute).toBe(true); // route untouched
    expect(rows.filter((r) => r.pointId === "p1")).toHaveLength(1);   // no duplicate rows
  });

  it("POST rejects a point from another trip and a missing pointId", async () => {
    const now = Date.now();
    await getDb(env).insert(trips).values({ id: "t2", userId: "alice", name: "Other", createdAt: now, updatedAt: now });
    await getDb(env).insert(points).values({ id: "px", tripId: "t2", name: "PX", lat: 9, lng: 9, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now });
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    const cross = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointId: "px" }),
    }));
    expect(cross.status).toBe(404);
    const missing = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(missing.status).toBe(400);
  });

  it("404s for a day on someone else's trip", async () => {
    const app = appWith("bob", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0"] }),
    }));
    expect(res.status).toBe(404);
  });
});
