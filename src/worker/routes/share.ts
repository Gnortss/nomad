import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { getDb, trips, groups, points, days, dayStops, dayRoutes } from "../db/schema";
import { newShareToken } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const shareRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

shareRouter.post("/api/trips/:id/share", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const db = getDb(c.env);
  const row = (await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1))[0];
  let token = row.shareToken;
  if (!token) { token = newShareToken(); await db.update(trips).set({ shareToken: token }).where(eq(trips.id, trip.id)); }
  return c.json({ shareToken: token });
});

shareRouter.delete("/api/trips/:id/share", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const token = newShareToken();
  await getDb(c.env).update(trips).set({ shareToken: token }).where(eq(trips.id, trip.id));
  return c.json({ shareToken: token });
});

shareRouter.get("/s/:token", async (c) => {
  const db = getDb(c.env);
  const trip = (await db.select().from(trips).where(eq(trips.shareToken, c.req.param("token"))).limit(1))[0];
  if (!trip) return c.json({ error: "not found" }, 404);

  const [grp, pts, dys] = await Promise.all([
    db.select().from(groups).where(eq(groups.tripId, trip.id)),
    db.select().from(points).where(eq(points.tripId, trip.id)),
    db.select().from(days).where(eq(days.tripId, trip.id)),
  ]);
  const dayIds = dys.map((d) => d.id);
  const stops = dayIds.length ? await db.select().from(dayStops).where(inArray(dayStops.dayId, dayIds)) : [];
  const routeRows = dayIds.length ? await db.select().from(dayRoutes).where(inArray(dayRoutes.dayId, dayIds)) : [];

  const routes: Record<string, { polyline: string; distanceM: number; durationS: number }> = {};
  const perDay: Record<string, { distanceM: number; durationS: number }> = {};
  let totalDistanceM = 0, totalDurationS = 0;
  for (const r of routeRows) {
    routes[r.dayId] = { polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS };
    perDay[r.dayId] = { distanceM: r.distanceM, durationS: r.durationS };
    totalDistanceM += r.distanceM; totalDurationS += r.durationS;
  }

  // Private fields (fuel, est_cost/cost_basis, vehicle_notes, budget, user_id) are deliberately omitted.
  return c.json({
    trip: { name: trip.name, startDate: trip.startDate },
    groups: grp.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    points: pts.map((p) => ({ id: p.id, name: p.name, type: p.type, lat: p.lat, lng: p.lng,
      links: p.links ? JSON.parse(p.links) : [], bookingStatus: p.bookingStatus, groupId: p.groupId })),
    days: dys.map((d) => ({ id: d.id, position: d.position, title: d.title })),
    stops,
    routes,
    stats: { totalDistanceM, totalDurationS, perDay },
  });
});
