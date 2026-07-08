// The submit_plan tool contract: JSON schema (strict) + runtime validation.
// Strict tool use requires additionalProperties:false and every property listed in
// `required`, so optional fields are modeled as nullable instead of omittable.

export const POINT_TYPES = ["camp", "wildcamp", "hostel", "hotel", "poi", "fuel", "food", "viewpoint", "activity", "other"] as const;

export type PlanStop = {
  name: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  type: (typeof POINT_TYPES)[number];
  inRoute: boolean;
  notes: string | null;
};
export type PlanDay = { title: string; notes: string | null; stops: PlanStop[] };
export type TripPlan = { tripName: string; startDate: string | null; days: PlanDay[] };

export const SUBMIT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tripName", "startDate", "days"],
  properties: {
    tripName: { type: "string", description: "Short trip name, e.g. 'Slovenia camping loop'" },
    startDate: { type: ["string", "null"], description: "Trip start date YYYY-MM-DD, or null if the user gave no dates" },
    days: {
      type: "array",
      description: "Days in travel order",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "notes", "stops"],
        properties: {
          title: { type: "string", description: "Short day title, e.g. 'Ljubljana → Bovec'" },
          notes: { type: ["string", "null"], description: "One short practical sentence about the day, or null" },
          stops: {
            type: "array",
            description: "Stops in driving order",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "lat", "lng", "googlePlaceId", "type", "inRoute", "notes"],
              properties: {
                name: { type: "string" },
                lat: { type: "number" },
                lng: { type: "number" },
                googlePlaceId: { type: ["string", "null"], description: "Google place_id from geocode_places, or null" },
                type: { type: "string", enum: [...POINT_TYPES] },
                inRoute: { type: "boolean", description: "true = waypoint on the driving route; false = optional nearby suggestion" },
                notes: { type: ["string", "null"], description: "One short practical sentence, or null" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const MAX_DAYS = 30;
const MAX_STOPS_PER_DAY = 20;

// Returns a human/model-readable error string, or null when the plan is valid.
export function validatePlan(input: unknown): { plan: TripPlan; error: null } | { plan: null; error: string } {
  const p = input as TripPlan;
  const bad = (error: string) => ({ plan: null, error } as const);
  if (!p || typeof p !== "object") return bad("plan must be an object");
  if (!p.tripName?.trim()) return bad("tripName is required");
  if (p.startDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) return bad("startDate must be YYYY-MM-DD or null");
  if (!Array.isArray(p.days) || p.days.length === 0) return bad("days must be a non-empty array");
  if (p.days.length > MAX_DAYS) return bad(`too many days (max ${MAX_DAYS})`);
  for (const [i, d] of p.days.entries()) {
    if (!d?.title?.trim()) return bad(`day ${i + 1}: title is required`);
    if (!Array.isArray(d.stops) || d.stops.length === 0) return bad(`day ${i + 1}: needs at least one stop`);
    if (d.stops.length > MAX_STOPS_PER_DAY) return bad(`day ${i + 1}: too many stops (max ${MAX_STOPS_PER_DAY})`);
    // Repeated places are always allowed — same day or across days. Each stop
    // occurrence becomes its own point row in applyPlan, so nothing collides.
    for (const s of d.stops) {
      if (!s?.name?.trim()) return bad(`day ${i + 1}: every stop needs a name`);
      if (typeof s.lat !== "number" || typeof s.lng !== "number" || Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180)
        return bad(`day ${i + 1}, "${s.name}": lat/lng out of bounds`);
      if (!POINT_TYPES.includes(s.type)) return bad(`day ${i + 1}, "${s.name}": invalid type "${s.type}"`);
    }
  }
  return { plan: p, error: null };
}
