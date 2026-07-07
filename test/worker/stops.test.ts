import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points } from "../../src/worker/db/schema";
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

  it("404s for a day on someone else's trip", async () => {
    const app = appWith("bob", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0"] }),
    }));
    expect(res.status).toBe(404);
  });
});
