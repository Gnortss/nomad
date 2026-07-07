# ROADLINE Phase 0 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deployable skeleton — a single Cloudflare Worker serving a React SPA, a Hono JSON API, D1 via Drizzle with all v1 tables migrated, Google sign-in via better-auth, an ownership-guarded API scaffold, and a persistent, design-tokened Google Map that renders only behind login.

**Architecture:** One Worker (`@cloudflare/vite-plugin` builds the SPA + Worker as one unit) runs a Hono router: `/api/auth/*` → better-auth, `/api/*` → app routes guarded by session ownership, and static-asset fallback → SPA. One D1 database holds better-auth's tables plus the app schema. The frontend is a client-rendered SPA (TanStack Query for server state, `@vis.gl/react-google-maps` for a single never-unmounting map instance).

**Tech Stack:** Vite + React + TypeScript · `@cloudflare/vite-plugin` · Hono · Drizzle ORM (`drizzle-orm/d1`) + drizzle-kit · Cloudflare D1 · better-auth (Google social provider, Drizzle adapter) · `@vis.gl/react-google-maps` · TanStack Query · Vitest with `@cloudflare/vitest-pool-workers` for Worker/D1 integration tests.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-07-road-trip-planner-v1-design.md` is the contract. Visual contract: Claude Design project `Trip Editor.dc.html` + `Design Spec.md`.
- **Node** ≥ 20. **Package manager:** npm (lockfile committed).
- **One D1 database**, bound as `DB`. All FK/filter columns indexed (D1 bills rows *scanned*).
- **Two environments:** `preview` and `production` Worker + D1 pairs. Never test migrations against production.
- **Two Google Maps browser keys** (dev, prod) + one server key — never share keys across dev/prod (StrictMode double-mounts in dev and would pollute prod quota).
- **Auth instance created once per request** in Hono middleware, reused via context (multiple instances per request cause conflicting D1 writes).
- **Design tokens (verbatim):** Basalt `#1E2A2C`, Glacier `#ECF0F0`, Slate `#57676B`, Lupine `#5B44C9`, Sulfur `#E39A0C`, Moss `#2F7A55`. Fonts: Overpass (display/shields), Public Sans (body), Overpass Mono (data/stats), via Google Fonts. Light mode only.
- **TDD:** every logic/API task is test-first. Commit after each green test.
- **Secrets** (`wrangler secret put` / GitHub Actions secrets, never committed): `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ROUTES_KEY` (server key, unused until Phase 1a). Public build var: `VITE_GOOGLE_MAPS_BROWSER_KEY`, `VITE_GOOGLE_MAPS_MAP_ID`.

---

### Task 1: Repo scaffold + Worker health endpoint

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `wrangler.jsonc`, `.gitignore`, `index.html`
- Create: `src/worker/index.ts` (Hono app + Worker entry)
- Create: `src/client/main.tsx`, `src/client/App.tsx`
- Create: `vitest.config.ts`, `test/worker/health.test.ts`

**Interfaces:**
- Produces: the Hono app default-exported from `src/worker/index.ts` as `{ fetch }`; `GET /api/health` → `200 {"ok":true}`. Later tasks mount routers onto this app.

- [ ] **Step 1: Initialize repo and install dependencies**

Run:
```bash
cd D:/dev/nomad
git init
npm init -y
npm install hono
npm install -D typescript vite @cloudflare/vite-plugin wrangler @cloudflare/workers-types \
  @vitejs/plugin-react react react-dom @types/react @types/react-dom \
  vitest @cloudflare/vitest-pool-workers
```
Expected: `node_modules/` present, no install errors.

- [ ] **Step 2: Write config files**

