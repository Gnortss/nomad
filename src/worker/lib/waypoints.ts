export type Coord = { lat: number; lng: number };

export function dayWaypoints(prevDayLastStop: Coord | null, dayStops: Coord[]): Coord[] {
  const wp = prevDayLastStop ? [prevDayLastStop, ...dayStops] : [...dayStops];
  return wp.length >= 2 ? wp : [];
}

export async function waypointsHash(waypoints: Coord[], mode: string): Promise<string> {
  const canonical = mode + "|" + waypoints.map((w) => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`).join(";");
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
