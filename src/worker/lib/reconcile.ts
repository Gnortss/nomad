import { and, asc, eq } from "drizzle-orm";
import { getDb, trips, days, dayStops, points, dayRoutes } from "../db/schema";
import { dayWaypoints, waypointsHash, type Coord } from "./waypoints";
import type { RouteComputer, RouteModifiers } from "./routes-google";

type Db = ReturnType<typeof getDb>;
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

// Day override wins over the trip default; UI semantics are *allow* ferries,
// the Routes API wants *avoid*.
export function effectiveModifiers(
  trip: { avoidTolls: boolean; allowFerries: boolean },
  day: { avoidTolls: boolean | null; allowFerries: boolean | null },
): Required<RouteModifiers> {
  return {
    avoidTolls: day.avoidTolls ?? trip.avoidTolls,
    avoidFerries: !(day.allowFerries ?? trip.allowFerries),
  };
}

// Cache-key mode string. The default profile must stay byte-identical to the
// historical plain "DRIVE" so existing cached polylines remain valid; tokens
// are appended only for non-default modifiers.
export function routeMode(m: Required<RouteModifiers>): string {
  return "DRIVE" + (m.avoidTolls ? "|tolls" : "") + (m.avoidFerries ? "|noferry" : "");
}

// Route stops only: attached stops (inRoute=false) belong to the day but are
// never waypoints, and never become the next day's origin.
async function orderedStopCoords(db: Db, dayId: string): Promise<Coord[]> {
  const rows = await db.select({ lat: points.lat, lng: points.lng })
    .from(dayStops).innerJoin(points, eq(dayStops.pointId, points.id))
    .where(and(eq(dayStops.dayId, dayId), eq(dayStops.inRoute, true))).orderBy(asc(dayStops.position));
  return rows.map((r) => ({ lat: r.lat, lng: r.lng }));
}

export async function reconcileDayRoutes(
  db: Db, tripId: string, compute: RouteComputer,
): Promise<Record<string, "ok" | "stale" | "failed">> {
  const [trip] = await db.select({ avoidTolls: trips.avoidTolls, allowFerries: trips.allowFerries })
    .from(trips).where(eq(trips.id, tripId)).limit(1);
  const tripDefaults = trip ?? { avoidTolls: false, allowFerries: true };
  const tripDays = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position));
  const stopsByDay = new Map<string, Coord[]>();
  for (const d of tripDays) stopsByDay.set(d.id, await orderedStopCoords(db, d.id));

  const status: Record<string, "ok" | "stale" | "failed"> = {};
  for (let i = 0; i < tripDays.length; i++) {
    const day = tripDays[i];
    const own = stopsByDay.get(day.id)!;
    const prev = i > 0 ? stopsByDay.get(tripDays[i - 1].id)! : [];
    const prevLast = prev.length ? prev[prev.length - 1] : null;
    const wp = dayWaypoints(prevLast, own);

    if (wp.length < 2) { await db.delete(dayRoutes).where(eq(dayRoutes.dayId, day.id)); continue; }

    const modifiers = effectiveModifiers(tripDefaults, day);
    const hash = await waypointsHash(wp, routeMode(modifiers));
    const cached = (await db.select().from(dayRoutes).where(eq(dayRoutes.dayId, day.id)).limit(1))[0];
    const fresh = cached && cached.waypointsHash === hash && Date.now() - cached.computedAt < THIRTY_DAYS;
    if (fresh) { status[day.id] = "ok"; continue; }

    try {
      const r = await compute(wp, modifiers);
      const row = { dayId: day.id, waypointsHash: hash, polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS, computedAt: Date.now() };
      if (cached) await db.update(dayRoutes).set(row).where(eq(dayRoutes.dayId, day.id));
      else await db.insert(dayRoutes).values(row);
      status[day.id] = "ok";
    } catch {
      status[day.id] = "failed"; // keep any stale cached row; caller surfaces retry
    }
  }
  return status;
}
