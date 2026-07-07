# Road Trip Planner (ROADLINE) — v1 Design Spec

*Prepared 2026-07-07. Scope: Phase 0 skeleton + Phase 1 core loop only. Supersedes the v1 slice of the original all-phases plan. v1.5/v2/v3 remain in the roadmap appendix (§13), not here.*

This spec is the implementation contract for v1. The **visual contract** is the separate design project `Trip Editor.dc.html` + `Design Spec.md` (Claude Design project `b98cc9df-...`); where this doc and the design spec disagree, the discrepancy is called out explicitly (§7). The design spec was written against the original plan, so the two are ~90% aligned; §4 and §7 capture the deltas that changed the build.

---

## 1. Scope & non-goals

**In v1:** Google sign-in; trips CRUD; points (autocomplete-add, drop-pin, edit panel: type/notes/cost/booking/links/group); groups (colored tag + pool filter); days with titles; drag/tap assignment; per-day route compute+cache+polyline with click-a-day focus; per-day and per-trip stats (distance, drive time, fuel); over-ambitious-day warning; read-only share links; **desktop editor**; **phone-first share view**.

**Explicitly deferred:**
- Photo *upload* → v1.5 (v1 uses the `links` field). `photos` table not created in v1.
- Accommodation **budget rollup** → v1.5 (the per-trip *fuel* total IS in v1 — see §4.4).
- **Mobile editor** (bottom-sheet, tap-assign, reorder handles) → v1.5. v1 mobile = share view only.
- **Marker clustering** (§2.3 of design spec) → v1.5. v1 renders all markers individually.
- AI generation, scheduling, weather, detours, co-editing → v2+.

**Non-goals (permanent for v1):** SSR, dark mode, traffic-aware routing, multi-currency, configurable units (metric + EUR hardcoded).

---

## 2. Architecture

One Cloudflare Worker serves the static SPA bundle (Workers static assets), the JSON API, better-auth endpoints, and public share pages. One D1 database holds all relational data. No R2/KV/Queues/DO in v1.

```
Browser (React SPA, @vis.gl/react-google-maps — one persistent map instance)
 │  Maps JS API + Places Autocomplete run client-side (browser key, referrer-restricted)
 ▼
Cloudflare Worker — Hono router
 │   /api/auth/*   → better-auth (Google social provider)
 │   /api/*        → trips / points / days / stops / share  (ownership-guarded)
 │   /s/:token     → public read-only share payload (outside auth middleware)
 ▼
 └── D1 (SQLite via Drizzle): user/session/account (better-auth) + app tables (§3)
     Outbound (server key, API-restricted): Google Routes API (computeRoutes),
       Places Details/Autocomplete resolution when needed
```

Client-rendered SPA (no SSR). Deploy via GitHub Actions `wrangler deploy` on push to main; `preview` + `production` Worker/D1 pairs.

---

## 3. Data model (v1)

better-auth owns `user`/`session`/`account`/`verification`; app tables reference `user.id`. Create only the v1 tables below (no `photos`, no `ai_generations`).

