import type { TripDetail, Point, Day } from "./types";

const BASALT = "#16211F";

function dayPoints(detail: TripDetail, dayId: string, inRoute: boolean): Point[] {
  const byId = new Map(detail.points.map((p) => [p.id, p]));
  return detail.dayStops
    .filter((s) => s.dayId === dayId && s.inRoute === inRoute)
    .sort((a, b) => a.position - b.position)
    .map((s) => byId.get(s.pointId))
    .filter((p): p is Point => !!p);
}

// The routed sequence — what gets driven, in drive order.
export function routeStopsForDay(detail: TripDetail, dayId: string): Point[] {
  return dayPoints(detail, dayId, true);
}

// Stops that live in the day (hotel, POI options) without being waypoints.
export function attachedStopsForDay(detail: TripDetail, dayId: string): Point[] {
  return dayPoints(detail, dayId, false);
}

export function pooledPoints(detail: TripDetail): Point[] {
  const assigned = new Set(detail.dayStops.map((s) => s.pointId));
  return detail.points.filter((p) => !assigned.has(p.id));
}

export function daysWithStats(detail: TripDetail) {
  return [...detail.days]
    .sort((a, b) => a.position - b.position)
    .map((day: Day) => {
      const stat = detail.stats.perDay[day.id];
      return {
        ...day,
        stops: routeStopsForDay(detail, day.id),
        attached: attachedStopsForDay(detail, day.id),
        distanceM: stat?.distanceM ?? null,
        durationS: stat?.durationS ?? null,
        fuel: stat?.fuel ?? null,
        warnLongDay: stat?.warnLongDay ?? false,
      };
    });
}

// Optimistic rewrite: replace the ROUTE lists of the given days wholesale;
// attached rows survive unless their point moved. Filtering by moved pointIds
// too (not just affected days) mirrors the server's uniqueness invariant — a
// point placed into a target day leaves wherever it sat.
export function rewriteDayStops(detail: TripDetail, writes: { dayId: string; pointIds: string[] }[]): TripDetail {
  const affectedDays = new Set(writes.map((w) => w.dayId));
  const movedPoints = new Set(writes.flatMap((w) => w.pointIds));
  const kept = detail.dayStops.filter((s) => (!affectedDays.has(s.dayId) || !s.inRoute) && !movedPoints.has(s.pointId));
  const next = writes.flatMap((w) => w.pointIds.map((pointId, position) => ({ dayId: w.dayId, pointId, position, inRoute: true })));
  return { ...detail, dayStops: [...kept, ...next] };
}

export function groupColor(detail: TripDetail, groupId: string | null): string {
  if (!groupId) return BASALT;
  return detail.groups.find((g) => g.id === groupId)?.color ?? BASALT;
}
