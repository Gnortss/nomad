// Tool contracts for the trip-editing tools: JSON schema (strict) + runtime
// validation. Strict tool use requires additionalProperties:false and every
// property listed in `required`, so optional fields are modeled as nullable.

export const POINT_TYPES = ["camp", "wildcamp", "hostel", "hotel", "poi", "fuel", "charging", "food", "viewpoint", "activity", "other"] as const;

export type PlanStop = {
  name: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  type: (typeof POINT_TYPES)[number];
  inRoute: boolean;
  notes: string | null;
};
export type UpsertDay = {
  position: number;
  title: string;
  notes: string | null;
  avoidTolls: boolean | null;
  allowFerries: boolean | null;
  stops: PlanStop[];
};
export type UpsertDaysInput = { days: UpsertDay[] };
export type UpdateTripInput = {
  name: string | null;
  startDate: string | null;
  vehicle: "car" | "ev" | null;
  evRangeKm: number | null;
  avoidTolls: boolean | null;
  allowFerries: boolean | null;
};
export type DeleteDaysInput = { positions: number[] };

const STOP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "lat", "lng", "googlePlaceId", "type", "inRoute", "notes"],
  properties: {
    name: { type: "string" },
    lat: { type: "number" },
    lng: { type: "number" },
    googlePlaceId: { type: ["string", "null"], description: "Google place_id from geocode_places, or null" },
    type: { type: "string", enum: [...POINT_TYPES] },
    inRoute: { type: "boolean", description: "true = waypoint on the driving route; false = optional nearby suggestion attached to the day" },
    notes: { type: ["string", "null"], description: "One short practical sentence, or null" },
  },
} as const;

export const UPSERT_DAYS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: {
    days: {
      type: "array",
      description: "Days to create or fully replace, each identified by its 0-based position",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["position", "title", "notes", "avoidTolls", "allowFerries", "stops"],
        properties: {
          position: { type: "integer", description: "0-based day position in the trip" },
          title: { type: "string", description: "Short day title, e.g. 'Ljubljana → Bovec'" },
          notes: { type: ["string", "null"], description: "One short practical sentence about the day, or null" },
          avoidTolls: { type: ["boolean", "null"], description: "Per-day override, or null to inherit the trip default" },
          allowFerries: { type: ["boolean", "null"], description: "Per-day override, or null to inherit the trip default" },
          stops: { type: "array", description: "The day's COMPLETE stop list in driving order (replaces the previous list)", items: STOP_SCHEMA },
        },
      },
    },
  },
} as const;

export const UPDATE_TRIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "startDate", "vehicle", "evRangeKm", "avoidTolls", "allowFerries"],
  properties: {
    name: { type: ["string", "null"], description: "New trip name, or null to keep" },
    startDate: { type: ["string", "null"], description: "Trip start date YYYY-MM-DD, or null to keep" },
    // Strict validation rejects enum combined with a union type — nullable enums need anyOf.
    vehicle: { anyOf: [{ type: "string", enum: ["car", "ev"] }, { type: "null" }], description: "Vehicle type, or null to keep" },
    evRangeKm: { type: ["number", "null"], description: "EV range in km, or null to keep" },
    avoidTolls: { type: ["boolean", "null"], description: "Trip-wide toll avoidance, or null to keep" },
    allowFerries: { type: ["boolean", "null"], description: "Trip-wide ferry permission, or null to keep" },
  },
} as const;

export const DELETE_DAYS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["positions"],
  properties: {
    positions: { type: "array", items: { type: "integer" }, description: "0-based positions of the days to delete; remaining days close the gap" },
  },
} as const;

const MAX_DAYS = 30;
const MAX_STOPS_PER_DAY = 20;

type Valid<T> = { value: T; error: null } | { value: null; error: string };
const bad = (error: string) => ({ value: null, error }) as const;

function validStop(s: PlanStop, where: string): string | null {
  if (!s?.name?.trim()) return `${where}: every stop needs a name`;
  if (typeof s.lat !== "number" || typeof s.lng !== "number" || Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180)
    return `${where}, "${s.name}": lat/lng out of bounds`;
  if (!POINT_TYPES.includes(s.type)) return `${where}, "${s.name}": invalid type "${s.type}"`;
  return null;
}

export function validateUpsertDays(input: unknown): Valid<UpsertDaysInput> {
  const p = input as UpsertDaysInput;
  if (!p || !Array.isArray(p.days) || p.days.length === 0) return bad("days must be a non-empty array");
  const seen = new Set<number>();
  for (const d of p.days) {
    if (!Number.isInteger(d?.position) || d.position < 0 || d.position >= MAX_DAYS) return bad(`invalid day position ${d?.position} (0-${MAX_DAYS - 1})`);
    if (seen.has(d.position)) return bad(`duplicate day position ${d.position}`);
    seen.add(d.position);
    const where = `day at position ${d.position}`;
    if (!d.title?.trim()) return bad(`${where}: title is required`);
    if (!Array.isArray(d.stops)) return bad(`${where}: stops must be an array`);
    if (d.stops.length > MAX_STOPS_PER_DAY) return bad(`${where}: too many stops (max ${MAX_STOPS_PER_DAY})`);
    // Repeated places are allowed — same day or across days. Each occurrence
    // becomes its own point row, so nothing collides.
    for (const s of d.stops) {
      const err = validStop(s, where);
      if (err) return bad(err);
    }
  }
  return { value: p, error: null };
}

export function validateUpdateTrip(input: unknown): Valid<UpdateTripInput> {
  const p = input as UpdateTripInput;
  if (!p || typeof p !== "object") return bad("input must be an object");
  if (p.name != null && !p.name.trim()) return bad("name must be non-empty or null");
  if (p.startDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) return bad("startDate must be YYYY-MM-DD or null");
  if (p.vehicle != null && p.vehicle !== "car" && p.vehicle !== "ev") return bad("vehicle must be 'car', 'ev' or null");
  if (p.evRangeKm != null && (typeof p.evRangeKm !== "number" || p.evRangeKm < 50 || p.evRangeKm > 2000)) return bad("evRangeKm must be 50-2000 or null");
  return { value: p, error: null };
}

export function validateDeleteDays(input: unknown): Valid<DeleteDaysInput> {
  const p = input as DeleteDaysInput;
  if (!p || !Array.isArray(p.positions) || p.positions.length === 0) return bad("positions must be a non-empty array");
  if (p.positions.some((n) => !Number.isInteger(n) || n < 0)) return bad("positions must be non-negative integers");
  if (new Set(p.positions).size !== p.positions.length) return bad("duplicate positions");
  return { value: p, error: null };
}
