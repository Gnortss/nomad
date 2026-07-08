// Google Geocoding API — same injectable shape as routes-google.ts.
// Requires the Geocoding API to be enabled on the same key as GOOGLE_ROUTES_KEY.

export type GeocodeResult = {
  query: string;
  found: boolean;
  name: string | null; // formatted address
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};
export type Geocoder = (queries: string[]) => Promise<GeocodeResult[]>;

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export function googleGeocoder(apiKey: string, fetchImpl: typeof fetch = fetch): Geocoder {
  async function one(query: string): Promise<GeocodeResult> {
    const miss: GeocodeResult = { query, found: false, name: null, lat: null, lng: null, placeId: null };
    try {
      const res = await fetchImpl(`${ENDPOINT}?address=${encodeURIComponent(query)}&key=${apiKey}`);
      if (!res.ok) return miss;
      const json = await res.json<{
        status?: string;
        results?: Array<{ formatted_address?: string; place_id?: string; geometry?: { location?: { lat: number; lng: number } } }>;
      }>();
      const r = json.results?.[0];
      const loc = r?.geometry?.location;
      if (json.status !== "OK" || !loc) return miss;
      return { query, found: true, name: r?.formatted_address ?? null, lat: loc.lat, lng: loc.lng, placeId: r?.place_id ?? null };
    } catch {
      return miss;
    }
  }
  return (queries) => Promise.all(queries.map(one));
}
