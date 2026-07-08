import type Anthropic from "@anthropic-ai/sdk";
import { UPSERT_DAYS_SCHEMA, UPDATE_TRIP_SCHEMA, DELETE_DAYS_SCHEMA, validateUpsertDays, validateUpdateTrip, validateDeleteDays } from "./plan-schema";
import { MAX_WEB_SEARCHES } from "./config";
import { upsertDays, deleteDays, updateTripProfile } from "./apply-edits";
import { reconcileDayRoutes } from "../reconcile";
import type { getDb } from "../../db/schema";
import type { Geocoder } from "../geocode";
import type { RouteComputer } from "../routes-google";
import type { Coord } from "../waypoints";

export type PlannerDeps = {
  db: ReturnType<typeof getDb>;
  tripId: string;
  geocode: Geocoder;
  computeRoute: RouteComputer;
  // Trip-level defaults for check_drive_time (per-day overrides come via tool input).
  tripModifiers: { avoidTolls: boolean; allowFerries: boolean };
};

export function plannerTools(): Anthropic.Messages.ToolUnion[] {
  return [
    // Basic variant on purpose: web_search_20260209 filters results via hidden
    // server-side code execution, which kept demanding container_id on follow-up
    // requests mid-turn (400s in practice). 20250305 has no container at all.
    { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES },
    {
      name: "geocode_places",
      description:
        "Resolve place names to exact coordinates via Google Geocoding. Pass up to 15 queries at once; include region context in each query (e.g. 'Camp Korita, Soča, Slovenia'). Every stop you write with upsert_days must have coordinates from this tool — never invent lat/lng.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["queries"],
        properties: { queries: { type: "array", items: { type: "string" }, description: "Place queries with region context" } },
      },
    },
    {
      name: "check_drive_time",
      description:
        "Compute driving distance and duration for an ordered list of waypoints (one day's route) via Google Routes, honoring the trip's toll/ferry constraints. Use it to verify a day's driving leg is feasible before writing the day.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["label", "waypoints"],
        properties: {
          label: { type: "string", description: "Short human label for this leg, e.g. 'Ljubljana → Bovec'" },
          waypoints: {
            type: "array",
            description: "Ordered waypoints, at least 2",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["lat", "lng"],
              properties: { lat: { type: "number" }, lng: { type: "number" } },
            },
          },
        },
      },
    },
    {
      name: "update_trip",
      description: "Update trip-level details: name, start date, vehicle profile, toll/ferry constraints. Pass null for anything to keep unchanged.",
      strict: true,
      input_schema: UPDATE_TRIP_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
    },
    {
      name: "upsert_days",
      description:
        "Create or fully replace trip days. Each entry replaces the day at its position wholesale — always pass the day's COMPLETE stop list, never a delta. Stops the user has edited or booked keep their user data automatically. The user's map updates live after each call, so plan incrementally: write days as soon as they're researched instead of waiting for the whole trip.",
      strict: true,
      input_schema: UPSERT_DAYS_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
    },
    {
      name: "delete_days",
      description: "Delete the days at the given 0-based positions; the remaining days close the gap (positions shift down).",
      strict: true,
      input_schema: DELETE_DAYS_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
    },
  ];
}

// Human-readable progress labels streamed to the chat UI.
export function toolProgressLabel(name: string, input: unknown): string {
  const i = input as Record<string, unknown>;
  switch (name) {
    case "web_search":
      return `Searching: ${String(i?.query ?? "the web")}`;
    case "geocode_places": {
      const q = Array.isArray(i?.queries) ? (i.queries as string[]) : [];
      return q.length === 1 ? `Locating: ${q[0]}` : `Locating ${q.length} places`;
    }
    case "check_drive_time":
      return `Checking drive: ${String(i?.label ?? "route leg")}`;
    case "update_trip":
      return "Updating trip details";
    case "upsert_days": {
      const ds = Array.isArray(i?.days) ? (i.days as Array<{ position?: number }>) : [];
      const nums = ds.map((d) => (d?.position ?? 0) + 1).sort((a, b) => a - b);
      if (nums.length === 0) return "Updating days";
      return nums.length === 1 ? `Writing day ${nums[0]}` : `Writing days ${nums[0]}–${nums[nums.length - 1]}`;
    }
    case "delete_days": {
      const ps = Array.isArray(i?.positions) ? (i.positions as number[]) : [];
      return ps.length === 1 ? `Removing day ${ps[0] + 1}` : `Removing ${ps.length} days`;
    }
    default:
      return name;
  }
}

// Editing tools must be re-submitted in full on validation errors: Sonnet
// otherwise responds to rejections with near-empty placeholder payloads.
const RESUBMIT = "Call the tool again with the COMPLETE corrected payload — everything from your previous call, not a shortened or placeholder version.";

export type ToolOutcome = { content: string; isError: boolean; tripUpdated?: boolean };

export async function executeCustomTool(name: string, input: unknown, deps: PlannerDeps): Promise<ToolOutcome> {
  try {
    if (name === "geocode_places") {
      const { queries } = input as { queries: string[] };
      if (!Array.isArray(queries) || queries.length === 0) return { content: "queries must be a non-empty array", isError: true };
      const results = await deps.geocode(queries.slice(0, 15).map(String));
      return { content: JSON.stringify(results), isError: false };
    }
    if (name === "check_drive_time") {
      const { waypoints } = input as { waypoints: Coord[] };
      if (!Array.isArray(waypoints) || waypoints.length < 2) return { content: "need at least 2 waypoints", isError: true };
      const m = { avoidTolls: deps.tripModifiers.avoidTolls, avoidFerries: !deps.tripModifiers.allowFerries };
      const r = await deps.computeRoute(waypoints.map((w) => ({ lat: Number(w.lat), lng: Number(w.lng) })), m);
      const hours = Math.round((r.durationS / 3600) * 10) / 10;
      return { content: JSON.stringify({ distanceKm: Math.round(r.distanceM / 1000), durationS: r.durationS, drivingHours: hours }), isError: false };
    }
    if (name === "update_trip") {
      const v = validateUpdateTrip(input);
      if (!v.value) return { content: `Invalid update_trip: ${v.error}. ${RESUBMIT}`, isError: true };
      const fields = await updateTripProfile(deps.db, deps.tripId, v.value);
      if (fields.some((f) => f === "avoidTolls" || f === "allowFerries"))
        await reconcileDayRoutes(deps.db, deps.tripId, deps.computeRoute);
      return { content: JSON.stringify({ updated: fields }), isError: false, tripUpdated: fields.length > 0 };
    }
    if (name === "upsert_days") {
      const v = validateUpsertDays(input);
      if (!v.value) return { content: `Invalid upsert_days: ${v.error}. ${RESUBMIT}`, isError: true };
      const counts = await upsertDays(deps.db, deps.tripId, v.value);
      const routeStatus = await reconcileDayRoutes(deps.db, deps.tripId, deps.computeRoute);
      return { content: JSON.stringify({ ...counts, routeStatus }), isError: false, tripUpdated: true };
    }
    if (name === "delete_days") {
      const v = validateDeleteDays(input);
      if (!v.value) return { content: `Invalid delete_days: ${v.error}. ${RESUBMIT}`, isError: true };
      const result = await deleteDays(deps.db, deps.tripId, v.value);
      const routeStatus = await reconcileDayRoutes(deps.db, deps.tripId, deps.computeRoute);
      return { content: JSON.stringify({ ...result, routeStatus }), isError: false, tripUpdated: result.daysDeleted > 0 };
    }
    return { content: `unknown tool: ${name}`, isError: true };
  } catch (e) {
    return { content: `tool failed: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
