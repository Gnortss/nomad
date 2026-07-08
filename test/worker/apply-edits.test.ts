import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb, trips, days, points, dayStops } from "../../src/worker/db/schema";
import { upsertDays, deleteDays, updateTripProfile } from "../../src/worker/lib/ai/apply-edits";
import type { UpsertDay, PlanStop } from "../../src/worker/lib/ai/plan-schema";

const db = () => getDb(env);

const stop = (over: Partial<PlanStop>): PlanStop => ({
  name: "Stop", lat: 46, lng: 14, googlePlaceId: null, type: "poi", inRoute: true, notes: null, ...over,
});
const day = (position: number, stops: PlanStop[], over?: Partial<UpsertDay>): UpsertDay => ({
  position, title: `Day ${position + 1}`, notes: null, avoidTolls: null, allowFerries: null, stops, ...over,
});

async function seedTrip() {
  const now = Date.now();
  await db().insert(trips).values({ id: "t1", userId: "alice", name: "T", currency: "EUR", createdAt: now, updatedAt: now });
}

describe("upsertDays", () => {
  beforeEach(seedTrip);

  it("creates new days with new AI points", async () => {
    const counts = await upsertDays(db(), "t1", { days: [
      day(0, [stop({ name: "Ljubljana", googlePlaceId: "pl-lj" }), stop({ name: "Bled", lat: 46.36, googlePlaceId: "pl-bled", type: "camp" })]),
      day(1, [stop({ name: "Bovec", lat: 46.33, lng: 13.55, googlePlaceId: "pl-bovec", type: "camp" })]),
    ] });
    expect(counts).toMatchObject({ daysCreated: 2, daysReplaced: 0, stops: 3, pointsDeleted: 0 });
    const dys = await db().select().from(days).where(eq(days.tripId, "t1")).orderBy(asc(days.position));
    expect(dys).toHaveLength(2);
    const pts = await db().select().from(points).where(eq(points.tripId, "t1"));
    expect(pts).toHaveLength(3);
    expect(pts.every((p) => p.coordSource === "ai")).toBe(true);
  });

  it("matches by placeId, preserves user-owned fields, updates AI-owned ones", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [stop({ name: "Camp Korita", googlePlaceId: "pl-k", type: "camp" })])] });
    const [p] = await db().select().from(points).where(eq(points.tripId, "t1"));
    // User books the camp and attaches data.
    await db().update(points).set({ bookingStatus: "booked", estCost: 120 }).where(eq(points.id, p.id));

    const counts = await upsertDays(db(), "t1", { days: [day(0, [
      stop({ name: "Kamp Korita", lat: 46.001, lng: 14.001, googlePlaceId: "pl-k", type: "camp", notes: "riverside pitch" }),
      stop({ name: "Vršič Pass", lat: 46.44, lng: 13.74, googlePlaceId: "pl-v", type: "viewpoint" }),
    ])] });
    expect(counts).toMatchObject({ daysReplaced: 1, stops: 2, pointsDeleted: 0 });

    const pts = await db().select().from(points).where(eq(points.tripId, "t1"));
    expect(pts).toHaveLength(2);
    const camp = pts.find((x) => x.googlePlaceId === "pl-k")!;
    expect(camp.id).toBe(p.id); // same row — user data intact
    expect(camp.bookingStatus).toBe("booked");
    expect(camp.estCost).toBe(120);
    expect(camp.name).toBe("Kamp Korita"); // AI-owned fields updated
    expect(camp.notes).toBe("riverside pitch");
  });

  it("matches by name+proximity when placeId is absent, but not across ~250m", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [
      stop({ name: "Viewpoint A", lat: 46.0, lng: 14.0 }),
      stop({ name: "Viewpoint B", lat: 46.5, lng: 14.5 }),
    ])] });
    const before = await db().select().from(points).where(eq(points.tripId, "t1"));

    await upsertDays(db(), "t1", { days: [day(0, [
      stop({ name: "viewpoint a", lat: 46.0005, lng: 14.0005 }), // ~70m away, case-insensitive → match
      stop({ name: "Viewpoint B", lat: 46.53, lng: 14.5 }), // ~3km away → no match, new point
    ])] });
    const after = await db().select().from(points).where(eq(points.tripId, "t1"));
    const a = before.find((p) => p.name === "Viewpoint A")!;
    expect(after.some((p) => p.id === a.id)).toBe(true); // A reused
    const b = before.find((p) => p.name === "Viewpoint B")!;
    expect(after.some((p) => p.id === b.id)).toBe(false); // old B orphaned + deleted
    expect(after).toHaveLength(2);
  });

  it("a within-day revisit yields two point rows, never a duplicate (dayId,pointId)", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [stop({ name: "Base Camp", googlePlaceId: "pl-base", type: "camp" })])] });
    // Day trip: base → pass → same base again.
    await upsertDays(db(), "t1", { days: [day(0, [
      stop({ name: "Base Camp", googlePlaceId: "pl-base", type: "camp" }),
      stop({ name: "Mangart Saddle", lat: 46.44, lng: 13.65, googlePlaceId: "pl-m", type: "viewpoint" }),
      stop({ name: "Base Camp", googlePlaceId: "pl-base", type: "camp" }),
    ])] });
    const dys = await db().select().from(days).where(eq(days.tripId, "t1"));
    const stops = await db().select().from(dayStops).where(eq(dayStops.dayId, dys[0].id)).orderBy(asc(dayStops.position));
    expect(stops).toHaveLength(3);
    expect(new Set(stops.map((s) => s.pointId)).size).toBe(3); // distinct point rows
    const base = await db().select().from(points).where(eq(points.googlePlaceId, "pl-base"));
    expect(base).toHaveLength(2); // first matched existing, second is a fresh row
  });

  it("deletes clean AI orphans but pools points with user data", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [
      stop({ name: "Keeper", googlePlaceId: "pl-keep" }),
      stop({ name: "Dropped clean", googlePlaceId: "pl-clean" }),
      stop({ name: "Dropped booked", googlePlaceId: "pl-booked" }),
    ])] });
    const booked = (await db().select().from(points).where(eq(points.googlePlaceId, "pl-booked")))[0];
    await db().update(points).set({ bookingStatus: "booked" }).where(eq(points.id, booked.id));

    const counts = await upsertDays(db(), "t1", { days: [day(0, [stop({ name: "Keeper", googlePlaceId: "pl-keep" })])] });
    expect(counts.pointsDeleted).toBe(1);
    const pts = await db().select().from(points).where(eq(points.tripId, "t1"));
    expect(pts.map((p) => p.googlePlaceId).sort()).toEqual(["pl-booked", "pl-keep"]); // clean orphan gone, booked pooled
    const stops = await db().select().from(dayStops);
    expect(stops.some((s) => s.pointId === booked.id)).toBe(false); // pooled = unassigned
  });

  it("never steals a point attached to another day", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [stop({ name: "Shared Hut", googlePlaceId: "pl-hut" })])] });
    await upsertDays(db(), "t1", { days: [day(1, [stop({ name: "Shared Hut", googlePlaceId: "pl-hut" })])] });
    const huts = await db().select().from(points).where(eq(points.googlePlaceId, "pl-hut"));
    expect(huts).toHaveLength(2); // day 1 got its own row; day 0's stop untouched
    const stops = await db().select().from(dayStops);
    expect(stops).toHaveLength(2);
  });

  it("stores per-day constraint overrides", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [stop({})], { avoidTolls: true, allowFerries: false })] });
    const [d] = await db().select().from(days).where(eq(days.tripId, "t1"));
    expect(d.avoidTolls).toBe(true);
    expect(d.allowFerries).toBe(false);
  });
});

