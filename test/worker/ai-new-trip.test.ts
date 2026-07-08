import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { appWith } from "../helpers/session";
import { makeAiNewTripRouter } from "../../src/worker/routes/ai-new-trip";
import { getDb, trips } from "../../src/worker/db/schema";
import type { TripBrief } from "../../src/worker/lib/ai/extract";
import type { GeocodeResult } from "../../src/worker/lib/geocode";

async function call(app: ReturnType<typeof appWith>, body: object | string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request("http://x/api/ai/new-trip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const fullBrief: TripBrief = {
  tripName: "Dolomites camping loop",
  destinationQuery: "Dolomites, Italy",
  startDate: "2026-08-01",
  vehicle: "ev",
  evRangeKm: 380,
  avoidTolls: true,
  allowFerries: null,
};
const geoHit: GeocodeResult = { query: "Dolomites, Italy", found: true, name: "Dolomites", lat: 46.41, lng: 11.84, placeId: "pl1" };

describe("POST /api/ai/new-trip", () => {
  it("creates a seeded trip from extraction + geocode", async () => {
    const app = appWith("alice", makeAiNewTripRouter({
      extract: async () => fullBrief,
      geocode: async (qs) => qs.map(() => geoHit),
    }));
    const res = await call(app, { description: "10 days camping around the Dolomites in August, EV with 380km range, no tolls" });
    expect(res.status).toBe(201);
    const { tripId } = await res.json<{ tripId: string }>();

    const [row] = await getDb(env).select().from(trips).where(eq(trips.id, tripId));
    expect(row.name).toBe("Dolomites camping loop");
    expect(row.startDate).toBe("2026-08-01");
    expect(row.vehicle).toBe("ev");
    expect(row.evRangeKm).toBe(380);
    expect(row.avoidTolls).toBe(true);
    expect(row.allowFerries).toBe(true); // null in brief → default
    expect(row.mapLat).toBeCloseTo(46.41);
    expect(row.mapLng).toBeCloseTo(11.84);
    expect(row.chatSeed).toContain("Dolomites");
    expect(row.chatSeedConsumed).toBe(false);
  });

  it("user-provided name beats the extracted one", async () => {
    const app = appWith("alice", makeAiNewTripRouter({ extract: async () => fullBrief, geocode: async () => [] }));
    const res = await call(app, { name: "Honeymoon", description: "Dolomites in August" });
    const { tripId } = await res.json<{ tripId: string }>();
    const [row] = await getDb(env).select().from(trips).where(eq(trips.id, tripId));
    expect(row.name).toBe("Honeymoon");
  });

  it("degrades, doesn't fail: extraction throws → trip still created with fallbacks", async () => {
    const app = appWith("alice", makeAiNewTripRouter({
      extract: async () => { throw new Error("anthropic down"); },
      geocode: async () => { throw new Error("must not geocode without a brief"); },
    }));
    const res = await call(app, { description: "somewhere warm" });
    expect(res.status).toBe(201);
    const { tripId } = await res.json<{ tripId: string }>();
    const [row] = await getDb(env).select().from(trips).where(eq(trips.id, tripId));
    expect(row.name).toBe("New trip");
    expect(row.mapLat).toBeNull();
    expect(row.vehicle).toBe("car");
    expect(row.chatSeed).toBe("somewhere warm"); // seed survives for the editor kickoff
  });

  it("geocode miss → null center, trip still created", async () => {
    const app = appWith("alice", makeAiNewTripRouter({
      extract: async () => fullBrief,
      geocode: async (qs) => qs.map((q) => ({ query: q, found: false, name: null, lat: null, lng: null, placeId: null })),
    }));
    const res = await call(app, { description: "Dolomites, august" });
    expect(res.status).toBe(201);
    const { tripId } = await res.json<{ tripId: string }>();
    const [row] = await getDb(env).select().from(trips).where(eq(trips.id, tripId));
    expect(row.mapLat).toBeNull();
    expect(row.name).toBe("Dolomites camping loop");
  });

  it("400 on missing description, 401 unauthenticated, 503 unconfigured", async () => {
    const withExtract = appWith("alice", makeAiNewTripRouter({ extract: async () => null }));
    expect((await call(withExtract, {})).status).toBe(400);
    expect((await call(withExtract, { description: "  " })).status).toBe(400);

    const anon = appWith(null, makeAiNewTripRouter({ extract: async () => null }));
    expect((await call(anon, { description: "x" })).status).toBe(401);

    // No override and no ANTHROPIC_API_KEY in the test env → unconfigured.
    const bare = appWith("alice", makeAiNewTripRouter());
    expect((await call(bare, { description: "x" })).status).toBe(503);
  });
});