`.gitignore`:
```
node_modules
dist
.wrangler
.dev.vars
*.local
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types", "vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`wrangler.jsonc`:
```jsonc
{
  "name": "roadline",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./dist/client", "not_found_handling": "single-page-application" },
  "d1_databases": [
    { "binding": "DB", "database_name": "roadline-dev", "database_id": "REPLACE_AFTER_D1_CREATE", "migrations_dir": "migrations" }
  ],
  "env": {
    "preview":    { "d1_databases": [{ "binding": "DB", "database_name": "roadline-preview", "database_id": "REPLACE", "migrations_dir": "migrations" }] },
    "production": { "d1_databases": [{ "binding": "DB", "database_name": "roadline-prod",    "database_id": "REPLACE", "migrations_dir": "migrations" }] }
  }
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: { outDir: "dist/client" },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ROADLINE</title></head>
  <body><div id="root"></div><script type="module" src="/src/client/main.tsx"></script></body>
</html>
```

- [ ] **Step 3: Write the Worker entry and minimal client**

`src/worker/index.ts`:
```ts
import { Hono } from "hono";

export type Env = { DB: D1Database };

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
```

`src/client/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
```

`src/client/App.tsx`:
```tsx
export function App() {
  return <div>ROADLINE</div>;
}
```

- [ ] **Step 4: Write the failing health test**

`vitest.config.ts`:
```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: "./src/worker/index.ts",
        miniflare: { compatibilityDate: "2025-01-01", compatibilityFlags: ["nodejs_compat"] },
      },
    },
  },
});
```

`test/worker/health.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../../src/worker/index";

describe("health", () => {
  it("returns ok", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://x/api/health"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"dev": "vite"`, `"build": "vite build"`, `"deploy": "wrangler deploy"`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Worker + SPA with health endpoint"
```

---

### Task 2: D1 database + Drizzle schema + migrations

**Files:**
- Create: `src/worker/db/schema.ts` (all v1 app tables)
- Create: `drizzle.config.ts`
- Create: `migrations/` (generated SQL)
- Create: `test/worker/schema.test.ts`
- Modify: `wrangler.jsonc` (fill real `database_id` for dev)

**Interfaces:**
- Produces: Drizzle table objects `trips, groups, points, days, dayStops, dayRoutes` exported from `src/worker/db/schema.ts`; a `getDb(env)` helper returning `drizzle(env.DB, { schema })`. Column names and types exactly match spec §3.

- [ ] **Step 1: Install Drizzle**

Run: `npm install drizzle-orm && npm install -D drizzle-kit`
Expected: installed.

- [ ] **Step 2: Create the dev D1 database**

Run: `npx wrangler d1 create roadline-dev`
Expected: prints a `database_id`. Paste it into `wrangler.jsonc` (dev binding). (Create `roadline-preview` and `roadline-prod` now too and fill their ids, or defer prod/preview ids to Task 7.)

- [ ] **Step 3: Write the schema**

`src/worker/db/schema.ts`:
```ts
import { sqliteTable, text, real, integer, primaryKey, index, unique } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";

// better-auth owns user/session/account/verification; app tables reference user.id (added in Task 3's generated auth tables).
export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  vehicleNotes: text("vehicle_notes"),
  fuelLPer100km: real("fuel_l_per_100km"),
  fuelPricePerL: real("fuel_price_per_l"),
  currency: text("currency").notNull().default("EUR"),
  budgetTotal: real("budget_total"),
  shareToken: text("share_token").unique(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({ userIdx: index("idx_trips_user").on(t.userId) }));

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
}, (t) => ({ tripIdx: index("idx_groups_trip").on(t.tripId) }));

export const points = sqliteTable("points", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  coordSource: text("coord_source").notNull().default("user"),
  coordFetchedAt: integer("coord_fetched_at"),
  googlePlaceId: text("google_place_id"),
  type: text("type").notNull().default("poi"),
  notes: text("notes"),
  links: text("links"), // JSON array of {label, url}
  estCost: real("est_cost"),
  costBasis: text("cost_basis"),
  bookingStatus: text("booking_status").notNull().default("idea"),
  groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ tripIdx: index("idx_points_trip").on(t.tripId) }));

export const days = sqliteTable("days", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title"),
  departureTime: text("departure_time"),
  targetArrivalTime: text("target_arrival_time"),
  notes: text("notes"),
}, (t) => ({ tripPos: unique("uq_days_trip_position").on(t.tripId, t.position) }));

export const dayStops = sqliteTable("day_stops", {
  dayId: text("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  pointId: text("point_id").notNull().references(() => points.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.dayId, t.pointId] }),
  orderIdx: index("idx_day_stops_order").on(t.dayId, t.position),
}));

