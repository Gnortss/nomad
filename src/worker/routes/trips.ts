import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, trips, points, days, dayRoutes } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

export const tripsRouter = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

tripsRouter.get("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const rows = await db.select().from(trips).where(eq(trips.userId, user.id));
  // Point coords + route polylines per trip feed the dashboard mini-map thumbnails.
  const tripIds = rows.map((t) => t.id);
  const [pts, routes] = tripIds.length
    ? await Promise.all([
        db.select({ tripId: points.tripId, lat: points.lat, lng: points.lng })
          .from(points).where(inArray(points.tripId, tripIds)),
        db.select({ tripId: days.tripId, polyline: dayRoutes.polyline })
          .from(dayRoutes).innerJoin(days, eq(dayRoutes.dayId, days.id))
          .where(inArray(days.tripId, tripIds)),
      ])
    : [[], []];
  return c.json({
    trips: rows.map((t) => ({
      ...t,
      points: pts.filter((p) => p.tripId === t.id).map((p) => ({ lat: p.lat, lng: p.lng })),
      routePolylines: routes.filter((r) => r.tripId === t.id).map((r) => r.polyline),
    })),
  });
});

tripsRouter.post("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { name } = await c.req.json<{ name?: string }>();
  if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
  const db = getDb(c.env);
  const now = Date.now();
  const row = { id: newId(), userId: user.id, name: name.trim(), currency: "EUR", createdAt: now, updatedAt: now };
  await db.insert(trips).values(row);
  return c.json(row, 201);
});

tripsRouter.patch("/api/trips/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { name } = await c.req.json<{ name?: string }>();
  if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
  const db = getDb(c.env);
  const owned = and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id));
  const [existing] = await db.select().from(trips).where(owned);
  if (!existing) return c.json({ error: "not found" }, 404);
  const updated = { ...existing, name: name.trim(), updatedAt: Date.now() };
  await db.update(trips).set({ name: updated.name, updatedAt: updated.updatedAt }).where(owned);
  return c.json(updated);
});

// Child rows (groups/points/days and their stops/routes) go with the trip via FK cascades.
tripsRouter.delete("/api/trips/:id", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  await getDb(c.env).delete(trips).where(eq(trips.id, trip.id));
  return c.body(null, 204);
});
