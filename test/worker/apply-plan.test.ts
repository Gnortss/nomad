import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb, trips, days, points, dayStops } from "../../src/worker/db/schema";
import { applyPlan } from "../../src/worker/lib/ai/apply-plan";
import { validatePlan, type TripPlan } from "../../src/worker/lib/ai/plan-schema";

const db = () => getDb(env);
const compute = async () => ({ polyline: "x", distanceM: 1000, durationS: 60 });

const stop = (name: string, lat: number, lng: number, extra: Partial<TripPlan["days"][0]["stops"][0]> = {}) => ({
  name, lat, lng, googlePlaceId: null, type: "poi" as const, inRoute: true, notes: null, ...extra,
});

const plan: TripPlan = {
  tripName: "Slovenia loop",
  startDate: "2026-08-01",
  days: [
    { title: "Ljubljana → Bovec", notes: null, stops: [stop("Ljubljana", 46.05, 14.5), stop("Camp Korita", 46.33, 13.65, { type: "camp" })] },
    { title: "Soča valley", notes: "Rafting day", stops: [stop("Boka waterfall", 46.32, 13.53, { inRoute: false }), stop("Kobarid", 46.25, 13.58)] },
  ],
};

describe("applyPlan", () => {
  it("creates trip, days, points and stops with correct positions and flags", async () => {
    const { tripId, counts } = await applyPlan(db(), "alice", plan, null, compute);
    expect(counts).toEqual({ days: 2, points: 4, stops: 4 });

    const [trip] = await db().select().from(trips).where(eq(trips.id, tripId));
    expect(trip.name).toBe("Slovenia loop");
    expect(trip.userId).toBe("alice");
    expect(trip.startDate).toBe("2026-08-01");

    const dayRows = await db().select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position));
    expect(dayRows.map((d) => [d.position, d.title])).toEqual([[0, "Ljubljana → Bovec"], [1, "Soča valley"]]);

    const pointRows = await db().select().from(points).where(eq(points.tripId, tripId));
    expect(pointRows).toHaveLength(4);
    expect(pointRows.every((p) => p.coordSource === "ai")).toBe(true);

    const stops2 = await db().select().from(dayStops).where(eq(dayStops.dayId, dayRows[1].id)).orderBy(asc(dayStops.position));
    expect(stops2).toHaveLength(2);
    expect(stops2[0].inRoute).toBe(false); // Boka is attached, not routed
    expect(stops2[1].inRoute).toBe(true);
  });

  it("a place revisited on another day becomes its own point (editor invariant: one day per point)", async () => {
    const revisitPlan: TripPlan = {
      tripName: "Base camp", startDate: null,
      days: [
        { title: "Day 1", notes: null, stops: [stop("Camp Bled", 46.36, 14.09, { googlePlaceId: "g1" })] },
        { title: "Day 2", notes: null, stops: [stop("Vintgar", 46.39, 14.08), stop("Camp Bled", 46.36, 14.09, { googlePlaceId: "g1" })] },
      ],
    };
    const { tripId, counts } = await applyPlan(db(), "alice", revisitPlan, "Named override", compute);
    const [trip] = await db().select().from(trips).where(eq(trips.id, tripId));
    expect(trip.name).toBe("Named override");
    expect(counts).toEqual({ days: 2, points: 3, stops: 3 }); // camp twice = two point rows
  });

  it("collapses control-character garbage in names and notes", async () => {
    const messy: TripPlan = {
      tripName: "Trip", startDate: null,
      days: [{ title: "Bovec \n day", notes: null, stops: [stop("So\n\nca Gorge", 46.33, 13.68, { notes: "great base for So\n\nca valley" })] }],
    };
    const { tripId } = await applyPlan(db(), "alice", messy, null, compute);
    const [p] = await db().select().from(points).where(eq(points.tripId, tripId));
    expect(p.name).toBe("So ca Gorge");
    expect(p.notes).toBe("great base for So ca valley");
  });
});

describe("validatePlan", () => {
  it("accepts the fixture plan", () => {
    expect(validatePlan(plan).error).toBeNull();
  });
  it("rejects out-of-bounds coords and bad types; allows repeated places anywhere", () => {
    expect(validatePlan({ ...plan, days: [{ title: "x", notes: null, stops: [stop("Bad", 120, 0)] }] }).error).toMatch(/out of bounds/);
    expect(validatePlan({ ...plan, days: [{ title: "x", notes: null, stops: [{ ...stop("Bad", 1, 1), type: "castle" }] }] }).error).toMatch(/invalid type/);
    const repeats = { ...plan, days: [
      { title: "x", notes: null, stops: [stop("Camp", 1, 1), stop("Hike", 1.1, 1.1), stop("Camp", 1, 1)] }, // same day loop
      { title: "y", notes: null, stops: [stop("Camp", 1, 1)] }, // and again next day
    ] };
    expect(validatePlan(repeats).error).toBeNull();
  });
  it("rejects empty days and missing names", () => {
    expect(validatePlan({ tripName: "t", startDate: null, days: [] }).error).toMatch(/non-empty/);
    expect(validatePlan({ tripName: "t", startDate: null, days: [{ title: "x", notes: null, stops: [] }] }).error).toMatch(/at least one stop/);
  });
});
