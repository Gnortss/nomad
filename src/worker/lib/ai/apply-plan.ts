import { getDb, trips, days, points, dayStops } from "../../db/schema";
import { newId } from "../id";
import { reconcileDayRoutes } from "../reconcile";
import type { RouteComputer } from "../routes-google";
import type { TripPlan } from "./plan-schema";

type Db = ReturnType<typeof getDb>;

// D1 caps bound parameters per statement (~100), so multi-row inserts are chunked.
function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// Strict-mode decoding occasionally garbles non-ASCII characters into control
// characters (e.g. "Soča" → "So\n\nca") — collapse all whitespace runs.
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cleanOrNull = (s: string | null) => (s == null ? null : clean(s) || null);

export type ApplyPlanResult = {
  tripId: string;
  counts: { days: number; points: number; stops: number };
  routeStatus: Record<string, "ok" | "stale" | "failed">;
};

// Writes a validated plan as one atomic D1 batch, then computes day route polylines.
// Route computation failures are tolerated — the editor recomputes on the next stops edit.
export async function applyPlan(
  db: Db,
  userId: string,
  plan: TripPlan,
  nameOverride: string | null,
  compute: RouteComputer,
): Promise<ApplyPlanResult> {
  const now = Date.now();
  const tripId = newId();

  const tripRow = {
    id: tripId,
    userId,
    name: clean(nameOverride?.trim() || plan.tripName),
    startDate: plan.startDate,
    currency: "EUR",
    createdAt: now,
    updatedAt: now,
  };

  const dayRows: (typeof days.$inferInsert)[] = [];
  const pointRows: (typeof points.$inferInsert)[] = [];
  const stopRows: (typeof dayStops.$inferInsert)[] = [];

  // Each stop occurrence gets its own point row: the editor's data model assumes
  // a point belongs to one day (stop mutations unassign a point from other days),
  // so a base camp or pass visited on two days becomes two points.
  for (const [position, d] of plan.days.entries()) {
    const dayId = newId();
    dayRows.push({ id: dayId, tripId, position, title: clean(d.title), notes: cleanOrNull(d.notes) });
    for (const [stopPos, s] of d.stops.entries()) {
      const pointId = newId();
      pointRows.push({
        id: pointId, tripId, name: clean(s.name), lat: s.lat, lng: s.lng,
        coordSource: "ai", coordFetchedAt: now, googlePlaceId: s.googlePlaceId,
        type: s.type, notes: cleanOrNull(s.notes), createdAt: now,
      });
      stopRows.push({ dayId, pointId, position: stopPos, inRoute: s.inRoute });
    }
  }

  await db.batch([
    db.insert(trips).values(tripRow),
    ...chunk(dayRows, 15).map((rows) => db.insert(days).values(rows)),
    ...chunk(pointRows, 8).map((rows) => db.insert(points).values(rows)),
    ...chunk(stopRows, 20).map((rows) => db.insert(dayStops).values(rows)),
  ]);

  const routeStatus = await reconcileDayRoutes(db, tripId, compute);
  return {
    tripId,
    counts: { days: dayRows.length, points: pointRows.length, stops: stopRows.length },
    routeStatus,
  };
}
