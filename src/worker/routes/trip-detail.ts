import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { getDb, trips, groups, points, days, dayStops, dayRoutes } from "../db/schema";
import { requireTrip } from "../lib/ownership";
import { dayFuelCost } from "../lib/fuel";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const tripDetailRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

const LONG_DAY_S = 9 * 3600;

tripDetailRouter.get("/api/trips/:id", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const db = getDb(c.env);
  const full = (await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1))[0];

  const [grp, pts, dys] = await Promise.all([
    db.select().from(groups).where(eq(groups.tripId, trip.id)),
    db.select().from(points).where(eq(points.tripId, trip.id)),
    db.select().from(days).where(eq(days.tripId, trip.id)),
  ]);
  const dayIds = dys.map((d) => d.id);
  const stops = dayIds.length ? await db.select().from(dayStops).where(inArray(dayStops.dayId, dayIds)) : [];
  const routes = dayIds.length ? await db.select().from(dayRoutes).where(inArray(dayRoutes.dayId, dayIds)) : [];

  const perDay: Record<string, { distanceM: number; durationS: number; fuel: number | null; warnLongDay: boolean }> = {};
  let totalDistanceM = 0, totalDurationS = 0, totalFuel: number | null = null;
  for (const r of routes) {
    const fuel = dayFuelCost(r.distanceM, full.fuelLPer100km, full.fuelPricePerL);
    perDay[r.dayId] = { distanceM: r.distanceM, durationS: r.durationS, fuel, warnLongDay: r.durationS > LONG_DAY_S };
    totalDistanceM += r.distanceM; totalDurationS += r.durationS;
    if (fuel != null) totalFuel = (totalFuel ?? 0) + fuel;
  }

  return c.json({
    trip: full,
    groups: grp,
    points: pts.map((p) => ({ ...p, links: p.links ? JSON.parse(p.links) : [] })),
    days: dys,
    dayStops: stops,
    routes,
    stats: { totalDistanceM, totalDurationS, totalFuel, perDay },
  });
});
