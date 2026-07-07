# ROADLINE Phase 1a — Backend Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side core loop — points, days (with titles), ordered stops, the inter-day route engine with D1 caching, per-day/per-trip stats, and read-only share links — all TDD'd against local D1, so the Phase 1b UI has a complete, correct API to build on.

**Architecture:** Extends the Phase 0 Hono worker with focused sub-routers (`points`, `days`, `stops`, `share`, `trip-detail`) mounted after the session guard, plus pure-logic modules (`fuel`, `waypoints`, `positions`, `reconcile`) that carry the testable behavior. The route engine folds computation into the stops write: any stop/day mutation calls `reconcileDayRoutes`, which builds each day's waypoint list (previous day's last stop → this day's stops), hashes it, and calls Google only on a cache miss — so the inter-day cascade is handled by the hash, not hand-written dependency tracking.

**Tech Stack:** Hono · Drizzle (`drizzle-orm/d1`) · Web Crypto (`crypto.subtle` for sha256) · Google Routes API (`computeRoutes`) · Vitest `@cloudflare/vitest-pool-workers` (worker/D1 integration) — same toolchain as Phase 0.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-07-road-trip-planner-v1-design.md`. Section refs below (§4.1 etc.) point there.
- **Toolchain is pinned** (Phase 0): vite 6 / vitest 3.2 / `@cloudflare/vitest-pool-workers` 0.8 / `@cloudflare/vite-plugin` 1.34. Do not bump.
- **Test commands:** `npm run test:worker` (worker/D1 pool) for everything in this phase. `npm test` also runs the client suite.
- **Every trip-scoped route** is guarded by ownership: `trip.user_id === session.user.id`, returning `404` (not 403) for a trip the user doesn't own, `401` when unauthenticated.
- **D1 bills rows scanned** — every query filters on an indexed column (all FK/filter columns are already indexed from Phase 0 §3).
- **Google is never called from the client.** The server key `GOOGLE_ROUTES_KEY` (Worker secret) is the only path to the Routes API. Route content is cached in `day_routes` and refreshed at 30 days (ToS).
- **A day's route origin is the previous day's last stop** (§4.1). The day's own first stop is still labelled START. Route waypoint hash includes the origin, so changing day N's last stop invalidates day N+1 automatically.
- **The stops write commits stops even if the Google route call fails** (§4.3); it returns a per-day route status (`ok` | `stale` | `failed`); retry = re-PUT the same stops.
- **Enums (verbatim):** `type` = camp|wildcamp|hostel|hotel|poi|fuel|food|viewpoint|activity|other; `booking_status` = idea|to_book|booked; `cost_basis` = per_night|per_person|total; `coord_source` = user|google.
- **Units:** metric, EUR. Fuel shown only when both `fuel_l_per_100km` and `fuel_price_per_l` are set. Over-ambitious-day threshold: `duration_s > 9*3600`.
- **TDD:** test-first, commit per green test. Google Routes client is injected so tests never hit the network.

---

### Task 1: Shared ownership guard

**Files:**
- Create: `src/worker/lib/ownership.ts`
- Test: `test/worker/ownership.test.ts`
- Modify: `test/helpers/session.ts` (generalize to mount any router)

**Interfaces:**
- Consumes: `getDb`, `trips` (Phase 0 schema); `c.get("user")`.
- Produces: `requireTrip(c, tripId): Promise<{ id: string; userId: string } | null>` — returns the trip row if the session user owns it, else `null` (caller responds 404). `ownedTrip(db, tripId, userId)` helper returning the row or `undefined`.

- [ ] **Step 1: Generalize the session test helper**

Replace `test/helpers/session.ts` so any router can be mounted with a fixed user:
```ts
import { Hono } from "hono";
import type { AppEnv } from "../../src/worker/auth";

type Router = Parameters<Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>["route"]>[1];

export function appWith(userId: string | null, ...routers: Router[]) {
  const app = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();
  app.use("/api/*", async (c, next) => { c.set("user", userId ? { id: userId } : null); await next(); });
  app.use("/s/*", async (c, next) => { c.set("user", userId ? { id: userId } : null); await next(); });
  for (const r of routers) app.route("/", r);
  return app;
}
```
Update `test/worker/trips.test.ts` import of `appAs` to `appWith("alice", tripsRouter)` etc. (the two existing trips tests: replace `appAs("alice")` with `appWith("alice", tripsRouter)`, `appAs(null)` with `appWith(null, tripsRouter)`, importing `tripsRouter` from `../../src/worker/routes/trips`).

- [ ] **Step 2: Write the failing ownership test**

`test/worker/ownership.test.ts`:
```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";
import { ownedTrip } from "../../src/worker/lib/ownership";

