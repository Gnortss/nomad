export type Group = { id: string; tripId: string; name: string; color: string | null; dayId: string | null };
export type Point = {
  id: string; tripId: string; name: string; lat: number; lng: number;
  coordSource?: string; googlePlaceId?: string | null; type: string;
  notes: string | null; links: { label: string; url: string }[];
  estCost: number | null; costBasis: string | null; bookingStatus: string; groupId: string | null;
};
export type Day = { id: string; tripId: string; position: number; title: string | null; notes?: string | null };
export type DayStop = { dayId: string; pointId: string; position: number; inRoute: boolean };
export type DayRoute = { dayId: string; polyline: string; distanceM: number; durationS: number; waypointsHash: string; computedAt: number };
export type PerDayStat = { distanceM: number; durationS: number; fuel: number | null; warnLongDay: boolean };
export type TripStats = { totalDistanceM: number; totalDurationS: number; totalFuel: number | null; perDay: Record<string, PerDayStat> };
export type Trip = {
  id: string; name: string; startDate: string | null; currency: string;
  fuelLPer100km: number | null; fuelPricePerL: number | null;
  shareToken?: string | null; vehicleNotes?: string | null; budgetTotal?: number | null;
  vehicle: "car" | "ev"; evRangeKm: number | null; avoidTolls: boolean; allowFerries: boolean;
  mapLat: number | null; mapLng: number | null;
};
export type TripDetail = { trip: Trip; groups: Group[]; points: Point[]; days: Day[]; dayStops: DayStop[]; routes: DayRoute[]; stats: TripStats };
// GET /api/points/:pid/place — server-cached Google Place Details.
export type PlaceDetails = { formattedAddress: string | null; rating: number | null; userRatingCount: number | null; weekdayHours: string[]; websiteUri: string | null; phone: string | null };
export type PlaceInfo = { status: "ok" | "none" | "budget" | "error"; place?: PlaceDetails };
// GET /api/trips enriches each trip with coords + polylines for the dashboard thumbnails.
export type TripListItem = Trip & { points: { lat: number; lng: number }[]; routePolylines: string[]; daysCount: number };
