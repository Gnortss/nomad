import { Hono, type Context } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, days, dayStops, dayRoutes, trips } from "../db/schema";
import { rewritePositions } from "../lib/positions";
import { reconcileDayRoutes } from "../lib/reconcile";
import { googleRouteComputer, type RouteComputer } from "../lib/routes-google";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
type Db = ReturnType<typeof getDb>;
type Ctx = Context<{ Bindings: AppEnv; Variables: Vars }>;

async function requireDay(c: Ctx, db: Db, did: string) {
  const user = c.get("user");
  if (!user) return null;
  const owner = (await db.select({ tripId: days.tripId, userId: trips.userId })
    .from(days).innerJoin(trips, eq(days.tripId, trips.id)).where(eq(days.id, did)).limit(1))[0];
  if (!owner || owner.userId !== user.id) return null;
  return owner;
}

async function stopsResponse(c: Ctx, db: Db, did: string, tripId: string, compute: RouteComputer) {
  const routeStatus = await reconcileDayRoutes(db, tripId, compute);
  const stops = await db.select().from(dayStops).where(eq(dayStops.dayId, did)).orderBy(asc(dayStops.position));
  const routeRows = await db.select().from(dayRoutes);
  const routes: Record<string, { distanceM: number; durationS: number; polyline: string } | null> = {};
  for (const rr of routeRows) routes[rr.dayId] = { distanceM: rr.distanceM, durationS: rr.durationS, polyline: rr.polyline };
  return c.json({ stops, routes, routeStatus });
}

export function makeStopsRouter(computeOverride?: RouteComputer) {
  const r = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

  // Wholesale rewrite of a day's ROUTE list. Attached stops (inRoute=false) are
  // preserved, except rows for incoming pointIds, which are removed everywhere
  // so a point never sits in two days at once.
  r.put("/api/days/:did/stops", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const did = c.req.param("did");
    const owner = await requireDay(c, db, did);
    if (!owner) return c.json({ error: "not found" }, 404);

    const { pointIds } = await c.req.json<{ pointIds: string[] }>();
    const positions = rewritePositions(pointIds ?? []);
    await db.delete(dayStops).where(and(eq(dayStops.dayId, did), eq(dayStops.inRoute, true)));
    if (positions.length) {
      await db.delete(dayStops).where(inArray(dayStops.pointId, positions.map((p) => p.pointId)));
      await db.insert(dayStops).values(positions.map((p) => ({ dayId: did, pointId: p.pointId, position: p.position, inRoute: true })));
    }

    const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
    return stopsResponse(c, db, did, owner.tripId, compute);
  });

  // Toggle a stop between route waypoint and attached. Turning a stop back on
  // appends it to the end of the route; turning it off keeps its position as
  // the display order among attached stops.
  r.patch("/api/days/:did/stops/:pid", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const did = c.req.param("did");
    const pid = c.req.param("pid");
    const owner = await requireDay(c, db, did);
    if (!owner) return c.json({ error: "not found" }, 404);
    const row = (await db.select().from(dayStops).where(and(eq(dayStops.dayId, did), eq(dayStops.pointId, pid))).limit(1))[0];
    if (!row) return c.json({ error: "not found" }, 404);

    const { inRoute } = await c.req.json<{ inRoute: boolean }>();
    if (inRoute) {
      const [{ max }] = await db.select({ max: sql<number | null>`max(${dayStops.position})` })
        .from(dayStops).where(and(eq(dayStops.dayId, did), eq(dayStops.inRoute, true)));
      await db.update(dayStops).set({ inRoute: true, position: (max ?? -1) + 1 })
        .where(and(eq(dayStops.dayId, did), eq(dayStops.pointId, pid)));
    } else {
      await db.update(dayStops).set({ inRoute: false })
        .where(and(eq(dayStops.dayId, did), eq(dayStops.pointId, pid)));
    }

    const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
    return stopsResponse(c, db, did, owner.tripId, compute);
  });

  // Unassign a stop from a day, route or attached.
  r.delete("/api/days/:did/stops/:pid", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const did = c.req.param("did");
    const pid = c.req.param("pid");
    const owner = await requireDay(c, db, did);
    if (!owner) return c.json({ error: "not found" }, 404);
    await db.delete(dayStops).where(and(eq(dayStops.dayId, did), eq(dayStops.pointId, pid)));

    const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
    return stopsResponse(c, db, did, owner.tripId, compute);
  });

  return r;
}
