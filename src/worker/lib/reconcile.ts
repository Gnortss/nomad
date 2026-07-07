import { asc, eq } from "drizzle-orm";
import { getDb, days, dayStops, points, dayRoutes } from "../db/schema";
import { dayWaypoints, waypointsHash, type Coord } from "./waypoints";
import type { RouteComputer } from "./routes-google";

type Db = ReturnType<typeof getDb>;
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

async function orderedStopCoords(db: Db, dayId: string): Promise<Coord[]> {
  const rows = await db.select({ lat: points.lat, lng: points.lng })
    .from(dayStops).innerJoin(points, eq(dayStops.pointId, points.id))
    .where(eq(dayStops.dayId, dayId)).orderBy(asc(dayStops.position));
  return rows.map((r) => ({ lat: r.lat, lng: r.lng }));
}

export async function reconcileDayRoutes(
  db: Db, tripId: string, compute: RouteComputer,
): Promise<Record<string, "ok" | "stale" | "failed">> {
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

    const hash = await waypointsHash(wp, "DRIVE");
    const cached = (await db.select().from(dayRoutes).where(eq(dayRoutes.dayId, day.id)).limit(1))[0];
    const fresh = cached && cached.waypointsHash === hash && Date.now() - cached.computedAt < THIRTY_DAYS;
    if (fresh) { status[day.id] = "ok"; continue; }

    try {
      const r = await compute(wp);
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
