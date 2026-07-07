import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, groups, trips } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const groupsRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

groupsRouter.post("/api/trips/:id/groups", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<{ name?: string; color?: string }>();
  if (!b.name) return c.json({ error: "name required" }, 400);
  const row = { id: newId(), tripId: trip.id, name: b.name, color: b.color ?? null };
  await getDb(c.env).insert(groups).values(row);
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
  const b = await c.req.json<{ name?: string; color?: string }>();
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = b.name;
  if ("color" in b) patch.color = b.color;
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