```sql
CREATE TABLE trips (
  id            TEXT PRIMARY KEY,                 -- nanoid
  user_id       TEXT NOT NULL REFERENCES user(id),
  name          TEXT NOT NULL,
  start_date    TEXT,                             -- ISO date; day dates derive from this + position
  vehicle_notes TEXT,
  fuel_l_per_100km REAL,                          -- fuel cost shown only when both fuel fields set
  fuel_price_per_l REAL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  budget_total  REAL,                             -- stored in v1; rollup UI is v1.5
  share_token   TEXT UNIQUE,                      -- NULL = not shared; rotate to revoke
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_trips_user ON trips(user_id);

CREATE TABLE groups (
  id      TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,                          -- "must-see", "backup options", ...
  color   TEXT                                    -- hex from the curated 8-swatch palette
);
CREATE INDEX idx_groups_trip ON groups(trip_id);

CREATE TABLE points (
  id               TEXT PRIMARY KEY,
  trip_id          TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  lat              REAL NOT NULL,
  lng              REAL NOT NULL,
  coord_source     TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'google'
  coord_fetched_at INTEGER,                       -- set when coord_source = 'google'
  google_place_id  TEXT,                          -- storable indefinitely per Google ToS
  type             TEXT NOT NULL DEFAULT 'poi',   -- camp|wildcamp|hostel|hotel|poi|fuel|food|viewpoint|activity|other
  notes            TEXT,
  links            TEXT,                          -- JSON array of {label, url}  (CHANGED — see §7.3)
  est_cost         REAL,                          -- 0 renders as "Free"
  cost_basis       TEXT,                          -- 'per_night' | 'per_person' | 'total'
  booking_status   TEXT NOT NULL DEFAULT 'idea',  -- idea | to_book | booked
  group_id         TEXT REFERENCES groups(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_points_trip ON points(trip_id);

CREATE TABLE days (
  id                  TEXT PRIMARY KEY,
  trip_id             TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,           -- 0-based; date = start_date + position; shield # = position+1
  title               TEXT,                       -- ADDED — "The Golden Circle" (§7.2); UI falls back to "Day N"
  departure_time      TEXT,                       -- nullable; unused in v1 (v2 scheduling)
  target_arrival_time TEXT,                       -- nullable; unused in v1
  notes               TEXT,
  UNIQUE (trip_id, position)
);

CREATE TABLE day_stops (
  day_id   TEXT NOT NULL REFERENCES days(id)   ON DELETE CASCADE,
  point_id TEXT NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,                      -- app-managed; first = START, last = END (derived labels)
  PRIMARY KEY (day_id, point_id)
);
CREATE INDEX idx_day_stops_order ON day_stops(day_id, position);

CREATE TABLE day_routes (                          -- cache of Google route content
  day_id         TEXT PRIMARY KEY REFERENCES days(id) ON DELETE CASCADE,
  waypoints_hash TEXT NOT NULL,                   -- sha256 of (origin coord + ordered stop coords + mode)
  polyline       TEXT NOT NULL,                   -- encoded polyline
  distance_m     INTEGER NOT NULL,
  duration_s     INTEGER NOT NULL,
  computed_at    INTEGER NOT NULL                 -- expire/refresh after 30 days (ToS)
);
```

**Retained deviations from the rough model** (validated by the design):
- **Pooled points.** A point with no `day_stops` row is an unassigned pool item. Assigning = insert; unassigning = delete; the point's own data is untouched. (Design §3.3 pool relies on this.)
- **Derived day endpoints.** START/END are computed from `day_stops.position`, never stored. (Design §4.5 confirms "derived from order, never stored.")
- **Route cache table** exists to honor Google's 30-day storage limit.

---

## 4. Route computation

### 4.1 A day's route includes the leg in from the previous overnight (CORRECTED — §7.1)

A day's driving is measured **from where you slept**, i.e. the previous day's last stop. Waypoints for day N:

```
origin = (last stop of day N-1, by position)   if N > 0 and day N-1 has ≥1 stop
         else (day N's own first stop)
route  = origin → day N's stops in order
```

