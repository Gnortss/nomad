// Google Place Details (New) — same injectable shape as geocode.ts.
// Requires the Places API (New) to be enabled on the same key as GOOGLE_ROUTES_KEY.
//
// COST: the field mask below is the price. These fields bill each call at the
// Enterprise SKU (1,000 free/month; billing is by the highest-tier field in the
// mask). Adding reviews/editorialSummary escalates to Enterprise + Atmosphere;
// change the mask only together with PLACE_BUDGET in routes/points.ts.
const FIELD_MASK =
  "formattedAddress,rating,userRatingCount,regularOpeningHours.weekdayDescriptions,websiteUri,internationalPhoneNumber";

export type PlaceDetails = {
  formattedAddress: string | null;
  rating: number | null;
  userRatingCount: number | null;
  weekdayHours: string[];
  websiteUri: string | null;
  phone: string | null;
};
export type PlaceDetailsFetcher = (placeId: string) => Promise<PlaceDetails | null>;

const ENDPOINT = "https://places.googleapis.com/v1/places";

export function googlePlaceDetails(apiKey: string, fetchImpl: typeof fetch = fetch): PlaceDetailsFetcher {
  return async (placeId) => {
    try {
      const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      });
      if (!res.ok) return null;
      const json = await res.json<{
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        regularOpeningHours?: { weekdayDescriptions?: string[] };
        websiteUri?: string;
        internationalPhoneNumber?: string;
      }>();
      return {
        formattedAddress: json.formattedAddress ?? null,
        rating: json.rating ?? null,
        userRatingCount: json.userRatingCount ?? null,
        weekdayHours: json.regularOpeningHours?.weekdayDescriptions ?? [],
        websiteUri: json.websiteUri ?? null,
        phone: json.internationalPhoneNumber ?? null,
      };
    } catch {
      return null;
    }
  };
}
