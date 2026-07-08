import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, trips, days, points, dayStops } from "../../db/schema";
import { newId } from "../id";
import type { UpsertDaysInput, UpdateTripInput, DeleteDaysInput, PlanStop } from "./plan-schema";

type Db = ReturnType<typeof getDb>;
type PointRow = typeof points.$inferSelect;
type BatchItem = Parameters<Db["batch"]>[0][number];

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

const MATCH_RADIUS_M = 250;
function distMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (aLat - bLat) * 111_320;
  const dLng = (aLng - bLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

// A point with no user-entered data may be silently deleted when the AI drops
// it; anything the user touched survives to the pool instead.
function hasUserData(p: PointRow): boolean {
  return p.bookingStatus !== "idea"
    || (p.links != null && p.links !== "[]")
    || p.estCost != null || p.costBasis != null || p.groupId != null;
}

// Greedy 1:1 matching of incoming stops to the day's existing points: each
// existing point is consumed at most once, so a day revisiting its base camp
// (two incoming stops, same placeId) yields two point rows — never two
// day_stops rows sharing a (dayId, pointId) PK. Matching is scoped to points
// currently attached to this day; points on other days are never stolen.
function matchStop(s: PlanStop, pool: Map<string, PointRow>): PointRow | null {
  for (const p of pool.values()) {
    if (s.googlePlaceId && p.googlePlaceId === s.googlePlaceId) { pool.delete(p.id); return p; }
  }
  const name = clean(s.name).toLowerCase();
  for (const p of pool.values()) {
    if (p.name.toLowerCase() === name && distMeters(s.lat, s.lng, p.lat, p.lng) <= MATCH_RADIUS_M) {
      pool.delete(p.id);
      return p;
    }
  }
  return null;
}

export type EditCounts = { daysCreated: number; daysReplaced: number; stops: number; pointsDeleted: number };

// Creates or fully replaces days at the given positions. Matched points keep
// user-owned fields (bookingStatus, links, estCost, costBasis, groupId) and get
// AI-owned ones updated (coords, type, notes, name, placeId). Unmatched incoming
// stops become new points; previously-attached points that lost their last
// day_stops reference are deleted when AI-owned and data-free, else pooled.
export async function upsertDays(db: Db, tripId: string, input: UpsertDaysInput): Promise<EditCounts> {
  const now = Date.now();
  const existingDays = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position));
  const byPosition = new Map(existingDays.map((d) => [d.position, d]));

  const stmts: BatchItem[] = [];
  const counts: EditCounts = { daysCreated: 0, daysReplaced: 0, stops: 0, pointsDeleted: 0 };
  const newPointRows: (typeof points.$inferInsert)[] = [];
  const newStopRows: (typeof dayStops.$inferInsert)[] = [];
  const maybeOrphanIds: string[] = [];

  for (const d of input.days) {
    const existing = byPosition.get(d.position);
    const dayId = existing?.id ?? newId();
    const dayFields = {
      title: clean(d.title),
      notes: cleanOrNull(d.notes),
      avoidTolls: d.avoidTolls,
      allowFerries: d.allowFerries,
    };
    if (existing) {
      counts.daysReplaced++;
      stmts.push(db.update(days).set(dayFields).where(eq(days.id, dayId)));
    } else {
      counts.daysCreated++;
      stmts.push(db.insert(days).values({ id: dayId, tripId, position: d.position, ...dayFields }));
    }

    // Points currently attached to this day are the matching pool.
    const attached = existing
      ? await db.select({ p: points }).from(dayStops)
          .innerJoin(points, eq(dayStops.pointId, points.id))
          .where(eq(dayStops.dayId, dayId))
      : [];
    const pool = new Map(attached.map((r) => [r.p.id, r.p]));

    stmts.push(db.delete(dayStops).where(eq(dayStops.dayId, dayId)));
    for (const [stopPos, s] of d.stops.entries()) {
      const matched = matchStop(s, pool);
      let pointId: string;
      if (matched) {
        pointId = matched.id;
        stmts.push(db.update(points).set({
          name: clean(s.name), lat: s.lat, lng: s.lng, type: s.type,
          notes: cleanOrNull(s.notes), googlePlaceId: s.googlePlaceId ?? matched.googlePlaceId,
          coordFetchedAt: now,
        }).where(eq(points.id, pointId)));
      } else {
        pointId = newId();
        newPointRows.push({
          id: pointId, tripId, name: clean(s.name), lat: s.lat, lng: s.lng,
          coordSource: "ai", coordFetchedAt: now, googlePlaceId: s.googlePlaceId,
          type: s.type, notes: cleanOrNull(s.notes), createdAt: now,
        });
      }
      newStopRows.push({ dayId, pointId, position: stopPos, inRoute: s.inRoute });
      counts.stops++;
    }
    // Whatever the matching didn't consume might now be orphaned.
    maybeOrphanIds.push(...[...pool.values()].filter((p) => !hasUserData(p) && p.coordSource === "ai").map((p) => p.id));
  }

  stmts.push(...chunk(newPointRows, 8).map((rows) => db.insert(points).values(rows)));
  stmts.push(...chunk(newStopRows, 20).map((rows) => db.insert(dayStops).values(rows)));
  await db.batch(stmts as [BatchItem, ...BatchItem[]]);

  counts.pointsDeleted = await deleteOrphans(db, maybeOrphanIds);
  return counts;
}

