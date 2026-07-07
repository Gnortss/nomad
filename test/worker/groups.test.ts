import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, points, days, groups } from "../../src/worker/db/schema";
import { groupsRouter } from "../../src/worker/routes/groups";
import { appWith } from "../helpers/session";
import { eq } from "drizzle-orm";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
});

describe("groups", () => {
  it("creates a group and nulls point.group_id on delete", async () => {
    const app = appWith("alice", groupsRouter);
    const g = await (await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "must-see", color: "#C64A3B" }),
    }))).json<{ id: string }>();

    const now = Date.now();
    await getDb(env).insert(points).values({ id: "p0", tripId: "t1", name: "P", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", groupId: g.id, createdAt: now });

    await call(app, new Request(`http://x/api/groups/${g.id}`, { method: "DELETE" }));
    const p = (await getDb(env).select().from(points).where(eq(points.id, "p0")))[0];
    expect(p.groupId).toBeNull();
  });

  it("creates a day-scoped group and rejects a day from another trip", async () => {
    await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: null, notes: null, departureTime: null, targetArrivalTime: null });
    const app = appWith("alice", groupsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "day-3 food", color: "#C64A3B", dayId: "d0" }),
    }));
    expect(res.status).toBe(201);
    const g = await res.json<{ id: string; dayId: string | null }>();
    expect(g.dayId).toBe("d0");

    const bad = await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", dayId: "nope" }),
    }));
    expect(bad.status).toBe(400);
  });

  it("PATCH can scope a group to a day or back to trip-wide", async () => {
    await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: null, notes: null, departureTime: null, targetArrivalTime: null });
    await getDb(env).insert(groups).values({ id: "g1", tripId: "t1", name: "food", color: null });
    const app = appWith("alice", groupsRouter);
    let res = await call(app, new Request("http://x/api/groups/g1", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayId: "d0" }),
    }));
    expect((await res.json<{ dayId: string | null }>()).dayId).toBe("d0");
    res = await call(app, new Request("http://x/api/groups/g1", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayId: null }),
    }));
    expect((await res.json<{ dayId: string | null }>()).dayId).toBeNull();
  });

  it("404s creating a group on another user's trip", async () => {
    const app = appWith("bob", groupsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }),
    }));
    expect(res.status).toBe(404);
  });
});
