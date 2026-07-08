import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, trips, points, days, dayRoutes } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import { reconcileDayRoutes } from "../lib/reconcile";
import { googleRouteComputer, type RouteComputer } from "../lib/routes-google";
import type { AppEnv } from "../auth";

const VEHICLES = ["car", "ev"] as const;

// Validated PATCH fields, or an error string. Only keys present in the body are
// updated; `name` may not be blanked.
function patchFields(body: Record<string, unknown>): { set: Record<string, unknown>; constraintsChanged: boolean } | string {
  const set: Record<string, unknown> = {};
  let constraintsChanged = false;
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) return "name must be a non-empty string";
    set.name = body.name.trim();
  }
  if ("vehicle" in body) {
    if (!VEHICLES.includes(body.vehicle as (typeof VEHICLES)[number])) return "vehicle must be 'car' or 'ev'";
    set.vehicle = body.vehicle;
  }
  if ("evRangeKm" in body) {
    const v = body.evRangeKm;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 50 || v > 2000)) return "evRangeKm must be an integer 50-2000 or null";
    set.evRangeKm = v;
  }
  for (const key of ["avoidTolls", "allowFerries"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return `${key} must be a boolean`;
      set[key] = body[key];
      constraintsChanged = true;
    }
  }
  if (Object.keys(set).length === 0) return "no valid fields to update";
  return { set, constraintsChanged };
}

export function makeTripsRouter(computeOverride?: RouteComputer) {
  const tripsRouter = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

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
    const body = await c.req.json<Record<string, unknown>>();
    const fields = patchFields(body);
    if (typeof fields === "string") return c.json({ error: fields }, 400);
    const db = getDb(c.env);
    const owned = and(eq(trips.id, c.req.param("id")), eq(trips.userId, user.id));
    const [existing] = await db.select().from(trips).where(owned);
    if (!existing) return c.json({ error: "not found" }, 404);
    const updated = { ...existing, ...fields.set, updatedAt: Date.now() };
    await db.update(trips).set({ ...fields.set, updatedAt: updated.updatedAt }).where(owned);
    // Toggling tolls/ferries changes the route cache key — recompute inline so
    // the client's post-PATCH refetch already sees the new polylines.
    if (fields.constraintsChanged) {
      const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
      await reconcileDayRoutes(db, existing.id, compute);
    }
    return c.json(updated);
  });

  // Child rows (groups/points/days and their stops/routes) go with the trip via FK cascades.
  tripsRouter.delete("/api/trips/:id", async (c) => {
    const { trip, code } = await requireTrip(c, c.req.param("id"));
    if (!trip) return c.json({ error: "not found" }, code);
    await getDb(c.env).delete(trips).where(eq(trips.id, trip.id));
    return c.body(null, 204);
  });

  return tripsRouter;
}