Verified against the mockup: the 8 day-distances sum to exactly the header total (1,760 km), and Day 5 ("Höfn → Mývatn", stops `Djúpivogur/Egilsstaðir/Mývatn`) only reaches its 489 km because the route starts at Höfn (Day 4's last stop). Deriving a day's route from *only its own stops* would drop every inbound leg.

The day's own **first stop is still labeled START** in the UI (unchanged); the measured drive simply includes arriving from the prior overnight.

Edge cases: day with 0 stops → no route. Day with 1 stop and a prior day → a real leg (prevLast → stop). Day 0 (or any day whose prior has no stops) → origin is its own first stop; a single-stop day 0 has no route.

### 4.2 Recompute is folded into the stops write, and reconciles the whole trip cheaply

`PUT /api/days/:id/stops` replaces the ordered stop list, then calls **`reconcileDayRoutes(tripId)`**: for each day in position order, build its waypoint list (§4.1), hash it, and **only call Google on a hash miss**; hits are free. Because the hash includes the origin (previous day's last stop), changing Day N's last stop automatically invalidates Day N+1 — the inter-day cascade is handled by the hash, with no hand-written dependency tracking. Bounded by ~8 days, almost all cache hits. The response returns the affected `day_routes` rows.

This preserves the "one write path, no stop/route drift" property from the original decision while correctly handling the cross-day dependency §4.1 introduces.

### 4.3 The stops write must survive a route-compute failure (CORRECTED — §7.4)

The design has explicit "Measuring the drive…", "Couldn't reach the routing service — your stops are safe, [Retry]", and stale-route states (Design §3.7, §5). Therefore:

- `PUT /stops` **commits the stop changes even if the Google call fails.** Stops are never rolled back because routing was unreachable.
- The response reports a per-day route status (`ok` | `stale` | `failed`). The UI shows the retry affordance on `failed`.
- **Retry** = re-`PUT` the same stop list (idempotent); `reconcileDayRoutes` re-attempts only the missing/failed hashes.
- **Stale** (cached route >30 days old) is surfaced in the editor as "Route may be out of date / Refresh route." Refresh forces a recompute of that day.

### 4.4 Stats

- **Per-day fuel** = `distance_m/1000 × fuel_l_per_100km/100 × fuel_price_per_l`, rendered only when both fuel fields are set.
- **Per-trip header** = `Σ distance_m`, `Σ duration_s`, `Σ per-day fuel`. The trip **fuel** total is v1 (trivial sum of already-computed per-day fuel). The accommodation **budget** rollup (Σ est_cost with per-night × nights) stays v1.5 — do not conflate them.

---

## 5. API surface (v1)

REST-ish JSON under `/api`; every trip-scoped route guarded by `trip.user_id === session.user.id`.

```
GET/POST           /api/trips                 list, create
GET/PATCH/DELETE   /api/trips/:id             GET = batched trip+days+points+stops+routes in one response
POST               /api/trips/:id/points      create (autocomplete result or dropped pin)
PATCH/DELETE       /api/points/:id
POST/PATCH/DELETE  /api/trips/:id/days        create/edit (incl. title)/remove a day
PUT                /api/days/:id/stops        replace ordered stops → reconcileDayRoutes → returns affected routes + status
POST/DELETE        /api/trips/:id/share       mint / rotate (revoke) share_token
GET                /s/:token                  public read-only payload (no auth); lazy server-side refresh of a >30-day route
```

Removed vs original plan: the standalone `POST /api/days/:id/route` — route compute is folded into `PUT /stops` (§4.2). Any day/point mutation that can change a route (stop edit, point coord change, day insert/delete/reorder) ends by calling `reconcileDayRoutes`.

`GET /api/trips/:id` returns everything the editor needs in one D1 `batch()`; the SPA then works from client state + TanStack Query invalidation.

---

## 6. UX

### 6.1 Desktop editor — one never-unmounting screen (map + sidebar)

Top bar (Basalt) → wordmark, breadcrumb, trip stats readout (mono), Share, settings (⋯). Below: **left planning rail (~344px)** + **persistent map (fills center)** + **right detail panel (~382px, slides in on selection)**.

- **Left rail, two independently-scrolling regions:** **DAYS** (a vertical strip map — highway-shield day numbers, inter-day distance ticks in mono, expandable stop lists with START/END + booking-status dots) on top; **UNASSIGNED pool** (Search / Drop-pin buttons, group filter chip, point rows) on the bottom.
- **Map** mounts once and never unmounts (the cost rule, §8). Selecting a day applies the focus treatment (its route glows Lupine + thickens, its markers go 100%/scale-up/shields; everything else drops to ~32% opacity + desaturates, other routes become ghost lines). The detail panel narrows the map's width but never unmounts it.
- **Assignment:** `@dnd-kit` drag (pool→day, day→day, reorder within day) with a Lupine insertion line; **tap-to-assign** as the accessible fallback. Drop recomputes on drop only (§4.2). Day→pool unassigns.
- **Add stop:** Search (Places Autocomplete, session token) or Drop-pin (crosshair → click map → name popover, `coord_source='user'`, optional reverse-geocode "use nearby place name"). New points land in the pool as `idea`.

### 6.2 Share view — phone-first, read-only

`/s/:token` renders the same SPA in a read-only mode **outside the auth middleware**: trip name + dates + "view only" tag; persistent map focused to the selected day; sticky shield chips (tap = focus map + scroll itinerary); per-day distance + drive time (mono). **No edit affordances and no recompute button.** Cached routes only; a >30-day-stale route triggers one server-side refresh on read. Desktop share = two columns (itinerary left, sticky map right).

### 6.3 Finished-feel states

Empty trip, route-computing, failed-route (+Retry), stale-route (+Refresh), no-search-results (+Drop-pin), over-ambitious-day warning. Microcopy per Design Spec §5 (active voice, sentence case). The **over-ambitious-day warning** fires when a day's computed `duration_s` > 9 h → Sulfur ⚠ chip on the rail day header + stats row; informational, non-blocking, clears on recompute under threshold.

---

## 7. Deltas from the design cross-check (the corrections above, itemized)

These are the specific points where the design project required a change to the original v1 plan. Each is already applied in §3–§4.

1. **Inter-day leg (§4.1)** — day route origin = previous day's last stop; cascade handled by the waypoint hash in `reconcileDayRoutes`.
2. **`days.title` (§3)** — added; UI falls back to "Day N".
3. **`links` shape (§3)** — JSON array of `{label, url}`, not bare URL strings (detail panel renders labeled links).
4. **Route-failure resilience (§4.3)** — `PUT /stops` commits stops even when Google routing fails; returns route status; retry is idempotent.
5. **Custom Map ID** — the muted gray-green basemap is a cloud-styled Map ID; add "create + style a Map ID" to Phase 0 Google setup.
6. **Frontend design tokens are now the contract, not optional** — Overpass / Public Sans / Overpass Mono (Google Fonts) + the 6-color token system (Basalt/Glacier/Slate/Lupine/Sulfur/Moss) + the curated 8-swatch group palette. Supersedes the original plan's "Tailwind if you like it."
7. **Share payload strips fuel + cost** — `/s/:token` omits fuel settings, `est_cost`/`cost_basis`, `vehicle_notes`, `budget_total`; exposes distance/time + stop name/type/links/booking_status/group + polylines.
8. **Trip-header fuel total is v1** (Σ per-day fuel); accommodation budget rollup stays v1.5 (§4.4).
9. **Cost "Free"/"entry" need no schema change** — `est_cost=0`→"Free"; "entry" is a `total`-basis amount.
10. **Encoding system** — marker channels are glyph=type, body-fill=group (Basalt if ungrouped), ring=booking status (dashed/solid/solid+check), opacity+size+shield=day focus. Group is the one color-primary channel and is always mirrored as a text chip. This drives the point/group/status rendering in the editor and must survive grayscale (Design §2).

**Scope decisions from the cross-check:** mobile editor → v1.5 (v1 = mobile share only); marker clustering → v1.5.

---

## 8. Google Maps integration & cost rules

Unchanged from the original plan and still load-bearing for the €0 target:
- **One map instance** alive for the whole session; guard against remounts (stable `key`, no conditional unmount of the map container). Separate **dev vs prod** browser keys (StrictMode double-mounts in dev).
- **Session tokens** on Autocomplete; **frozen Essentials-tier Place Details field mask** (`id, displayName, location, formattedAddress`) as a commented constant — asking for ratings/photos/hours silently escalates the SKU.
- **Routes computed in the Worker** (server key), cached in `day_routes`, recomputed only on hash miss (§4.2). Client never calls the Routes API.
- **Hard per-API daily quota caps** (~300/day) + a billing alert in the Google console — converts any bug from a bill into an error.
- **Storage ToS:** place_ids forever; Google-sourced coords + route content max 30 days (`coord_fetched_at` / `computed_at` enforce refresh); Google attribution stays on the map.

> ⚠ Load-bearing external fact, flagged for verification during implementation: the whole €0 story rests on the post-March-2025 per-SKU monthly free caps (cited as 10k Essentials / 5k Pro / 1k Enterprise). Re-verify and date these against current Google documentation before relying on them; they are the single most consequential number in the cost model.

---

## 9. Auth

better-auth, Google social provider only, Drizzle/D1 adapter, sessions in D1. Open signup (any Google account), single-owner trips. No passwords, resets, or email sending. Share links need no account (`/s/:token` sits outside auth middleware).

Implementation notes: create the auth instance **once per request** in Hono middleware and reuse via context; OAuth client + consent screen live in the same GCP project as the Maps keys; register redirect URIs for prod, preview, and `http://localhost:8787/...`. `BETTER_AUTH_SECRET` + Google client id/secret as Worker secrets.

---

## 10. Share links

`share_token` = 21-char nanoid, minted on demand, rotated to revoke. `GET /s/:token` returns the read-only payload of §6.2/§7.7. Read-only means no recompute button — cached routes only, with a single server-side refresh if a route is >30 days stale. Share visitors load the map on the referrer-restricted browser key (spends owner quota — acceptable and unavoidable).

---

## 11. Testing / verification

- **TDD the pure logic:** fuel math; waypoint list construction incl. the inter-day origin rule (§4.1); `waypoints_hash`; `day_stops` position rewriting on reorder; over-ambitious-day threshold; ownership guards; share-token gating; share-payload field stripping (§7.7).
- **API integration tests against local D1** via `wrangler` (local SQLite): trip/point/day/stops/share endpoints, including the cascade-recompute-only-on-miss behavior and the route-failure-does-not-roll-back-stops behavior (§4.3, with the Google call stubbed to fail).
- **No browser E2E in v1.**

---

## 12. Build order

**Phase 0 — skeleton (~1 weekend).** Repo, `wrangler.jsonc`, Hono, D1 + Drizzle migrations (§3 tables), better-auth Google sign-in (OAuth client + consent screen + **Map ID creation/styling**), GitHub Actions deploy, preview + prod envs, and a persistent map rendering behind login with the design tokens/fonts wired.

**Phase 1 — core loop (~3–4 weekends).** Trips CRUD → points (autocomplete + drop-pin + edit panel) → groups (tag + pool filter) → days (with titles) + assignment UI (drag/tap) → route reconcile/cache/polyline (§4) with click-a-day focus → per-day + per-trip stats (distance/time/fuel) → over-ambitious-day warning → share links (desktop + phone-first share view). Finished-feel states (§6.3) throughout.

---

## 13. Roadmap appendix (out of v1)

- **v1.5:** photo upload (R2), accommodation budget rollup, printable itinerary (print CSS), **mobile editor** (bottom sheet, tap-assign, reorder handles, swipe-to-unassign), **marker clustering** (Design §2.3).
- **v2:** AI trip generation + grounding + unverified-point UX + regenerate-day + rate limiting + SSE progress; time-of-day scheduling.
- **v3:** weather (Open-Meteo), detour suggestions, PWA offline, co-editing (`trip_members`).

---

## 14. Open items

1. **EEA Maps terms** — skim Google's EEA-specific terms before public launch (parked from the original plan; the only fully unresolved item).
2. **Google per-SKU free-cap re-verification** — §8 flag; date + source the numbers during implementation.
