import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, points } from "../../src/worker/db/schema";
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

  it("404s creating a group on another user's trip", async () => {
    const app = appWith("bob", groupsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }),
    }));
    expect(res.status).toBe(404);
  });
});