export const dayRoutes = sqliteTable("day_routes", {
  dayId: text("day_id").primaryKey().references(() => days.id, { onDelete: "cascade" }),
  waypointsHash: text("waypoints_hash").notNull(),
  polyline: text("polyline").notNull(),
  distanceM: integer("distance_m").notNull(),
  durationS: integer("duration_s").notNull(),
  computedAt: integer("computed_at").notNull(),
});

export const schema = { trips, groups, points, days, dayStops, dayRoutes };
export function getDb(env: Env) { return drizzle(env.DB, { schema }); }
```

- [ ] **Step 4: Configure drizzle-kit and generate the migration**

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});
```

Run: `npx drizzle-kit generate --name init_app_schema`
Expected: a `migrations/0000_*.sql` file containing the six `CREATE TABLE` statements + indexes.

- [ ] **Step 5: Apply migration to local D1**

Run: `npx wrangler d1 migrations apply roadline-dev --local`
Expected: "Migrations applied successfully."

- [ ] **Step 6: Write the failing schema round-trip test**

`test/worker/schema.test.ts`:
```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";

describe("schema", () => {
  it("inserts and reads a trip", async () => {
    const db = getDb(env);
    const now = Date.now();
    await db.insert(trips).values({ id: "t1", userId: "u1", name: "Iceland", createdAt: now, updatedAt: now });
    const rows = await db.select().from(trips);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Iceland");
    expect(rows[0].currency).toBe("EUR");
  });
});
```

Make migrations auto-apply in tests by adding to `vitest.config.ts` miniflare options:
```ts
// inside poolOptions.workers.miniflare, add:
d1Databases: { DB: ":memory:" },
// and apply migrations via a setup file:
```
Add `test/apply-migrations.ts`:
```ts
import { applyD1Migrations, env } from "cloudflare:test";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```
And in `vitest.config.ts` `test`: `setupFiles: ["./test/apply-migrations.ts"]`, plus bind migrations:
```ts
// poolOptions.workers.miniflare.bindings: { TEST_MIGRATIONS: (await readD1Migrations("./migrations")) }
// import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, health + schema tests green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: D1 schema (v1 tables) with Drizzle migrations and round-trip test"
```

---

### Task 3: better-auth with Google provider + per-request auth middleware

**Files:**
- Create: `src/worker/auth.ts` (`createAuth(env)`)
- Modify: `src/worker/index.ts` (mount `/api/auth/*`, add session middleware)
- Create: `.dev.vars` (local secrets, gitignored)
- Create: `test/worker/auth-guard.test.ts`
- Modify: `drizzle.config.ts` / regenerate migration to include better-auth tables

**Interfaces:**
- Consumes: `getDb(env)`, `Env` from Task 2.
- Produces: `createAuth(env)` returning a better-auth instance whose handler serves `/api/auth/*`; Hono middleware that sets `c.set("user", session?.user ?? null)`; a typed `Variables = { user: { id: string } | null }`. Protected routes read `c.get("user")` and return `401` when null.

- [ ] **Step 1: Install better-auth**

Run: `npm install better-auth`
Expected: installed.

- [ ] **Step 2: Add better-auth tables to the schema and regenerate migration**

Add better-auth's required tables to `src/worker/db/schema.ts` (`user`, `session`, `account`, `verification`) following better-auth's Drizzle sqlite schema (id/text PKs, `user.email` unique, `session.token`, `session.userId`, `account.providerId`/`accountId`, timestamps as integer epoch ms). Then:

Run: `npx drizzle-kit generate --name better_auth_tables && npx wrangler d1 migrations apply roadline-dev --local`
Expected: new migration file + applied.