// Deletes candidate points that no longer appear in any day. Runs after the
// main batch: only then is "lost its last day_stops reference" observable.
async function deleteOrphans(db: Db, candidateIds: string[]): Promise<number> {
  if (candidateIds.length === 0) return 0;
  const stillUsed = new Set(
    (await db.select({ pointId: dayStops.pointId }).from(dayStops).where(inArray(dayStops.pointId, candidateIds)))
      .map((r) => r.pointId),
  );
  const orphans = candidateIds.filter((id) => !stillUsed.has(id));
  if (orphans.length) await db.delete(points).where(inArray(points.id, orphans));
  return orphans.length;
}

// Deletes days at the given positions and compacts the remaining ones. The
// two-phase position shift (temp offset, then final) respects the
// uq_days_trip_position unique index within a single batch transaction.
export async function deleteDays(db: Db, tripId: string, input: DeleteDaysInput): Promise<{ daysDeleted: number; pointsDeleted: number }> {
  const all = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position));
  const doomed = all.filter((d) => input.positions.includes(d.position));
  if (doomed.length === 0) return { daysDeleted: 0, pointsDeleted: 0 };
  const doomedIds = doomed.map((d) => d.id);

  // Points attached to the doomed days are orphan candidates (same rule as upsert).
  const attached = await db.select({ p: points }).from(dayStops)
    .innerJoin(points, eq(dayStops.pointId, points.id))
    .where(inArray(dayStops.dayId, doomedIds));
  const candidates = [...new Map(attached.map((r) => [r.p.id, r.p])).values()]
    .filter((p) => !hasUserData(p) && p.coordSource === "ai").map((p) => p.id);

  const survivors = all.filter((d) => !doomedIds.includes(d.id));
  const stmts: BatchItem[] = [db.delete(days).where(inArray(days.id, doomedIds))];
  for (const [i, d] of survivors.entries())
    stmts.push(db.update(days).set({ position: i + 10_000 }).where(eq(days.id, d.id)));
  for (const [i, d] of survivors.entries())
    stmts.push(db.update(days).set({ position: i }).where(eq(days.id, d.id)));
  await db.batch(stmts as [BatchItem, ...BatchItem[]]);

  const pointsDeleted = await deleteOrphans(db, candidates);
  return { daysDeleted: doomed.length, pointsDeleted };
}

// Applies non-null fields from update_trip to the trip row.
export async function updateTripProfile(db: Db, tripId: string, input: UpdateTripInput): Promise<string[]> {
  const set: Record<string, unknown> = {};
  if (input.name != null) set.name = clean(input.name);
  if (input.startDate != null) set.startDate = input.startDate;
  if (input.vehicle != null) set.vehicle = input.vehicle;
  if (input.evRangeKm != null) set.evRangeKm = Math.round(input.evRangeKm);
  if (input.avoidTolls != null) set.avoidTolls = input.avoidTolls;
  if (input.allowFerries != null) set.allowFerries = input.allowFerries;
  const fields = Object.keys(set);
  if (fields.length) {
    set.updatedAt = Date.now();
    await db.update(trips).set(set).where(eq(trips.id, tripId));
  }
  return fields;
}
