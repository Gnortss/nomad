import type { TripDetail } from "../lib/types";

export type SharePoint = { id: string; name: string; type: string; lat: number; lng: number; googlePlaceId: string | null; links: { label: string; url: string }[]; bookingStatus: string; groupId: string | null };
export type SharePayload = {
  trip: { name: string; startDate: string | null };
  groups: { id: string; name: string; color: string | null }[];
  points: SharePoint[];
  days: { id: string; position: number; title: string | null }[];
  stops: { dayId: string; pointId: string; position: number; inRoute: boolean }[];
  routes: Record<string, { polyline: string; distanceM: number; durationS: number }>;
  stats: { totalDistanceM: number; totalDurationS: number; perDay: Record<string, { distanceM: number; durationS: number }> };
};

// Adapts the public payload to the TripDetail shape MapCamera/MapLayer render,
// filling the privately-omitted fields with neutral defaults.
export function shareToTripDetail(payload: SharePayload): TripDetail {
  return {
    trip: {
      id: "", name: payload.trip.name, startDate: payload.trip.startDate, currency: "EUR",
      fuelLPer100km: null, fuelPricePerL: null, vehicle: "car", evRangeKm: null,
      avoidTolls: false, allowFerries: true, mapLat: null, mapLng: null,
    },
    groups: payload.groups.map((g) => ({ ...g, tripId: "", dayId: null })),
    points: payload.points.map((p) => ({ ...p, tripId: "", notes: null, estCost: null, costBasis: null })),
    days: payload.days.map((d) => ({ ...d, tripId: "" })),
    dayStops: payload.stops,
    routes: Object.entries(payload.routes).map(([dayId, r]) => ({ dayId, ...r, waypointsHash: "", computedAt: 0 })),
    stats: {
      totalDistanceM: payload.stats.totalDistanceM, totalDurationS: payload.stats.totalDurationS, totalFuel: null,
      perDay: Object.fromEntries(Object.entries(payload.stats.perDay).map(([id, s]) => [id, { ...s, fuel: null, warnLongDay: false }])),
    },
  };
}
