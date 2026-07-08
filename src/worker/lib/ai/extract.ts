import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTOR_MODEL } from "./config";

// One-shot haiku extraction from the free-text new-trip description. Everything
// except tripName is nullable — the model must not invent what the user didn't say.
export type TripBrief = {
  tripName: string;
  destinationQuery: string | null;
  startDate: string | null;
  vehicle: "car" | "ev" | null;
  evRangeKm: number | null;
  avoidTolls: boolean | null;
  allowFerries: boolean | null;
};

export type TripBriefExtractor = (description: string) => Promise<TripBrief | null>;

const EXTRACT_TOOL: Anthropic.Messages.Tool = {
  name: "extract_trip",
  description: "Record the trip brief extracted from the user's description.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["tripName", "destinationQuery", "startDate", "vehicle", "evRangeKm", "avoidTolls", "allowFerries"],
    properties: {
      tripName: { type: "string", description: "Short trip title, e.g. 'Dolomites camping loop'. Same language as the description." },
      destinationQuery: { type: ["string", "null"], description: "The main destination region as a geocodable query, e.g. 'Dolomites, Italy'. Null if no destination is mentioned." },
      startDate: { type: ["string", "null"], description: "Start date YYYY-MM-DD if the description names one, else null." },
      // Strict validation rejects enum combined with a union type — nullable enums need anyOf.
      vehicle: { anyOf: [{ type: "string", enum: ["car", "ev"] }, { type: "null" }], description: "'ev' only if an electric car is mentioned; 'car' if a combustion car is; else null." },
      evRangeKm: { type: ["number", "null"], description: "EV range in km if stated, else null." },
      avoidTolls: { type: ["boolean", "null"], description: "true/false only if tolls are mentioned, else null." },
      allowFerries: { type: ["boolean", "null"], description: "true/false only if ferries are mentioned, else null." },
    },
  } as unknown as Anthropic.Messages.Tool.InputSchema,
};

export function anthropicExtractor(apiKey: string): TripBriefExtractor {
  return async (description) => {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: 500,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_trip" },
      messages: [{
        role: "user",
        content: `Extract the trip brief from this road-trip description. Only record facts the description states — never guess dates, vehicle or constraints.\n\n<description>\n${description}\n</description>`,
      }],
    });
    const tu = res.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (!tu) return null;
    const b = tu.input as TripBrief;
    if (!b || typeof b.tripName !== "string" || !b.tripName.trim()) return null;
    return b;
  };
}