(If you prefer better-auth's CLI to author its tables: `npx @better-auth/cli generate` against the config, then reconcile into the Drizzle schema so migrations stay the single source of truth.)

- [ ] **Step 3: Write the auth factory**

`src/worker/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "./db/schema";
import type { Env } from "./index";

export type AppEnv = Env & {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string;
};

export function createAuth(env: AppEnv) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
  });
}
```

- [ ] **Step 4: Mount auth + session middleware in the Worker**

`src/worker/index.ts`:
```ts
import { Hono } from "hono";
import { createAuth, type AppEnv } from "./auth";

export type Env = { DB: D1Database };
type Variables = { user: { id: string } | null };

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ? { id: session.user.id } : null);
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

export default app;
```

`.dev.vars` (gitignored):
```
BETTER_AUTH_SECRET=dev-secret-change-me
BETTER_AUTH_URL=http://localhost:5173
GOOGLE_CLIENT_ID=dev-client-id
GOOGLE_CLIENT_SECRET=dev-client-secret
```

- [ ] **Step 5: Write the failing guard test**

`test/worker/auth-guard.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../../src/worker/index";

describe("auth guard", () => {
  it("returns 401 for a protected route with no session", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://x/api/trips"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 6: Add the protected `/api/trips` stub so the guard has something to guard**

In `src/worker/index.ts`, after the auth middleware:
```ts
app.get("/api/trips", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ trips: [] });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. The unauthenticated request to `/api/trips` returns 401.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: better-auth Google provider + per-request session guard"
```

---

### Task 4: Ownership-guarded trips list/create with a test session helper

**Files:**
- Create: `src/worker/routes/trips.ts` (list + create, ownership-scoped)
- Modify: `src/worker/index.ts` (mount the router, remove the inline stub)
- Create: `src/worker/lib/id.ts` (nanoid wrapper)
- Create: `test/worker/trips.test.ts`
- Create: `test/helpers/session.ts` (inject a fake user into a request)

**Interfaces:**
- Consumes: `getDb`, `trips` from Task 2; `c.get("user")` from Task 3.
- Produces: `tripsRouter` (a Hono sub-app) with `GET /api/trips` (own trips only) and `POST /api/trips` (`{ name }` → created trip). `newId()` from `lib/id.ts`.

- [ ] **Step 1: Install nanoid and write the id helper**

Run: `npm install nanoid`

`src/worker/lib/id.ts`:
```ts
import { nanoid } from "nanoid";
export const newId = () => nanoid();
export const newShareToken = () => nanoid(21);
```

- [ ] **Step 2: Write the failing trips test with a session helper**

`test/helpers/session.ts`:
```ts
// Builds a Hono app instance whose auth middleware is bypassed with a fixed user,
// so route logic (ownership, DB writes) is testable without the real OAuth flow.
import { Hono } from "hono";
import { tripsRouter } from "../../src/worker/routes/trips";
import type { AppEnv } from "../../src/worker/auth";

export function appAs(userId: string | null) {
  const app = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();
  app.use("/api/*", async (c, next) => { c.set("user", userId ? { id: userId } : null); await next(); });
  app.route("/", tripsRouter);
  return app;
}
```

`test/worker/trips.test.ts`:
```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { appAs } from "../helpers/session";

