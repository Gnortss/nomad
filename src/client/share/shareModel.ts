export type SharePoint = { id: string; name: string; type: string; lat: number; lng: number; links: { label: string; url: string }[]; bookingStatus: string; groupId: string | null };
export type SharePayload = {
  trip: { name: string; startDate: string | null };
  groups: { id: string; name: string; color: string | null }[];
  points: SharePoint[];
  days: { id: string; position: number; title: string | null }[];
  stops: { dayId: string; pointId: string; position: number }[];
  routes: Record<string, { polyline: string; distanceM: number; durationS: number }>;
  stats: { totalDistanceM: number; totalDurationS: number; perDay: Record<string, { distanceM: number; durationS: number }> };
};

export function shareDays(payload: SharePayload) {
  const byId = new Map(payload.points.map((p) => [p.id, p]));
  return [...payload.days].sort((a, b) => a.position - b.position).map((d) => {
    const stops = payload.stops.filter((s) => s.dayId === d.id).sort((a, b) => a.position - b.position)
      .map((s) => byId.get(s.pointId)).filter((p): p is SharePoint => !!p);
    const r = payload.routes[d.id];
    return { ...d, stops, distanceM: r?.distanceM ?? null, durationS: r?.durationS ?? null };
  });
}
