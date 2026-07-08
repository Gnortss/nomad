import { Hono } from "hono";
import { getDb, trips } from "../db/schema";
import { newId } from "../lib/id";
import { googleGeocoder, type Geocoder } from "../lib/geocode";
import { anthropicExtractor, type TripBriefExtractor } from "../lib/ai/extract";
import type { AppEnv } from "../auth";

const MAX_DESCRIPTION_CHARS = 4_000;

// One-shot trip creation from a free-text description: haiku extracts the brief,
// the destination geocodes to a map center, and the raw description is stored as
// the chat seed the editor's first AI turn kicks off from. Degrade, don't fail:
// extraction or geocode misses still create the trip (fallback name, null center).
export function makeAiNewTripRouter(overrides?: { extract?: TripBriefExtractor; geocode?: Geocoder }) {
  const r = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

  r.post("/api/ai/new-trip", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!c.env.ANTHROPIC_API_KEY && !overrides?.extract) return c.json({ error: "ai_unconfigured" }, 503);

    const body = await c.req.json<{ name?: string; description?: string }>().catch(() => null);
    const description = body?.description?.trim();
    if (!description) return c.json({ error: "description required" }, 400);
    if (description.length > MAX_DESCRIPTION_CHARS) return c.json({ error: "description too long" }, 400);
    if (body?.name && body.name.length > 200) return c.json({ error: "name too long" }, 400);

    const extract = overrides?.extract ?? anthropicExtractor(c.env.ANTHROPIC_API_KEY!);
    const brief = await extract(description).catch((e) => {
      console.error("[ai-new-trip] extraction failed:", e);
      return null;
    });

    let mapLat: number | null = null, mapLng: number | null = null;
    if (brief?.destinationQuery) {
      const geocode = overrides?.geocode ?? googleGeocoder(c.env.GOOGLE_ROUTES_KEY);
      const [hit] = await geocode([brief.destinationQuery]).catch(() => []);
      if (hit?.found) { mapLat = hit.lat; mapLng = hit.lng; }
    }

    const now = Date.now();
    const row = {
      id: newId(),
      userId: user.id,
      name: body?.name?.trim() || brief?.tripName.trim() || "New trip",
      startDate: brief?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(brief.startDate) ? brief.startDate : null,
      currency: "EUR",
      vehicle: brief?.vehicle === "ev" ? ("ev" as const) : ("car" as const),
      evRangeKm: brief?.vehicle === "ev" && typeof brief.evRangeKm === "number" ? Math.round(brief.evRangeKm) : null,
      avoidTolls: brief?.avoidTolls ?? false,
      allowFerries: brief?.allowFerries ?? true,
      mapLat, mapLng,
      chatSeed: description,
      chatSeedConsumed: false,
      createdAt: now,
      updatedAt: now,
    };
    await getDb(c.env).insert(trips).values(row);
    return c.json({ tripId: row.id }, 201);
  });

  return r;
}