describe("ownedTrip", () => {
  it("returns the row only for the owner", async () => {
    const db = getDb(env);
    const now = Date.now();
    await db.insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", createdAt: now, updatedAt: now });
    expect(await ownedTrip(db, "t1", "alice")).toBeTruthy();
    expect(await ownedTrip(db, "t1", "bob")).toBeUndefined();
    expect(await ownedTrip(db, "nope", "alice")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:worker -- ownership`
Expected: FAIL — `ownership.ts` does not exist.

- [ ] **Step 4: Implement the guard**

`src/worker/lib/ownership.ts`:
```ts
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, trips } from "../db/schema";

type Db = ReturnType<typeof getDb>;

export async function ownedTrip(db: Db, tripId: string, userId: string) {
  const rows = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1);
  return rows[0];
}

// Returns the owned trip row, or null after the caller should `return c.json(..., code)`.
export async function requireTrip(c: Context, tripId: string) {
  const user = c.get("user") as { id: string } | null;
  if (!user) return { trip: null as null, code: 401 as const };
  const trip = await ownedTrip(getDb(c.env), tripId, user.id);
  if (!trip) return { trip: null as null, code: 404 as const };
  return { trip, code: 200 as const };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- ownership`
Expected: PASS. Also run `npm run test:worker -- trips` to confirm the helper rename didn't break existing tests.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: shared trip-ownership guard + generalized session test helper"
```

---

### Task 2: Points CRUD

**Files:**
- Create: `src/worker/routes/points.ts`
- Modify: `src/worker/index.ts` (mount `pointsRouter`)
- Test: `test/worker/points.test.ts`

**Interfaces:**
- Consumes: `requireTrip`; `getDb`, `points` schema; `newId`.
- Produces: `pointsRouter` with `POST /api/trips/:id/points`, `PATCH /api/points/:id`, `DELETE /api/points/:id`. Create body: `{ name, lat, lng, type?, coordSource?, googlePlaceId?, notes?, links?, estCost?, costBasis?, bookingStatus?, groupId? }`. `links` is `Array<{label,url}>`, stored JSON-encoded. Returns the created/updated point with `links` decoded back to an array.

- [ ] **Step 1: Write the failing points test**

`test/worker/points.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";
import { pointsRouter } from "../../src/worker/routes/points";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seedTrip(userId: string, id = "t1") {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id, userId, name: "Iceland", createdAt: now, updatedAt: now });
}

describe("points", () => {
  beforeEach(() => seedTrip("alice"));

  it("creates a point in the trip's pool with decoded links", async () => {
    const app = appWith("alice", pointsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Skógafoss", lat: 63.53, lng: -19.51, type: "viewpoint",
        links: [{ label: "site", url: "https://x" }] }),
    }));
    expect(res.status).toBe(201);
    const p = await res.json<{ id: string; type: string; bookingStatus: string; links: { label: string; url: string }[] }>();
    expect(p.type).toBe("viewpoint");
    expect(p.bookingStatus).toBe("idea");
    expect(p.links[0].url).toBe("https://x");
  });

  it("404s when creating a point on someone else's trip", async () => {
    const app = appWith("bob", pointsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", lat: 1, lng: 2 }),
    }));
    expect(res.status).toBe(404);
  });

  it("patches and deletes a point", async () => {
    const app = appWith("alice", pointsRouter);
    const created = await (await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "N1", lat: 1, lng: 2 }),
    }))).json<{ id: string }>();

    const patched = await call(app, new Request(`http://x/api/points/${created.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingStatus: "booked", estCost: 22 }),
    }));
    expect((await patched.json<{ bookingStatus: string }>()).bookingStatus).toBe("booked");

    const del = await call(app, new Request(`http://x/api/points/${created.id}`, { method: "DELETE" }));
    expect(del.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- points`
Expected: FAIL — `points.ts` missing.

- [ ] **Step 3: Implement the points router**

`src/worker/routes/points.ts`:
```ts
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb, points, trips } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const pointsRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

const decode = (row: typeof points.$inferSelect) => ({ ...row, links: row.links ? JSON.parse(row.links) : [] });

pointsRouter.post("/api/trips/:id/points", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<Record<string, unknown>>();
  if (!b.name || typeof b.lat !== "number" || typeof b.lng !== "number")
    return c.json({ error: "name, lat, lng required" }, 400);
  const db = getDb(c.env);
  const row = {
    id: newId(), tripId: trip.id, name: String(b.name), lat: b.lat as number, lng: b.lng as number,
    coordSource: (b.coordSource as string) ?? "user",
    coordFetchedAt: b.coordSource === "google" ? Date.now() : null,
    googlePlaceId: (b.googlePlaceId as string) ?? null,
    type: (b.type as string) ?? "poi",
    notes: (b.notes as string) ?? null,
    links: b.links ? JSON.stringify(b.links) : null,
    estCost: (b.estCost as number) ?? null,
    costBasis: (b.costBasis as string) ?? null,
    bookingStatus: (b.bookingStatus as string) ?? "idea",
    groupId: (b.groupId as string) ?? null,
    createdAt: Date.now(),
  };
  await db.insert(points).values(row);
  return c.json(decode(row as typeof points.$inferSelect), 201);
});

async function pointTrip(db: ReturnType<typeof getDb>, pointId: string) {
  const rows = await db.select({ tripId: points.tripId, userId: trips.userId })
    .from(points).innerJoin(trips, eq(points.tripId, trips.id)).where(eq(points.id, pointId)).limit(1);
  return rows[0];
}

pointsRouter.patch("/api/points/:pid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await pointTrip(db, c.req.param("pid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "type", "notes", "estCost", "costBasis", "bookingStatus", "groupId", "lat", "lng"])
    if (k in b) patch[k] = b[k];
  if ("links" in b) patch.links = b.links ? JSON.stringify(b.links) : null;
  await db.update(points).set(patch).where(eq(points.id, c.req.param("pid")));
  const row = (await db.select().from(points).where(eq(points.id, c.req.param("pid"))).limit(1))[0];
  return c.json(decode(row));
});

