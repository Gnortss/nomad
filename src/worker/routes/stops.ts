import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { getDb, days, dayStops, dayRoutes, trips } from "../db/schema";
import { rewritePositions } from "../lib/positions";
import { reconcileDayRoutes } from "../lib/reconcile";
import { googleRouteComputer, type RouteComputer } from "../lib/routes-google";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };

export function makeStopsRouter(computeOverride?: RouteComputer) {
  const r = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

  r.put("/api/days/:did/stops", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const did = c.req.param("did");
    const owner = (await db.select({ tripId: days.tripId, userId: trips.userId })
      .from(days).innerJoin(trips, eq(days.tripId, trips.id)).where(eq(days.id, did)).limit(1))[0];
    if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);

    const { pointIds } = await c.req.json<{ pointIds: string[] }>();
    const positions = rewritePositions(pointIds ?? []);
    await db.delete(dayStops).where(eq(dayStops.dayId, did));
    if (positions.length)
      await db.insert(dayStops).values(positions.map((p) => ({ dayId: did, pointId: p.pointId, position: p.position })));

    const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
    const routeStatus = await reconcileDayRoutes(db, owner.tripId, compute);

    const stops = await db.select().from(dayStops).where(eq(dayStops.dayId, did)).orderBy(asc(dayStops.position));
    const routeRows = await db.select().from(dayRoutes);
    const routes: Record<string, { distanceM: number; durationS: number; polyline: string } | null> = {};
    for (const rr of routeRows) routes[rr.dayId] = { distanceM: rr.distanceM, durationS: rr.durationS, polyline: rr.polyline };
    return c.json({ stops, routes, routeStatus });
  });

  return r;
}
