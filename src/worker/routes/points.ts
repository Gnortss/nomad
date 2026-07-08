import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { getDb, points, trips, placeDetails, apiUsage } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import { googlePlaceDetails, type PlaceDetailsFetcher } from "../lib/places";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const pointsRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

const decode = (row: typeof points.$inferSelect) => ({ ...row, links: row.links ? JSON.parse(row.links) : [] });

pointsRouter.post("/api/trips/:id/points", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<Record<string, unknown>>();
  if (!b.name || typeof b.lat !== "number" || typeof b.lng !== "number")
    return c.json({ error: "name, lat, lng required" }, 400);
  const db = getDb(c.env);
  const row = {
    id: newId(), tripId: trip.id, name: String(b.name), lat: b.lat as number, lng: b.lng as number,
    coordSource: (b.coordSource as string) ?? "user",
    coordFetchedAt: b.coordSource === "google" ? Date.now() : null,
    googlePlaceId: (b.googlePlaceId as string) ?? null,
    type: (b.type as string) ?? "poi",
    notes: (b.notes as string) ?? null,
    links: b.links ? JSON.stringify(b.links) : null,
    estCost: (b.estCost as number) ?? null,
    costBasis: (b.costBasis as string) ?? null,
    bookingStatus: (b.bookingStatus as string) ?? "idea",
    groupId: (b.groupId as string) ?? null,
    createdAt: Date.now(),
  };
  await db.insert(points).values(row);
  return c.json(decode(row as typeof points.$inferSelect), 201);
});

async function pointTrip(db: ReturnType<typeof getDb>, pointId: string) {
  const rows = await db.select({ tripId: points.tripId, userId: trips.userId })
    .from(points).innerJoin(trips, eq(points.tripId, trips.id)).where(eq(points.id, pointId)).limit(1);
  return rows[0];
}

pointsRouter.patch("/api/points/:pid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await pointTrip(db, c.req.param("pid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "type", "notes", "estCost", "costBasis", "bookingStatus", "groupId", "lat", "lng"])
    if (k in b) patch[k] = b[k];
  if ("links" in b) patch.links = b.links ? JSON.stringify(b.links) : null;
  await db.update(points).set(patch).where(eq(points.id, c.req.param("pid")));
  const row = (await db.select().from(points).where(eq(points.id, c.req.param("pid"))).limit(1))[0];
  return c.json(decode(row));
});

pointsRouter.delete("/api/points/:pid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await pointTrip(db, c.req.param("pid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(points).where(eq(points.id, c.req.param("pid")));
  return c.body(null, 204);
});

// Lazy place info for a stop: served from the D1 cache while fresh, otherwise
// one Place Details call — hard-capped per month so it can never leave the
// Google free tier. Never serves cache rows older than the TTL (Google policy).
const PLACE_TTL_MS = 30 * 24 * 3600 * 1000;
const PLACE_SKU = "place_details_enterprise";
const PLACE_BUDGET = 900; // 90% of the 1,000 free Enterprise calls/month

export function makePlaceInfoRouter(fetchOverride?: PlaceDetailsFetcher) {
  const r = new Hono<{ Bindings: AppEnv; Variables: Vars }>();
  r.get("/api/points/:pid/place", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const row = (await db.select({ userId: trips.userId, placeId: points.googlePlaceId })
      .from(points).innerJoin(trips, eq(points.tripId, trips.id))
      .where(eq(points.id, c.req.param("pid"))).limit(1))[0];
    if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);
    if (!row.placeId) return c.json({ status: "none" });

    const cached = (await db.select().from(placeDetails).where(eq(placeDetails.placeId, row.placeId)).limit(1))[0];
    if (cached && Date.now() - cached.fetchedAt < PLACE_TTL_MS)
      return c.json({ status: "ok", place: JSON.parse(cached.data) });

    const month = new Date().toISOString().slice(0, 7);
    const usage = (await db.select().from(apiUsage)
      .where(and(eq(apiUsage.month, month), eq(apiUsage.sku, PLACE_SKU))).limit(1))[0];
    if ((usage?.count ?? 0) >= PLACE_BUDGET) return c.json({ status: "budget" });

    // Count the attempt before calling: overcounts on failure, never undercounts.
    await db.insert(apiUsage).values({ month, sku: PLACE_SKU, count: 1 })
      .onConflictDoUpdate({ target: [apiUsage.month, apiUsage.sku], set: { count: sql`${apiUsage.count} + 1` } });

    const fetchPlace = fetchOverride ?? googlePlaceDetails(c.env.GOOGLE_ROUTES_KEY);
    const place = await fetchPlace(row.placeId);
    if (!place) return c.json({ status: "error" });

    const fresh = { placeId: row.placeId, data: JSON.stringify(place), fetchedAt: Date.now() };
    await db.insert(placeDetails).values(fresh)
      .onConflictDoUpdate({ target: placeDetails.placeId, set: { data: fresh.data, fetchedAt: fresh.fetchedAt } });
    return c.json({ status: "ok", place });
  });
  return r;
}
