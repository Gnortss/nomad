import type Anthropic from "@anthropic-ai/sdk";
import { SUBMIT_PLAN_SCHEMA } from "./plan-schema";
import { MAX_WEB_SEARCHES } from "./config";
import type { Geocoder } from "../geocode";
import type { RouteComputer } from "../routes-google";
import type { Coord } from "../waypoints";

export type PlannerDeps = { geocode: Geocoder; computeRoute: RouteComputer };

export function plannerTools(): Anthropic.Messages.ToolUnion[] {
  return [
    // Basic variant on purpose: web_search_20260209 filters results via hidden
    // server-side code execution, which kept demanding container_id on follow-up
    // requests mid-turn (400s in practice). 20250305 has no container at all.
    { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES },
    {
      name: "geocode_places",
      description:
        "Resolve place names to exact coordinates via Google Geocoding. Pass up to 15 queries at once; include region context in each query (e.g. 'Camp Korita, Soča, Slovenia'). Every stop in submit_plan must have coordinates from this tool — never invent lat/lng.",
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
        "Compute driving distance and duration for an ordered list of waypoints (one day's route) via Google Routes. Use it to verify each day's driving leg is feasible before submitting the plan.",
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
      name: "submit_plan",
      description:
        "Create the trip in the app with the final day-by-day plan. Call exactly once, only after the user confirmed your summary and every stop has geocoded coordinates and drive times were checked.",
      strict: true,
      input_schema: SUBMIT_PLAN_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
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
    case "submit_plan":
      return "Creating your trip…";
    default:
      return name;
  }
}

export async function executeCustomTool(name: string, input: unknown, deps: PlannerDeps): Promise<{ content: string; isError: boolean }> {
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
      const r = await deps.computeRoute(waypoints.map((w) => ({ lat: Number(w.lat), lng: Number(w.lng) })));
      const hours = Math.round((r.durationS / 3600) * 10) / 10;
      return { content: JSON.stringify({ distanceKm: Math.round(r.distanceM / 1000), durationS: r.durationS, drivingHours: hours }), isError: false };
    }
    return { content: `unknown tool: ${name}`, isError: true };
  } catch (e) {
    return { content: `tool failed: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
