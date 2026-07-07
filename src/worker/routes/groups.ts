import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb, groups, trips, days } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const groupsRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

// A group is day-scoped when dayId is set; the day must belong to the same trip.
async function dayInTrip(db: ReturnType<typeof getDb>, dayId: string, tripId: string) {
  return !!(await db.select({ id: days.id }).from(days)
    .where(and(eq(days.id, dayId), eq(days.tripId, tripId))).limit(1))[0];
}

groupsRouter.post("/api/trips/:id/groups", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<{ name?: string; color?: string; dayId?: string | null }>();
  if (!b.name) return c.json({ error: "name required" }, 400);
  const db = getDb(c.env);
  if (b.dayId && !(await dayInTrip(db, b.dayId, trip.id))) return c.json({ error: "invalid dayId" }, 400);
  const row = { id: newId(), tripId: trip.id, name: b.name, color: b.color ?? null, dayId: b.dayId ?? null };
  await db.insert(groups).values(row);
  return c.json(row, 201);
});

async function groupOwner(db: ReturnType<typeof getDb>, gid: string) {
  return (await db.select({ userId: trips.userId }).from(groups)
    .innerJoin(trips, eq(groups.tripId, trips.id)).where(eq(groups.id, gid)).limit(1))[0];
}

groupsRouter.patch("/api/groups/:gid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await groupOwner(db, c.req.param("gid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ name?: string; color?: string; dayId?: string | null }>();
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = b.name;
  if ("color" in b) patch.color = b.color;
  if ("dayId" in b) {
    if (b.dayId) {
      const grp = (await db.select().from(groups).where(eq(groups.id, c.req.param("gid"))).limit(1))[0];
      if (!grp || !(await dayInTrip(db, b.dayId, grp.tripId))) return c.json({ error: "invalid dayId" }, 400);
    }
    patch.dayId = b.dayId ?? null;
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "empty patch" }, 400);
  await db.update(groups).set(patch).where(eq(groups.id, c.req.param("gid")));
  return c.json((await db.select().from(groups).where(eq(groups.id, c.req.param("gid"))).limit(1))[0]);
});

groupsRouter.delete("/api/groups/:gid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await groupOwner(db, c.req.param("gid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(groups).where(eq(groups.id, c.req.param("gid")));
  return c.body(null, 204);
});