async function call(app: ReturnType<typeof appAs>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("trips", () => {
  it("creates a trip and lists only the owner's trips", async () => {
    const alice = appAs("alice");
    const created = await call(alice, new Request("http://x/api/trips", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Iceland" }),
    }));
    expect(created.status).toBe(201);
    const trip = await created.json<{ id: string; name: string }>();
    expect(trip.name).toBe("Iceland");

    const aliceList = await (await call(alice, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(aliceList.trips).toHaveLength(1);

    const bob = appAs("bob");
    const bobList = await (await call(bob, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(bobList.trips).toHaveLength(0);
  });

  it("rejects unauthenticated create", async () => {
    const anon = appAs(null);
    const res = await call(anon, new Request("http://x/api/trips", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "X" }),
    }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/worker/routes/trips.ts` does not exist.

- [ ] **Step 4: Implement the trips router**

`src/worker/routes/trips.ts`:
```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, trips } from "../db/schema";
import { newId } from "../lib/id";
import type { AppEnv } from "../auth";

export const tripsRouter = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

tripsRouter.get("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const rows = await db.select().from(trips).where(eq(trips.userId, user.id));
  return c.json({ trips: rows });
});

tripsRouter.post("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { name } = await c.req.json<{ name?: string }>();
  if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
  const db = getDb(c.env);
  const now = Date.now();
  const row = { id: newId(), userId: user.id, name: name.trim(), currency: "EUR", createdAt: now, updatedAt: now };
  await db.insert(trips).values(row);
  return c.json(row, 201);
});
```

- [ ] **Step 5: Mount the router and drop the inline stub**

In `src/worker/index.ts`, remove the inline `app.get("/api/trips", ...)` from Task 3 and add:
```ts
import { tripsRouter } from "./routes/trips";
// after the session middleware:
app.route("/", tripsRouter);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — create returns 201, ownership isolation holds, anon create is 401.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: ownership-guarded trips list/create with session test helper"
```

---

### Task 5: Frontend shell — TanStack Query, auth state, login screen, design tokens

**Files:**
- Create: `src/client/lib/queryClient.ts`
- Create: `src/client/lib/auth.ts` (better-auth React client)
- Create: `src/client/styles/tokens.css` (design tokens + fonts)
- Modify: `src/client/main.tsx` (providers + token import)
- Modify: `src/client/App.tsx` (login vs shell)
- Create: `src/client/screens/Login.tsx`, `src/client/screens/AppShell.tsx`

**Interfaces:**
- Consumes: `/api/auth/*` (Task 3), `GET /api/trips` (Task 4).
- Produces: `useSession()` from `lib/auth.ts`; `App` renders `<Login/>` when unauthenticated and `<AppShell/>` when authenticated. CSS custom properties `--basalt`, `--glacier`, `--slate`, `--lupine`, `--sulfur`, `--moss` available globally.

- [ ] **Step 1: Install client deps**

Run: `npm install @tanstack/react-query better-auth`
(`better-auth` already installed; it also ships the React client used here.)

- [ ] **Step 2: Design tokens and fonts**

`src/client/styles/tokens.css`:
```css
@import url("https://fonts.googleapis.com/css2?family=Overpass:wght@400;600;700;800&family=Overpass+Mono:wght@400;600&family=Public+Sans:wght@400;500;600;700&display=swap");
:root {
  --basalt:#1E2A2C; --glacier:#ECF0F0; --slate:#57676B;
  --lupine:#5B44C9; --sulfur:#E39A0C; --moss:#2F7A55;
  --font-body:"Public Sans",system-ui,sans-serif;
  --font-display:"Overpass",sans-serif;
  --font-mono:"Overpass Mono",monospace;
}
* { box-sizing:border-box; }
html,body,#root { margin:0; height:100%; }
body { font-family:var(--font-body); color:var(--basalt); background:var(--glacier); -webkit-font-smoothing:antialiased; }
.mono { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
.ovp { font-family:var(--font-display); }
```

- [ ] **Step 3: Query client and auth client**

`src/client/lib/queryClient.ts`:
```ts
import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
```

`src/client/lib/auth.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: window.location.origin });
export const useSession = authClient.useSession;
export const signInWithGoogle = () => authClient.signIn.social({ provider: "google", callbackURL: "/" });
export const signOut = () => authClient.signOut();
```

- [ ] **Step 4: Providers**

`src/client/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { App } from "./App";
import "./styles/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 5: Login and shell screens; wire App**

`src/client/screens/Login.tsx`:
```tsx
import { signInWithGoogle } from "../lib/auth";
export function Login() {
  return (
    <div style={{ height:"100%", display:"grid", placeItems:"center" }}>
      <div style={{ maxWidth:420, padding:24 }}>
        <div className="ovp" style={{ fontWeight:800, letterSpacing:".06em", fontSize:20 }}>▮ ROADLINE</div>
        <h1 style={{ fontSize:28, marginTop:16 }}>Plan the drive. Not just the destination.</h1>
        <button onClick={signInWithGoogle}
          style={{ marginTop:20, height:44, padding:"0 18px", background:"var(--lupine)", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer" }}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
```

`src/client/screens/AppShell.tsx`:
```tsx
import { signOut } from "../lib/auth";
export function AppShell() {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column" }}>
      <header style={{ height:56, display:"flex", alignItems:"center", gap:16, padding:"0 18px", background:"var(--basalt)", color:"var(--glacier)" }}>
        <span className="ovp" style={{ fontWeight:800, letterSpacing:".06em" }}>ROADLINE</span>
        <div style={{ flex:1 }} />
        <button onClick={signOut} style={{ background:"transparent", color:"var(--glacier)", border:"1px solid rgba(236,240,240,.3)", borderRadius:7, padding:"6px 12px", cursor:"pointer" }}>Sign out</button>
      </header>
      <div id="app-body" style={{ flex:1, minHeight:0 }} />
    </div>
  );
}
```

`src/client/App.tsx`:
```tsx
import { useSession } from "./lib/auth";
import { Login } from "./screens/Login";
import { AppShell } from "./screens/AppShell";
export function App() {
  const { data, isPending } = useSession();
  if (isPending) return <div style={{ height:"100%", display:"grid", placeItems:"center" }} className="mono">Loading…</div>;
  return data?.user ? <AppShell /> : <Login />;
}
```

- [ ] **Step 6: Verify by running the dev server**

Run: `npm run dev`
Expected: at `http://localhost:5173` the Login screen renders in Public Sans with the Lupine button and Glacier background. (Full Google OAuth needs real credentials from Task 6/7; unauthenticated state showing `<Login/>` is the check here.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: frontend shell with auth-gated login screen and design tokens"
```

---

### Task 6: Persistent Google Map behind login

**Files:**
- Create: `src/client/map/MapCanvas.tsx` (single map instance)
- Modify: `src/client/screens/AppShell.tsx` (mount the map in the body, never keyed)
- Create: `.dev.vars` additions + `src/client/env.d.ts` (typed `import.meta.env`)
- Create: `test/client/map-canvas.test.tsx` (guards against remount-by-key)

**Interfaces:**
- Consumes: `VITE_GOOGLE_MAPS_BROWSER_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` from Vite env.
- Produces: `<MapCanvas/>` — an `APIProvider` + `Map` that mounts exactly once. No `key` prop derived from trip/day state anywhere up its tree (the cost rule, spec §8).

- [ ] **Step 1: Install the map wrapper and create the Map ID**

Run: `npm install @vis.gl/react-google-maps`

In Google Cloud console (same project as auth): create a **cloud-styled Map ID** with a muted gray-green style; enable **Maps JavaScript API**; create a **browser API key** restricted to the dev HTTP referrer with only Maps JS + Places enabled. Put both in `.dev.vars`-adjacent Vite env — create `.env.local` (gitignored):
```
VITE_GOOGLE_MAPS_BROWSER_KEY=your-dev-browser-key
VITE_GOOGLE_MAPS_MAP_ID=your-map-id
```

`src/client/env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

- [ ] **Step 2: Write the MapCanvas**

`src/client/map/MapCanvas.tsx`:
```tsx
import { APIProvider, Map } from "@vis.gl/react-google-maps";

const ICELAND = { lat: 64.9631, lng: -19.0208 };

export function MapCanvas() {
  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>
      <Map
        mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
        defaultCenter={ICELAND}
        defaultZoom={6}
        gestureHandling="greedy"
        disableDefaultUI
        style={{ width: "100%", height: "100%" }}
      />
    </APIProvider>
  );
}
```

- [ ] **Step 3: Mount the map once in the shell**

`src/client/screens/AppShell.tsx` — replace the empty `#app-body` div:
```tsx
import { MapCanvas } from "../map/MapCanvas";
// ...
<div id="app-body" style={{ flex:1, minHeight:0 }}>
  <MapCanvas />
</div>
```

- [ ] **Step 4: Write the failing remount-guard test**

Install jsdom test deps: `npm install -D @testing-library/react jsdom @vitejs/plugin-react`

Add a jsdom project so client tests don't run in the workers pool. In `vitest.config.ts`, use a projects array: one project `workers` (existing config, `include: ["test/worker/**"]`) and one project `client` (`environment: "jsdom"`, `include: ["test/client/**"]`).

`test/client/map-canvas.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "../../src/client/screens/AppShell";

// The map SDK is not loaded in jsdom; stub the wrapper so we test structure, not Google.
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: any) => <div data-testid="api-provider">{children}</div>,
  Map: () => <div data-testid="map" />,
}));
vi.mock("../../src/client/lib/auth", () => ({ signOut: vi.fn() }));

describe("MapCanvas mounting", () => {
  it("renders exactly one map instance in the shell", () => {
    const { getAllByTestId } = render(<AppShell />);
    expect(getAllByTestId("map")).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — one map instance renders. (This locks in the invariant; future tasks that add trip/day switching must not wrap `MapCanvas` in a keyed subtree.)

- [ ] **Step 6: Visually verify behind login**

Run: `npm run dev`, sign in with a real Google account (needs Task 7 OAuth client + a localhost redirect URI). Expected: the styled Iceland map fills the body under the top bar and does not flicker/reload when the panel state changes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: persistent styled Google Map behind login"
```

---

### Task 7: CI deploy + preview/production environments

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `docs/DEPLOY.md` (secret + env setup runbook)
- Modify: `wrangler.jsonc` (fill preview/prod `database_id`s)

**Interfaces:**
- Produces: a GitHub Actions workflow that builds and deploys to `production` on push to `main`, and (optionally) to `preview` on PRs. Migrations applied to the target D1 before deploy.

- [ ] **Step 1: Create preview/prod D1 and OAuth redirect URIs**

Run:
```bash
npx wrangler d1 create roadline-preview
npx wrangler d1 create roadline-prod
```
Paste both ids into `wrangler.jsonc`. In the Google OAuth client, register redirect URIs: `https://<prod-domain>/api/auth/callback/google`, the preview equivalent, and `http://localhost:5173/api/auth/callback/google`.

- [ ] **Step 2: Set Worker secrets per environment**

Run (repeat for `--env preview` and `--env production`):
```bash
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
npx wrangler secret put GOOGLE_ROUTES_KEY --env production
```
Expected: each prompts and stores the secret. Also set `vars` `BETTER_AUTH_URL` per env in `wrangler.jsonc` (`https://<domain>`).

- [ ] **Step 3: Write the deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: deploy
on:
  push: { branches: [main] }
  pull_request: {}
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Apply migrations + deploy (production on main)
        if: github.ref == 'refs/heads/main'
        run: |
          npx wrangler d1 migrations apply roadline-prod --env production --remote
          npx wrangler deploy --env production
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }} }
      - name: Deploy preview (PRs)
        if: github.event_name == 'pull_request'
        run: |
          npx wrangler d1 migrations apply roadline-preview --env preview --remote
          npx wrangler deploy --env preview
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }} }
```

- [ ] **Step 4: Document the runbook**

`docs/DEPLOY.md`: list the GitHub secret `CLOUDFLARE_API_TOKEN` (Workers+D1 edit scope), the four Worker secrets per env, the two Vite build vars (browser key + Map ID — set as repo/Actions variables and passed to `npm run build`), and the OAuth redirect URIs.

- [ ] **Step 5: Verify the workflow parses and the build is green locally**

Run: `npm ci && npm test && npm run build`
Expected: tests pass, `dist/client` produced, no type errors. (First real deploy happens on the initial push to `main` once secrets are set.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "ci: GitHub Actions deploy with preview/production environments"
```

---

## Self-Review

**Spec coverage (Phase 0 scope per spec §12):**
- Repo/wrangler/Hono → Task 1 ✓
- D1 + Drizzle migrations (all v1 tables, spec §3 incl. `days.title`, `links` as JSON, indexes) → Task 2 ✓
- better-auth Google sign-in, per-request instance (spec §9) → Task 3 ✓
- Ownership guard (`trip.user_id === session.user.id`, spec §5) → Task 4 ✓
- Frontend shell + login + design tokens/fonts (spec §7.6) → Task 5 ✓
- Persistent single map + Map ID (spec §7.5, §8 one-instance rule) → Task 6 ✓
- GitHub Actions deploy, preview+prod, dev/prod key split (spec §2, §8) → Task 7 ✓
- Route engine, points/days/stops/groups, stats, share, editor UI → **deliberately Phase 1a/1b**, not this plan.

**Placeholder scan:** `database_id: REPLACE...` in Task 1 is filled by real `wrangler d1 create` output in Task 2/7 (explicitly instructed), not a plan placeholder. better-auth table authoring in Task 3 Step 2 references better-auth's documented Drizzle sqlite schema + gives the CLI fallback — the one spot that depends on the library's current table shape; verify against the installed version. No other TBD/TODO.

**Type consistency:** `Env`/`AppEnv`, `getDb(env)`, `newId()`, `tripsRouter`, `c.get("user")` shape `{ id: string } | null`, and CSS token names are used identically across Tasks 1–6.

---

## Execution Handoff

Phase 0 produces working, testable software: a styled map behind Google login with the full v1 schema migrated and CI in place. Phase 1a (backend core loop) and Phase 1b (editor/share UI) get their own plans once this executes.
