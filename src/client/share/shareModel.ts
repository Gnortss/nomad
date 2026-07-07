export type SharePoint = { id: string; name: string; type: string; lat: number; lng: number; links: { label: string; url: string }[]; bookingStatus: string; groupId: string | null };
export type SharePayload = {
  trip: { name: string; startDate: string | null };
  groups: { id: string; name: string; color: string | null }[];
  points: SharePoint[];
  days: { id: string; position: number; title: string | null }[];
  stops: { dayId: string; pointId: string; position: number; inRoute: boolean }[];
  routes: Record<string, { polyline: string; distanceM: number; durationS: number }>;
  stats: { totalDistanceM: number; totalDurationS: number; perDay: Record<string, { distanceM: number; durationS: number }> };
};

export function shareDays(payload: SharePayload) {
  const byId = new Map(payload.points.map((p) => [p.id, p]));
  const pointsOf = (dayId: string, inRoute: boolean) =>
    payload.stops.filter((s) => s.dayId === dayId && s.inRoute === inRoute).sort((a, b) => a.position - b.position)
      .map((s) => byId.get(s.pointId)).filter((p): p is SharePoint => !!p);
  return [...payload.days].sort((a, b) => a.position - b.position).map((d) => {
    const r = payload.routes[d.id];
    return { ...d, stops: pointsOf(d.id, true), attached: pointsOf(d.id, false), distanceM: r?.distanceM ?? null, durationS: r?.durationS ?? null };
  });
}
