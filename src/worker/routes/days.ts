import { Hono } from "hono";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, days, trips } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const daysRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

daysRouter.post("/api/trips/:id/days", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<{ title?: string; position?: number }>().catch(() => ({}) as { title?: string; position?: number });
  const db = getDb(c.env);
  const existing = await db.select({ position: days.position }).from(days).where(eq(days.tripId, trip.id));
  const position = b.position ?? existing.length;
  const row = {
    id: newId(), tripId: trip.id, position, title: b.title ?? null, notes: null,
    departureTime: null, targetArrivalTime: null,
  };
  await db.insert(days).values(row);
  return c.json(row, 201);
});

async function dayTrip(db: ReturnType<typeof getDb>, dayId: string) {
  const rows = await db.select({ dayId: days.id, tripId: days.tripId, position: days.position, userId: trips.userId })
    .from(days).innerJoin(trips, eq(days.tripId, trips.id)).where(eq(days.id, dayId)).limit(1);
  return rows[0];
}

daysRouter.patch("/api/days/:did", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await dayTrip(db, c.req.param("did"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ title?: string; notes?: string }>();
  const patch: Record<string, unknown> = {};
  if ("title" in b) patch.title = b.title;
  if ("notes" in b) patch.notes = b.notes;
  await db.update(days).set(patch).where(eq(days.id, c.req.param("did")));
  const row = (await db.select().from(days).where(eq(days.id, c.req.param("did"))).limit(1))[0];
  return c.json(row);
});

daysRouter.delete("/api/days/:did", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await dayTrip(db, c.req.param("did"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(days).where(eq(days.id, owner.dayId));
  // compact later positions so they stay contiguous
  await db.update(days).set({ position: sql`${days.position} - 1` })
    .where(and(eq(days.tripId, owner.tripId), gt(days.position, owner.position)));
  return c.body(null, 204);
});
