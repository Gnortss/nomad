import type { Coord } from "./waypoints";

export type RouteResult = { polyline: string; distanceM: number; durationS: number };
export type RouteComputer = (waypoints: Coord[]) => Promise<RouteResult>;

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration";

const wp = (c: Coord) => ({ location: { latLng: { latitude: c.lat, longitude: c.lng } } });

export function googleRouteComputer(apiKey: string, fetchImpl: typeof fetch = fetch): RouteComputer {
  return async (waypoints: Coord[]) => {
    const origin = wp(waypoints[0]);
    const destination = wp(waypoints[waypoints.length - 1]);
    const intermediates = waypoints.slice(1, -1).map(wp);
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ origin, destination, intermediates, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}`);
    const json = await res.json<{ routes?: Array<{ polyline?: { encodedPolyline?: string }; distanceMeters?: number; duration?: string }> }>();
    const r = json.routes?.[0];
    if (!r?.polyline?.encodedPolyline) throw new Error("Routes API: no route");
    return { polyline: r.polyline.encodedPolyline, distanceM: r.distanceMeters ?? 0, durationS: parseInt(r.duration ?? "0", 10) };
  };
}
