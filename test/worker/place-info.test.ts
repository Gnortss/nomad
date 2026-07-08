import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, trips, points, placeDetails, apiUsage } from "../../src/worker/db/schema";
import { makePlaceInfoRouter } from "../../src/worker/routes/points";
import type { PlaceDetails } from "../../src/worker/lib/places";
import { appWith } from "../helpers/session";

const PLACE: PlaceDetails = {
  formattedAddress: "Skógafoss, Iceland", rating: 4.8, userRatingCount: 34211,
  weekdayHours: ["Monday: Open 24 hours"], websiteUri: "https://example.is", phone: "+354 555 1234",
};
const MONTH = new Date().toISOString().slice(0, 7);

async function call(app: ReturnType<typeof appWith>, pid: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`http://x/api/points/${pid}/place`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seed(placeId: string | null) {
  const db = getDb(env);
  const now = Date.now();
  await db.insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", createdAt: now, updatedAt: now });
  await db.insert(points).values({ id: "p1", tripId: "t1", name: "Skógafoss", lat: 63.53, lng: -19.51, googlePlaceId: placeId, createdAt: now });
}

describe("GET /api/points/:pid/place", () => {
  beforeEach(async () => {
    const db = getDb(env);
    await db.delete(placeDetails);
    await db.delete(apiUsage);
  });

  it("fetches once, caches in D1, and serves the cache afterwards", async () => {
    await seed("gp1");
    const fetchPlace = vi.fn(async () => PLACE);
    const app = appWith("alice", makePlaceInfoRouter(fetchPlace));

    const first = await call(app, "p1");
    expect(await first.json()).toEqual({ status: "ok", place: PLACE });
    expect(fetchPlace).toHaveBeenCalledExactlyOnceWith("gp1");

    const second = await call(app, "p1");
    expect(await second.json()).toEqual({ status: "ok", place: PLACE });
    expect(fetchPlace).toHaveBeenCalledTimes(1); // cache hit, no second Google call

    const usage = await getDb(env).select().from(apiUsage).where(eq(apiUsage.month, MONTH));
    expect(usage[0].count).toBe(1);
  });

  it("refetches when the cached row is older than 30 days", async () => {
    await seed("gp1");
    await getDb(env).insert(placeDetails).values({
      placeId: "gp1", data: JSON.stringify(PLACE), fetchedAt: Date.now() - 31 * 24 * 3600 * 1000,
    });
    const fetchPlace = vi.fn(async () => PLACE);
    const res = await call(appWith("alice", makePlaceInfoRouter(fetchPlace)), "p1");
    expect((await res.json<{ status: string }>()).status).toBe("ok");
    expect(fetchPlace).toHaveBeenCalledTimes(1);
  });

  it("returns status none for a pin-dropped stop without a place id", async () => {
    await seed(null);
    const fetchPlace = vi.fn(async () => PLACE);
    const res = await call(appWith("alice", makePlaceInfoRouter(fetchPlace)), "p1");
    expect(await res.json()).toEqual({ status: "none" });
    expect(fetchPlace).not.toHaveBeenCalled();
  });

  it("stops calling Google at 90% of the monthly free tier", async () => {
    await seed("gp1");
    await getDb(env).insert(apiUsage).values({ month: MONTH, sku: "place_details_enterprise", count: 900 });
    const fetchPlace = vi.fn(async () => PLACE);
    const res = await call(appWith("alice", makePlaceInfoRouter(fetchPlace)), "p1");
    expect(await res.json()).toEqual({ status: "budget" });
    expect(fetchPlace).not.toHaveBeenCalled();
  });

  it("returns status error (and still counts the attempt) when the fetch fails", async () => {
    await seed("gp1");
    const res = await call(appWith("alice", makePlaceInfoRouter(async () => null)), "p1");
    expect(await res.json()).toEqual({ status: "error" });
    const usage = await getDb(env).select().from(apiUsage).where(eq(apiUsage.month, MONTH));
    expect(usage[0].count).toBe(1);
  });

  it("404s on someone else's point", async () => {
    await seed("gp1");
    const res = await call(appWith("bob", makePlaceInfoRouter(async () => PLACE)), "p1");
    expect(res.status).toBe(404);
  });
});