describe("deleteDays", () => {
  beforeEach(seedTrip);

  it("deletes days, compacts positions two-phase, cleans orphans", async () => {
    await upsertDays(db(), "t1", { days: [
      day(0, [stop({ name: "A", googlePlaceId: "a" })]),
      day(1, [stop({ name: "B", googlePlaceId: "b" })]),
      day(2, [stop({ name: "C", googlePlaceId: "c" })]),
      day(3, [stop({ name: "D", googlePlaceId: "d" })]),
    ] });
    const res = await deleteDays(db(), "t1", { positions: [1, 2] });
    expect(res).toEqual({ daysDeleted: 2, pointsDeleted: 2 });

    const dys = await db().select().from(days).where(eq(days.tripId, "t1")).orderBy(asc(days.position));
    expect(dys.map((d) => [d.position, d.title])).toEqual([[0, "Day 1"], [1, "Day 4"]]); // compacted, order kept
    const pts = await db().select().from(points).where(eq(points.tripId, "t1"));
    expect(pts.map((p) => p.googlePlaceId).sort()).toEqual(["a", "d"]);
  });

  it("no-ops on unknown positions", async () => {
    await upsertDays(db(), "t1", { days: [day(0, [stop({})])] });
    expect(await deleteDays(db(), "t1", { positions: [7] })).toEqual({ daysDeleted: 0, pointsDeleted: 0 });
  });
});

describe("updateTripProfile", () => {
  beforeEach(seedTrip);

  it("applies only non-null fields", async () => {
    const fields = await updateTripProfile(db(), "t1", {
      name: "Soča Valley loop", startDate: "2026-08-01", vehicle: "ev", evRangeKm: 380.4, avoidTolls: null, allowFerries: null,
    });
    expect(fields.sort()).toEqual(["evRangeKm", "name", "startDate", "vehicle"]);
    const [t] = await db().select().from(trips).where(eq(trips.id, "t1"));
    expect(t.name).toBe("Soča Valley loop");
    expect(t.vehicle).toBe("ev");
    expect(t.evRangeKm).toBe(380);
    expect(t.avoidTolls).toBe(false); // untouched default
  });
});
