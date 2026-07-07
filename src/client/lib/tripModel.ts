import type { TripDetail, Point, Day } from "./types";

const BASALT = "#1E2A2C";

export function stopsForDay(detail: TripDetail, dayId: string): Point[] {
  const byId = new Map(detail.points.map((p) => [p.id, p]));
  return detail.dayStops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.position - b.position)
    .map((s) => byId.get(s.pointId))
    .filter((p): p is Point => !!p);
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
        stops: stopsForDay(detail, day.id),
        distanceM: stat?.distanceM ?? null,
        durationS: stat?.durationS ?? null,
        fuel: stat?.fuel ?? null,
        warnLongDay: stat?.warnLongDay ?? false,
      };
    });
}

export function groupColor(detail: TripDetail, groupId: string | null): string {
  if (!groupId) return BASALT;
  return detail.groups.find((g) => g.id === groupId)?.color ?? BASALT;
}