pointsRouter.delete("/api/points/:pid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await pointTrip(db, c.req.param("pid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(points).where(eq(points.id, c.req.param("pid")));
  return c.body(null, 204);
});
```

- [ ] **Step 4: Mount the router**

In `src/worker/index.ts`, add `import { pointsRouter } from "./routes/points";` and `app.route("/", pointsRouter);` after the trips router.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- points`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: points CRUD with pooled default and ownership 404s"
```

---

### Task 3: Days CRUD (with titles and position uniqueness)

**Files:**
- Create: `src/worker/routes/days.ts`
- Modify: `src/worker/index.ts` (mount `daysRouter`)
- Test: `test/worker/days.test.ts`

**Interfaces:**
- Consumes: `requireTrip`; `getDb`, `days` schema; `newId`.
- Produces: `daysRouter` with `POST /api/trips/:id/days` (`{ title?, position? }` → appends at next position if omitted), `PATCH /api/days/:did` (`{ title?, notes? }`), `DELETE /api/days/:did` (deletes and compacts later positions). A day row shape: `{ id, tripId, position, title, notes, departureTime, targetArrivalTime }`.

- [ ] **Step 1: Write the failing days test**

`test/worker/days.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";
import { daysRouter } from "../../src/worker/routes/days";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function post(app: ReturnType<typeof appWith>, body: object) {
  return call(app, new Request("http://x/api/trips/t1/days", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("days", () => {
  beforeEach(async () => {
    const now = Date.now();
    await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", createdAt: now, updatedAt: now });
  });

  it("appends days at increasing positions and stores title", async () => {
    const app = appWith("alice", daysRouter);
    const d0 = await (await post(app, { title: "Golden Circle" })).json<{ position: number; title: string }>();
    const d1 = await (await post(app, { title: "South coast" })).json<{ position: number }>();
    expect(d0.position).toBe(0);
    expect(d0.title).toBe("Golden Circle");
    expect(d1.position).toBe(1);
  });

  it("compacts positions after delete", async () => {
    const app = appWith("alice", daysRouter);
    await post(app, { title: "A" });
    const b = await (await post(app, { title: "B" })).json<{ id: string }>();
    await post(app, { title: "C" });
    await call(app, new Request(`http://x/api/days/${b.id}`, { method: "DELETE" }));
    const list = await getDb(env).select().from((await import("../../src/worker/db/schema")).days);
    expect(list.map((d) => d.position).sort()).toEqual([0, 1]);
    expect(list.find((d) => d.title === "C")!.position).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- days`
Expected: FAIL — `days.ts` missing.

- [ ] **Step 3: Implement the days router**

`src/worker/routes/days.ts`:
```ts
import { Hono } from "hono";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, days, trips } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const daysRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

daysRouter.post("/api/trips/:id/days", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<{ title?: string; position?: number }>().catch(() => ({}));
  const db = getDb(c.env);
  const existing = await db.select({ position: days.position }).from(days).where(eq(days.tripId, trip.id));
  const position = b.position ?? existing.length;
  const row = { id: newId(), tripId: trip.id, position, title: b.title ?? null, notes: null,
    departureTime: null, targetArrivalTime: null };
  await db.insert(days).values(row);
  return c.json(row, 201);
});

async function dayTrip(db: ReturnType<typeof getDb>, dayId: string) {
  const rows = await db.select({ dayId: days.id, tripId: days.tripId, position: days.position, userId: trips.userId })
    .from(days).innerJoin(trips, eq(days.tripId, trips.id)).where(eq(days.id, dayId)).limit(1);
  return rows[0];
}

daysRouter.patch("/api/days/:did", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await dayTrip(db, c.req.param("did"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ title?: string; notes?: string }>();
  const patch: Record<string, unknown> = {};
  if ("title" in b) patch.title = b.title;
  if ("notes" in b) patch.notes = b.notes;
  await db.update(days).set(patch).where(eq(days.id, c.req.param("did")));
  const row = (await db.select().from(days).where(eq(days.id, c.req.param("did"))).limit(1))[0];
  return c.json(row);
});

daysRouter.delete("/api/days/:did", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await dayTrip(db, c.req.param("did"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(days).where(eq(days.id, owner.dayId));
  // compact later positions so they stay contiguous
  await db.update(days).set({ position: sql`${days.position} - 1` })
    .where(and(eq(days.tripId, owner.tripId), gt(days.position, owner.position)));
  return c.body(null, 204);
});
```

- [ ] **Step 4: Mount the router**

In `src/worker/index.ts`, add `import { daysRouter } from "./routes/days";` and `app.route("/", daysRouter);`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- days`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: days CRUD with titles and position compaction"
```

---

### Task 4: Fuel math (pure)

**Files:**
- Create: `src/worker/lib/fuel.ts`
- Test: `test/worker/fuel.test.ts`

**Interfaces:**
- Produces: `dayFuelCost(distanceM, lPer100km, pricePerL): number | null` — returns `null` if either fuel param is null/undefined; else `distanceM/1000 * lPer100km/100 * pricePerL`.

- [ ] **Step 1: Write the failing test**

`test/worker/fuel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dayFuelCost } from "../../src/worker/lib/fuel";

describe("dayFuelCost", () => {
  it("computes cost from distance, consumption and price", () => {
    // 200 km at 8 L/100km * €1.90/L = 16 L * 1.9 = 30.4
    expect(dayFuelCost(200_000, 8, 1.9)).toBeCloseTo(30.4, 5);
  });
  it("returns null when a fuel param is missing", () => {
    expect(dayFuelCost(200_000, null, 1.9)).toBeNull();
    expect(dayFuelCost(200_000, 8, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- fuel`
Expected: FAIL — `fuel.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/lib/fuel.ts`:
```ts
export function dayFuelCost(
  distanceM: number,
  lPer100km: number | null | undefined,
  pricePerL: number | null | undefined,
): number | null {
  if (lPer100km == null || pricePerL == null) return null;
  return (distanceM / 1000) * (lPer100km / 100) * pricePerL;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:worker -- fuel`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure per-day fuel-cost math"
```

---

### Task 5: Waypoints + hash (the inter-day rule, pure)

**Files:**
- Create: `src/worker/lib/waypoints.ts`
- Test: `test/worker/waypoints.test.ts`

**Interfaces:**
- Produces:
  - `type Coord = { lat: number; lng: number }`
  - `dayWaypoints(prevDayLastStop: Coord | null, dayStops: Coord[]): Coord[]` — prepends `prevDayLastStop` when present; returns `[]` if the result has fewer than 2 points (no drivable route).
  - `waypointsHash(waypoints: Coord[], mode: string): Promise<string>` — sha256 hex of the ordered coords + mode via Web Crypto.

- [ ] **Step 1: Write the failing test**

`test/worker/waypoints.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dayWaypoints, waypointsHash } from "../../src/worker/lib/waypoints";

const A = { lat: 1, lng: 1 }, B = { lat: 2, lng: 2 }, C = { lat: 3, lng: 3 };

describe("dayWaypoints", () => {
  it("prepends the previous day's last stop as origin", () => {
    expect(dayWaypoints(A, [B, C])).toEqual([A, B, C]);
  });
  it("uses the day's own stops when there is no previous overnight", () => {
    expect(dayWaypoints(null, [B, C])).toEqual([B, C]);
  });
  it("returns [] when fewer than 2 points would result", () => {
    expect(dayWaypoints(null, [B])).toEqual([]);
    expect(dayWaypoints(null, [])).toEqual([]);
    expect(dayWaypoints(A, [])).toEqual([]); // origin alone is not a route
  });
  it("with a previous overnight, a single-stop day IS a route", () => {
    expect(dayWaypoints(A, [B])).toEqual([A, B]);
  });
});

describe("waypointsHash", () => {
  it("is stable and order-sensitive", async () => {
    const h1 = await waypointsHash([A, B, C], "DRIVE");
    const h2 = await waypointsHash([A, B, C], "DRIVE");
    const h3 = await waypointsHash([C, B, A], "DRIVE");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- waypoints`
Expected: FAIL — `waypoints.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/lib/waypoints.ts`:
```ts
export type Coord = { lat: number; lng: number };

export function dayWaypoints(prevDayLastStop: Coord | null, dayStops: Coord[]): Coord[] {
  const wp = prevDayLastStop ? [prevDayLastStop, ...dayStops] : [...dayStops];
  return wp.length >= 2 ? wp : [];
}

export async function waypointsHash(waypoints: Coord[], mode: string): Promise<string> {
  const canonical = mode + "|" + waypoints.map((w) => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`).join(";");
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:worker -- waypoints`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: inter-day waypoint construction + sha256 hash"
```

---

### Task 6: Position rewrite for stop reordering (pure)

**Files:**
- Create: `src/worker/lib/positions.ts`
- Test: `test/worker/positions.test.ts`

**Interfaces:**
- Produces: `rewritePositions(pointIds: string[]): Array<{ pointId: string; position: number }>` — maps an ordered id list to 0-based positions, deduping (first occurrence wins) so a point can appear at most once per day (spec §3 composite PK).

- [ ] **Step 1: Write the failing test**

`test/worker/positions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rewritePositions } from "../../src/worker/lib/positions";

describe("rewritePositions", () => {
  it("assigns contiguous 0-based positions", () => {
    expect(rewritePositions(["a", "b", "c"])).toEqual([
      { pointId: "a", position: 0 }, { pointId: "b", position: 1 }, { pointId: "c", position: 2 },
    ]);
  });
  it("dedupes, first occurrence wins", () => {
    expect(rewritePositions(["a", "b", "a"])).toEqual([
      { pointId: "a", position: 0 }, { pointId: "b", position: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- positions`
Expected: FAIL — `positions.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/lib/positions.ts`:
```ts
export function rewritePositions(pointIds: string[]): Array<{ pointId: string; position: number }> {
  const seen = new Set<string>();
  const out: Array<{ pointId: string; position: number }> = [];
  for (const pointId of pointIds) {
    if (seen.has(pointId)) continue;
    seen.add(pointId);
    out.push({ pointId, position: out.length });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:worker -- positions`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: stop position-rewrite with dedupe"
```

---

### Task 7: Google Routes client (injectable)

**Files:**
- Create: `src/worker/lib/routes-google.ts`
- Test: `test/worker/routes-google.test.ts`

**Interfaces:**
- Produces:
  - `type RouteResult = { polyline: string; distanceM: number; durationS: number }`
  - `type RouteComputer = (waypoints: Coord[]) => Promise<RouteResult>`
  - `googleRouteComputer(apiKey: string, fetchImpl?: typeof fetch): RouteComputer` — calls Routes API `computeRoutes` `TRAFFIC_UNAWARE`, minimal field mask (`routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration`), origin = first waypoint, destination = last, middle = intermediates. Parses `duration` (e.g. `"1234s"`) to seconds.

- [ ] **Step 1: Write the failing test (with a stub fetch)**

`test/worker/routes-google.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { googleRouteComputer } from "../../src/worker/lib/routes-google";

describe("googleRouteComputer", () => {
  it("posts origin/destination/intermediates and parses the response", async () => {
    let captured: any = null;
    const fakeFetch = async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({
        routes: [{ polyline: { encodedPolyline: "abc" }, distanceMeters: 214000, duration: "11400s" }],
      }), { status: 200 });
    };
    const compute = googleRouteComputer("KEY", fakeFetch as unknown as typeof fetch);
    const r = await compute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }]);
    expect(r).toEqual({ polyline: "abc", distanceM: 214000, durationS: 11400 });
    expect(captured.origin.location.latLng).toEqual({ latitude: 1, longitude: 1 });
    expect(captured.destination.location.latLng).toEqual({ latitude: 3, longitude: 3 });
    expect(captured.intermediates).toHaveLength(1);
    expect(captured.routingPreference).toBe("TRAFFIC_UNAWARE");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- routes-google`
Expected: FAIL — `routes-google.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/lib/routes-google.ts`:
```ts
import type { Coord } from "./waypoints";

export type RouteResult = { polyline: string; distanceM: number; durationS: number };
export type RouteComputer = (waypoints: Coord[]) => Promise<RouteResult>;

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration";

const wp = (c: Coord) => ({ location: { latLng: { latitude: c.lat, longitude: c.lng } } });

export function googleRouteComputer(apiKey: string, fetchImpl: typeof fetch = fetch): RouteComputer {
  return async (waypoints: Coord[]) => {
    const origin = wp(waypoints[0]);
    const destination = wp(waypoints[waypoints.length - 1]);
    const intermediates = waypoints.slice(1, -1).map(wp);
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ origin, destination, intermediates, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}`);
    const json = await res.json<{ routes?: Array<{ polyline?: { encodedPolyline?: string }; distanceMeters?: number; duration?: string }> }>();
    const r = json.routes?.[0];
    if (!r?.polyline?.encodedPolyline) throw new Error("Routes API: no route");
    return { polyline: r.polyline.encodedPolyline, distanceM: r.distanceMeters ?? 0, durationS: parseInt(r.duration ?? "0", 10) };
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:worker -- routes-google`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: injectable Google Routes computeRoutes client"
```

---

### Task 8: reconcileDayRoutes (cache + inter-day cascade + failure resilience)

**Files:**
- Create: `src/worker/lib/reconcile.ts`
- Test: `test/worker/reconcile.test.ts`

**Interfaces:**
- Consumes: `getDb`, `days`, `dayStops`, `points`, `dayRoutes`; `dayWaypoints`, `waypointsHash`; `RouteComputer`.
- Produces: `reconcileDayRoutes(db, tripId, compute): Promise<Record<string, "ok" | "stale" | "failed">>` — for each day of the trip in position order: builds waypoints (prev day's last stop → this day's stops), hashes; if the cached `day_routes` row matches the hash and is <30 days old, leaves it (`ok`); on hash miss or >30-day age, calls `compute`, upserts the row (`ok`), or leaves the old row and marks `failed` if `compute` throws; days with no drivable route get their cache row deleted and are omitted from the result. Returns a per-`dayId` status map.

- [ ] **Step 1: Write the failing test**

`test/worker/reconcile.test.ts`:
```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points, dayStops, dayRoutes } from "../../src/worker/db/schema";
import { reconcileDayRoutes } from "../../src/worker/lib/reconcile";
import { eq } from "drizzle-orm";

const db = () => getDb(env);
async function seed() {
  const now = Date.now();
  await db().insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
  await db().insert(days).values([
    { id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null },
    { id: "d1", tripId: "t1", position: 1, title: "B", notes: null, departureTime: null, targetArrivalTime: null },
  ]);
  await db().insert(points).values([
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p2", tripId: "t1", name: "P2", lat: 3, lng: 3, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
  ]);
  // day0: p0,p1  ; day1: p2  (so day1's route origin must be p1)
  await db().insert(dayStops).values([
    { dayId: "d0", pointId: "p0", position: 0 },
    { dayId: "d0", pointId: "p1", position: 1 },
    { dayId: "d1", pointId: "p2", position: 0 },
  ]);
}

describe("reconcileDayRoutes", () => {
  beforeEach(seed);

  it("computes day1 using day0's last stop as origin, and caches", async () => {
    const seenOrigins: Array<{ lat: number; lng: number }> = [];
    const compute = async (wp: Array<{ lat: number; lng: number }>) => {
      seenOrigins.push(wp[0]);
      return { polyline: "x", distanceM: 1000, durationS: 60 };
    };
    const status = await reconcileDayRoutes(db(), "t1", compute);
    expect(status.d1).toBe("ok");
    // day1's first waypoint is p1 (day0's last stop), not p2
    const day1Call = seenOrigins.find((o) => o.lat === 2);
    expect(day1Call).toBeTruthy();
    const cached = await db().select().from(dayRoutes).where(eq(dayRoutes.dayId, "d1"));
    expect(cached).toHaveLength(1);
  });

  it("only calls compute on a hash miss (second run is all cache hits)", async () => {
    let calls = 0;
    const compute = async () => { calls++; return { polyline: "x", distanceM: 1, durationS: 1 }; };
    await reconcileDayRoutes(db(), "t1", compute);
    const after = calls;
    await reconcileDayRoutes(db(), "t1", compute);
    expect(calls).toBe(after); // no new calls
  });

  it("marks a day failed but keeps other days when compute throws", async () => {
    const compute = async (wp: Array<{ lat: number; lng: number }>) => {
      if (wp[0].lat === 2) throw new Error("google down"); // fail only day1
      return { polyline: "x", distanceM: 1, durationS: 1 };
    };
    const status = await reconcileDayRoutes(db(), "t1", compute);
    expect(status.d0).toBe("ok");
    expect(status.d1).toBe("failed");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- reconcile`
Expected: FAIL — `reconcile.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/lib/reconcile.ts`:
```ts
import { asc, eq } from "drizzle-orm";
import { getDb, days, dayStops, points, dayRoutes } from "../db/schema";
import { dayWaypoints, waypointsHash, type Coord } from "./waypoints";
import type { RouteComputer } from "./routes-google";

type Db = ReturnType<typeof getDb>;
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

async function orderedStopCoords(db: Db, dayId: string): Promise<Coord[]> {
  const rows = await db.select({ lat: points.lat, lng: points.lng })
    .from(dayStops).innerJoin(points, eq(dayStops.pointId, points.id))
    .where(eq(dayStops.dayId, dayId)).orderBy(asc(dayStops.position));
  return rows.map((r) => ({ lat: r.lat, lng: r.lng }));
}

export async function reconcileDayRoutes(
  db: Db, tripId: string, compute: RouteComputer,
): Promise<Record<string, "ok" | "stale" | "failed">> {
  const tripDays = await db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position));
  const stopsByDay = new Map<string, Coord[]>();
  for (const d of tripDays) stopsByDay.set(d.id, await orderedStopCoords(db, d.id));

  const status: Record<string, "ok" | "stale" | "failed"> = {};
  for (let i = 0; i < tripDays.length; i++) {
    const day = tripDays[i];
    const own = stopsByDay.get(day.id)!;
    const prev = i > 0 ? stopsByDay.get(tripDays[i - 1].id)! : [];
    const prevLast = prev.length ? prev[prev.length - 1] : null;
    const wp = dayWaypoints(prevLast, own);

    if (wp.length < 2) { await db.delete(dayRoutes).where(eq(dayRoutes.dayId, day.id)); continue; }

    const hash = await waypointsHash(wp, "DRIVE");
    const cached = (await db.select().from(dayRoutes).where(eq(dayRoutes.dayId, day.id)).limit(1))[0];
    const fresh = cached && cached.waypointsHash === hash && Date.now() - cached.computedAt < THIRTY_DAYS;
    if (fresh) { status[day.id] = "ok"; continue; }

    try {
      const r = await compute(wp);
      const row = { dayId: day.id, waypointsHash: hash, polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS, computedAt: Date.now() };
      if (cached) await db.update(dayRoutes).set(row).where(eq(dayRoutes.dayId, day.id));
      else await db.insert(dayRoutes).values(row);
      status[day.id] = "ok";
    } catch {
      status[day.id] = "failed"; // keep any stale cached row; caller surfaces retry
    }
  }
  return status;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:worker -- reconcile`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: reconcileDayRoutes — inter-day cache, cascade via hash, failure resilience"
```

---

### Task 9: PUT stops (fold reconcile into the write)

**Files:**
- Create: `src/worker/routes/stops.ts`
- Modify: `src/worker/index.ts` (mount `stopsRouter`)
- Test: `test/worker/stops.test.ts`

**Interfaces:**
- Consumes: `requireTrip`/day ownership; `rewritePositions`; `reconcileDayRoutes`; `googleRouteComputer`; a way to inject a fake computer in tests.
- Produces: `PUT /api/days/:did/stops` body `{ pointIds: string[] }` → replaces that day's `day_stops` rows (positions from `rewritePositions`), runs `reconcileDayRoutes`, returns `{ stops: [...], routes: Record<dayId,{distanceM,durationS,polyline}|null>, routeStatus: Record<dayId,"ok"|"stale"|"failed"> }`. Export `makeStopsRouter(computeOverride?)` so tests inject a fake `RouteComputer`; the default builds one from `env.GOOGLE_ROUTES_KEY`.

- [ ] **Step 1: Write the failing test**

`test/worker/stops.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points } from "../../src/worker/db/schema";
import { makeStopsRouter } from "../../src/worker/routes/stops";
import { appWith } from "../helpers/session";

const fakeComputer = async () => ({ polyline: "poly", distanceM: 214000, durationS: 11400 });

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seed() {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(points).values([
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, coordSource: "user", type: "poi", bookingStatus: "idea", createdAt: now },
  ]);
}

describe("PUT stops", () => {
  beforeEach(seed);

  it("assigns ordered stops and returns the computed route", async () => {
    const app = appWith("alice", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json<{ stops: any[]; routeStatus: Record<string, string>; routes: Record<string, any> }>();
    expect(body.stops.map((s) => s.pointId)).toEqual(["p0", "p1"]);
    expect(body.routeStatus.d0).toBe("ok");
    expect(body.routes.d0.distanceM).toBe(214000);
  });

  it("commits stops even when routing fails (routeStatus failed)", async () => {
    const throwing = async () => { throw new Error("google down"); };
    const app = appWith("alice", makeStopsRouter(throwing));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0", "p1"] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json<{ stops: any[]; routeStatus: Record<string, string> }>();
    expect(body.stops).toHaveLength(2);          // stops persisted
    expect(body.routeStatus.d0).toBe("failed");  // route not computed
  });

  it("404s for a day on someone else's trip", async () => {
    const app = appWith("bob", makeStopsRouter(fakeComputer));
    const res = await call(app, new Request("http://x/api/days/d0/stops", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pointIds: ["p0"] }),
    }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- stops`
Expected: FAIL — `stops.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/routes/stops.ts`:
```ts
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { getDb, days, dayStops, dayRoutes, trips } from "../db/schema";
import { rewritePositions } from "../lib/positions";
import { reconcileDayRoutes } from "../lib/reconcile";
import { googleRouteComputer, type RouteComputer } from "../lib/routes-google";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };

export function makeStopsRouter(computeOverride?: RouteComputer) {
  const r = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

  r.put("/api/days/:did/stops", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env);
    const owner = (await db.select({ tripId: days.tripId, userId: trips.userId })
      .from(days).innerJoin(trips, eq(days.tripId, trips.id)).where(eq(days.id, c.req.param("did"))).limit(1))[0];
    if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);

    const { pointIds } = await c.req.json<{ pointIds: string[] }>();
    const positions = rewritePositions(pointIds ?? []);
    await db.delete(dayStops).where(eq(dayStops.dayId, c.req.param("did")));
    if (positions.length)
      await db.insert(dayStops).values(positions.map((p) => ({ dayId: c.req.param("did"), pointId: p.pointId, position: p.position })));

    const compute = computeOverride ?? googleRouteComputer(c.env.GOOGLE_ROUTES_KEY);
    const routeStatus = await reconcileDayRoutes(db, owner.tripId, compute);

    const stops = await db.select().from(dayStops).where(eq(dayStops.dayId, c.req.param("did"))).orderBy(asc(dayStops.position));
    const routeRows = await db.select().from(dayRoutes);
    const routes: Record<string, { distanceM: number; durationS: number; polyline: string } | null> = {};
    for (const rr of routeRows) routes[rr.dayId] = { distanceM: rr.distanceM, durationS: rr.durationS, polyline: rr.polyline };
    return c.json({ stops, routes, routeStatus });
  });

  return r;
}
```
Add `GOOGLE_ROUTES_KEY: string` to `AppEnv` in `src/worker/auth.ts`.

- [ ] **Step 4: Mount with the real computer**

In `src/worker/index.ts`: `import { makeStopsRouter } from "./routes/stops";` and `app.route("/", makeStopsRouter());`. Add `GOOGLE_ROUTES_KEY: "test-routes-key"` to the vitest bindings in `vitest.config.ts` (so `env` typechecks; tests inject their own computer and never call it).

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- stops`
Expected: PASS (3 tests) — including stops persisting when routing throws.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: PUT stops folds route reconcile into the write, resilient to Google failure"
```

---

### Task 10: Batched trip detail (GET /api/trips/:id)

**Files:**
- Create: `src/worker/routes/trip-detail.ts`
- Modify: `src/worker/index.ts` (mount)
- Test: `test/worker/trip-detail.test.ts`

**Interfaces:**
- Consumes: `requireTrip`; `getDb` + all schema tables; `dayFuelCost`.
- Produces: `GET /api/trips/:id` → `{ trip, groups, points (links decoded), days, dayStops, routes, stats }` where `stats = { totalDistanceM, totalDurationS, totalFuel, perDay: Record<dayId,{distanceM,durationS,fuel,warnLongDay}> }`; `warnLongDay = durationS > 9*3600`; `totalFuel`/`fuel` null when fuel params unset.

- [ ] **Step 1: Write the failing test**

`test/worker/trip-detail.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points, dayStops, dayRoutes } from "../../src/worker/db/schema";
import { tripDetailRouter } from "../../src/worker/routes/trip-detail";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", fuelLPer100km: 8, fuelPricePerL: 1.9, createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(dayRoutes).values({ dayId: "d0", waypointsHash: "h", polyline: "p", distanceM: 200000, durationS: 36000, computedAt: now });
});

describe("GET trip detail", () => {
  it("returns nested data + per-day/total stats with fuel and long-day warning", async () => {
    const app = appWith("alice", tripDetailRouter);
    const res = await call(app, new Request("http://x/api/trips/t1"));
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.trip.id).toBe("t1");
    expect(body.stats.totalDistanceM).toBe(200000);
    expect(body.stats.perDay.d0.fuel).toBeCloseTo(30.4, 3);       // 200km*8/100*1.9
    expect(body.stats.perDay.d0.warnLongDay).toBe(true);          // 36000s = 10h > 9h
    expect(body.stats.totalFuel).toBeCloseTo(30.4, 3);
  });

  it("404s for a non-owner", async () => {
    const app = appWith("bob", tripDetailRouter);
    expect((await call(app, new Request("http://x/api/trips/t1"))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- trip-detail`
Expected: FAIL — `trip-detail.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/routes/trip-detail.ts`:
```ts
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { getDb, trips, groups, points, days, dayStops, dayRoutes } from "../db/schema";
import { requireTrip } from "../lib/ownership";
import { dayFuelCost } from "../lib/fuel";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const tripDetailRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

const LONG_DAY_S = 9 * 3600;

tripDetailRouter.get("/api/trips/:id", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const db = getDb(c.env);
  const full = (await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1))[0];

  const [grp, pts, dys] = await Promise.all([
    db.select().from(groups).where(eq(groups.tripId, trip.id)),
    db.select().from(points).where(eq(points.tripId, trip.id)),
    db.select().from(days).where(eq(days.tripId, trip.id)),
  ]);
  const dayIds = dys.map((d) => d.id);
  const stops = dayIds.length ? await db.select().from(dayStops).where(inArray(dayStops.dayId, dayIds)) : [];
  const routes = dayIds.length ? await db.select().from(dayRoutes).where(inArray(dayRoutes.dayId, dayIds)) : [];

  const perDay: Record<string, { distanceM: number; durationS: number; fuel: number | null; warnLongDay: boolean }> = {};
  let totalDistanceM = 0, totalDurationS = 0, totalFuel: number | null = null;
  for (const r of routes) {
    const fuel = dayFuelCost(r.distanceM, full.fuelLPer100km, full.fuelPricePerL);
    perDay[r.dayId] = { distanceM: r.distanceM, durationS: r.durationS, fuel, warnLongDay: r.durationS > LONG_DAY_S };
    totalDistanceM += r.distanceM; totalDurationS += r.durationS;
    if (fuel != null) totalFuel = (totalFuel ?? 0) + fuel;
  }

  return c.json({
    trip: full,
    groups: grp,
    points: pts.map((p) => ({ ...p, links: p.links ? JSON.parse(p.links) : [] })),
    days: dys,
    dayStops: stops,
    routes,
    stats: { totalDistanceM, totalDurationS, totalFuel, perDay },
  });
});
```

- [ ] **Step 4: Mount**

In `src/worker/index.ts`: `import { tripDetailRouter } from "./routes/trip-detail";` and `app.route("/", tripDetailRouter);`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- trip-detail`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: batched trip detail with per-day/total stats and long-day warning"
```

---

### Task 11: Groups CRUD

**Files:**
- Create: `src/worker/routes/groups.ts`
- Modify: `src/worker/index.ts` (mount)
- Test: `test/worker/groups.test.ts`

**Interfaces:**
- Consumes: `requireTrip`; day/point-style ownership join for group edits.
- Produces: `groupsRouter` with `POST /api/trips/:id/groups` (`{ name, color? }`), `PATCH /api/groups/:gid`, `DELETE /api/groups/:gid` (points' `group_id` set null via existing FK `ON DELETE SET NULL`).

- [ ] **Step 1: Write the failing test**

`test/worker/groups.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, points, groups } from "../../src/worker/db/schema";
import { groupsRouter } from "../../src/worker/routes/groups";
import { appWith } from "../helpers/session";
import { eq } from "drizzle-orm";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "I", createdAt: now, updatedAt: now });
});

describe("groups", () => {
  it("creates a group and nulls point.group_id on delete", async () => {
    const app = appWith("alice", groupsRouter);
    const g = await (await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "must-see", color: "#C64A3B" }),
    }))).json<{ id: string }>();

    const now = Date.now();
    await getDb(env).insert(points).values({ id: "p0", tripId: "t1", name: "P", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "idea", groupId: g.id, createdAt: now });

    await call(app, new Request(`http://x/api/groups/${g.id}`, { method: "DELETE" }));
    const p = (await getDb(env).select().from(points).where(eq(points.id, "p0")))[0];
    expect(p.groupId).toBeNull();
  });

  it("404s creating a group on another user's trip", async () => {
    const app = appWith("bob", groupsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/groups", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }),
    }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- groups`
Expected: FAIL — `groups.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/routes/groups.ts`:
```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, groups, trips } from "../db/schema";
import { newId } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const groupsRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

groupsRouter.post("/api/trips/:id/groups", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const b = await c.req.json<{ name?: string; color?: string }>();
  if (!b.name) return c.json({ error: "name required" }, 400);
  const row = { id: newId(), tripId: trip.id, name: b.name, color: b.color ?? null };
  await getDb(c.env).insert(groups).values(row);
  return c.json(row, 201);
});

async function groupOwner(db: ReturnType<typeof getDb>, gid: string) {
  return (await db.select({ userId: trips.userId }).from(groups)
    .innerJoin(trips, eq(groups.tripId, trips.id)).where(eq(groups.id, gid)).limit(1))[0];
}

groupsRouter.patch("/api/groups/:gid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await groupOwner(db, c.req.param("gid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ name?: string; color?: string }>();
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = b.name;
  if ("color" in b) patch.color = b.color;
  await db.update(groups).set(patch).where(eq(groups.id, c.req.param("gid")));
  return c.json((await db.select().from(groups).where(eq(groups.id, c.req.param("gid"))).limit(1))[0]);
});

groupsRouter.delete("/api/groups/:gid", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const owner = await groupOwner(db, c.req.param("gid"));
  if (!owner || owner.userId !== user.id) return c.json({ error: "not found" }, 404);
  await db.delete(groups).where(eq(groups.id, c.req.param("gid")));
  return c.body(null, 204);
});
```

- [ ] **Step 4: Mount**

In `src/worker/index.ts`: `import { groupsRouter } from "./routes/groups";` and `app.route("/", groupsRouter);`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- groups`
Expected: PASS (2 tests). Note the FK `ON DELETE SET NULL` requires D1 foreign keys active — the pool applies migrations with FKs enforced, so the null-on-delete assertion validates it.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: groups CRUD with point group_id null-on-delete"
```

---

### Task 12: Share links (mint/revoke + public read-only payload)

**Files:**
- Create: `src/worker/routes/share.ts`
- Modify: `src/worker/index.ts` (mount; ensure `/s/*` is OUTSIDE the auth guard)
- Test: `test/worker/share.test.ts`

**Interfaces:**
- Consumes: `requireTrip`; `newShareToken`; `dayFuelCost` (for distance/time only — fuel/cost stripped).
- Produces:
  - `POST /api/trips/:id/share` → `{ shareToken }` (mints if absent, else returns existing).
  - `DELETE /api/trips/:id/share` → rotates: sets a new token (old link dies), returns `{ shareToken }`.
  - `GET /s/:token` (no auth) → `{ trip: { name, startDate }, days, stops, points (name,type,lat,lng,links,bookingStatus,groupId), groups, routes: {polyline,distanceM,durationS}, stats: { totalDistanceM, totalDurationS, perDay:{distanceM,durationS} } }` — **no fuel, no est_cost/cost_basis, no vehicle_notes, no budget, no user_id** (spec §7.7).

- [ ] **Step 1: Write the failing test**

`test/worker/share.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, points, dayStops, dayRoutes } from "../../src/worker/db/schema";
import { shareRouter } from "../../src/worker/routes/share";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeEach(async () => {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", startDate: "2026-07-12", vehicleNotes: "secret van", fuelLPer100km: 8, fuelPricePerL: 1.9, createdAt: now, updatedAt: now });
  await getDb(env).insert(days).values({ id: "d0", tripId: "t1", position: 0, title: "A", notes: null, departureTime: null, targetArrivalTime: null });
  await getDb(env).insert(points).values({ id: "p0", tripId: "t1", name: "P", lat: 1, lng: 1, coordSource: "user", type: "poi", bookingStatus: "booked", estCost: 99, costBasis: "per_night", createdAt: now });
  await getDb(env).insert(dayStops).values({ dayId: "d0", pointId: "p0", position: 0 });
  await getDb(env).insert(dayRoutes).values({ dayId: "d0", waypointsHash: "h", polyline: "poly", distanceM: 200000, durationS: 7200, computedAt: now });
});

describe("share", () => {
  it("mints a token then serves a public payload with fuel/cost stripped", async () => {
    const owner = appWith("alice", shareRouter);
    const { shareToken } = await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "POST" }))).json<{ shareToken: string }>();
    expect(shareToken).toHaveLength(21);

    const anon = appWith(null, shareRouter);
    const res = await call(anon, new Request(`http://x/s/${shareToken}`));
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.trip.name).toBe("Iceland");
    expect(body.trip.vehicleNotes).toBeUndefined();       // stripped
    expect(body.stats.totalFuel).toBeUndefined();         // no fuel in share
    expect(body.points[0].estCost).toBeUndefined();       // cost stripped
    expect(body.points[0].bookingStatus).toBe("booked");  // status kept
    expect(body.routes.d0.polyline).toBe("poly");
    expect(body.stats.totalDistanceM).toBe(200000);
  });

  it("rotating the token kills the old link", async () => {
    const owner = appWith("alice", shareRouter);
    const first = (await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "POST" }))).json<{ shareToken: string }>()).shareToken;
    const rotated = (await (await call(owner, new Request("http://x/api/trips/t1/share", { method: "DELETE" }))).json<{ shareToken: string }>()).shareToken;
    expect(rotated).not.toBe(first);
    const anon = appWith(null, shareRouter);
    expect((await call(anon, new Request(`http://x/s/${first}`))).status).toBe(404);
    expect((await call(anon, new Request(`http://x/s/${rotated}`))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:worker -- share`
Expected: FAIL — `share.ts` missing.

- [ ] **Step 3: Implement**

`src/worker/routes/share.ts`:
```ts
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { getDb, trips, groups, points, days, dayStops, dayRoutes } from "../db/schema";
import { newShareToken } from "../lib/id";
import { requireTrip } from "../lib/ownership";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const shareRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

shareRouter.post("/api/trips/:id/share", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const db = getDb(c.env);
  const row = (await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1))[0];
  let token = row.shareToken;
  if (!token) { token = newShareToken(); await db.update(trips).set({ shareToken: token }).where(eq(trips.id, trip.id)); }
  return c.json({ shareToken: token });
});

shareRouter.delete("/api/trips/:id/share", async (c) => {
  const { trip, code } = await requireTrip(c, c.req.param("id"));
  if (!trip) return c.json({ error: "not found" }, code);
  const token = newShareToken();
  await getDb(c.env).update(trips).set({ shareToken: token }).where(eq(trips.id, trip.id));
  return c.json({ shareToken: token });
});

shareRouter.get("/s/:token", async (c) => {
  const db = getDb(c.env);
  const trip = (await db.select().from(trips).where(eq(trips.shareToken, c.req.param("token"))).limit(1))[0];
  if (!trip) return c.json({ error: "not found" }, 404);

  const [grp, pts, dys] = await Promise.all([
    db.select().from(groups).where(eq(groups.tripId, trip.id)),
    db.select().from(points).where(eq(points.tripId, trip.id)),
    db.select().from(days).where(eq(days.tripId, trip.id)),
  ]);
  const dayIds = dys.map((d) => d.id);
  const stops = dayIds.length ? await db.select().from(dayStops).where(inArray(dayStops.dayId, dayIds)) : [];
  const routeRows = dayIds.length ? await db.select().from(dayRoutes).where(inArray(dayRoutes.dayId, dayIds)) : [];

  const routes: Record<string, { polyline: string; distanceM: number; durationS: number }> = {};
  const perDay: Record<string, { distanceM: number; durationS: number }> = {};
  let totalDistanceM = 0, totalDurationS = 0;
  for (const r of routeRows) {
    routes[r.dayId] = { polyline: r.polyline, distanceM: r.distanceM, durationS: r.durationS };
    perDay[r.dayId] = { distanceM: r.distanceM, durationS: r.durationS };
    totalDistanceM += r.distanceM; totalDurationS += r.durationS;
  }

  return c.json({
    trip: { name: trip.name, startDate: trip.startDate },
    groups: grp.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    points: pts.map((p) => ({ id: p.id, name: p.name, type: p.type, lat: p.lat, lng: p.lng,
      links: p.links ? JSON.parse(p.links) : [], bookingStatus: p.bookingStatus, groupId: p.groupId })),
    days: dys.map((d) => ({ id: d.id, position: d.position, title: d.title })),
    stops,
    routes,
    stats: { totalDistanceM, totalDurationS, perDay },
  });
});
```

- [ ] **Step 4: Mount OUTSIDE the auth guard**

In `src/worker/index.ts`, mount the share router. The `POST/DELETE /api/trips/:id/share` routes run under the existing `/api/*` session middleware (fine — they need auth). The `GET /s/:token` route is not under `/api/*`, so it is already outside the guard. Add `import { shareRouter } from "./routes/share";` and `app.route("/", shareRouter);`.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:worker -- share`
Expected: PASS (2 tests) — public payload strips fuel/cost/vehicle notes; rotation invalidates the old token.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: share links — mint/rotate + public read-only payload with private fields stripped"
```

---

### Task 13: Full-suite green + trip-detail wiring check

**Files:**
- Modify: none expected (integration checkpoint)
- Test: run everything

**Interfaces:** none.

- [ ] **Step 1: Run the entire worker suite**

Run: `npm run test:worker`
Expected: PASS — all Phase 0 + Phase 1a worker tests (health, schema, auth-guard, trips, ownership, points, days, fuel, waypoints, positions, routes-google, reconcile, stops, trip-detail, groups, share).

- [ ] **Step 2: Run the client suite (unchanged) + build**

Run: `npm test && npm run build`
Expected: client remount-guard still passes; SPA + worker build clean.

- [ ] **Step 3: Commit any incidental fixes**

```bash
git add -A && git commit -m "test: Phase 1a full-suite green checkpoint" --allow-empty
```

---

## Self-Review

**Spec coverage (Phase 1a scope — spec §3–§5, §7):**
- Points CRUD, pooled default, `links` as `{label,url}` → Task 2 ✓
- Days CRUD + `title` → Task 3 ✓
- Fuel math (both-params rule) → Task 4 ✓
- Inter-day route origin = previous day's last stop (§4.1) → Task 5 (`dayWaypoints`) + Task 8 (`reconcileDayRoutes`) ✓
- Route cache + hash + 30-day refresh + cascade via hash (§4.2) → Task 8 ✓
- Stops write folds reconcile; commits stops even if Google fails (§4.3) → Task 9 ✓
- Google Routes client, server-only, minimal field mask, TRAFFIC_UNAWARE (§8) → Task 7 ✓
- Batched `GET /api/trips/:id` + per-day/total stats + long-day warning (§4.4, §6.3) → Task 10 ✓
- Groups CRUD + null-on-delete → Task 11 ✓
- Share mint/rotate + public payload with fuel/cost stripped (§7.7, §8, §10) → Task 12 ✓
- Ownership 404s across all trip-scoped routes (§5) → Task 1 + applied per router ✓
- Position rewrite / dedupe (§3 composite PK) → Task 6 ✓
- **Not in 1a (Phase 1b):** all UI, drag/tap assignment, map rendering, focus mechanic, share view rendering, printable output. **Deferred (v1.5+):** photo upload, budget rollup, clustering, mobile editor, AI.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every test step shows real assertions. `GOOGLE_ROUTES_KEY` is added to `AppEnv` (Task 9 Step 3) and to the vitest bindings (Task 9 Step 4) before any route uses it.

**Type consistency:** `Coord`, `RouteResult`, `RouteComputer` defined in Tasks 5/7 and consumed unchanged in 8/9. `reconcileDayRoutes(db, tripId, compute)` signature identical in Tasks 8 and 9. `dayFuelCost(distanceM, lPer100km, pricePerL)` identical in Tasks 4, 10, and (by exclusion) 12. `appWith(userId, ...routers)` defined in Task 1 and used by every later test. `requireTrip` return shape `{ trip, code }` consistent across Tasks 1/2/3/10/12.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-roadline-phase1a-backend.md`. It produces a complete, tested backend for the manual planning loop — no UI, but every endpoint Phase 1b needs, with the inter-day route engine correct and network-free under test.
