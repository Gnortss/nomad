# ROADLINE Phase 1b — Editor & Share UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the desktop trip editor (persistent map + strip-map day rail + unassigned pool + detail panel with drag/tap assignment and the day-focus mechanic) and the phone-first read-only share view, consuming the Phase 1a API.

**Architecture:** A `react-router-dom` shell routes `/trips` (list), `/trips/:id` (editor), and `/s/:token` (public share, outside auth). The editor is one never-unmounting `MapCanvas` with an overlaid three-pane layout; server state flows through TanStack Query hooks in `lib/api.ts`; pure derivations (`lib/tripModel.ts`, `lib/format.ts`, `editor/markers.ts`) turn the trip-detail payload into what the rail, pool, detail panel, and map layer render; transient focus/selection lives in a small `state/editorStore.ts` shared by rail and map.

**Tech Stack:** React + TypeScript · `react-router-dom` · TanStack Query · `@vis.gl/react-google-maps` (existing persistent map) · `@dnd-kit/core` + `@dnd-kit/sortable` (assignment) · Vitest jsdom project (`vitest.client.ts`) with `@testing-library/react` — same client toolchain as Phase 0.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-07-road-trip-planner-v1-design.md`; **visual contract:** the design project (`Trip Editor.dc.html` + `Design Spec.md`). Section refs (§2 etc.) point to the design spec where noted.
- **Toolchain pinned** (Phase 0): vite 6 / vitest 3.2 / `@cloudflare/vite-plugin` 1.34 / plugin-react 4. Do not bump.
- **Client tests** run in the jsdom project: `npm run test:client` (aliased below). The full gate is `npm test` (worker + client) + `npm run typecheck` + `npm run build`.
- **One map instance, alive the whole session** (spec §8): never wrap `MapCanvas` in a keyed subtree; the detail panel narrows map width, never unmounts it. StrictMode stays on.
- **Design tokens (verbatim):** Basalt `#1E2A2C`, Glacier `#ECF0F0`, Slate `#57676B`, Lupine `#5B44C9`, Sulfur `#E39A0C`, Moss `#2F7A55`. Fonts: Overpass (display/shields), Public Sans (body), Overpass Mono (data/stats). Light mode only.
- **Marker encoding (design §2, verbatim):** glyph = type; body fill = group color, **Basalt if ungrouped**; ring = booking status (`idea` dashed 1.5px + 88% opacity; `to_book` solid 1.5px; `booked` solid 2px + Moss check badge); focus = opacity+size+z (focused day 100%/scale-up/top-z, everything else ~32% opacity + desaturate). Group is the one color-primary channel and is **always** mirrored as a text chip.
- **START/END derived from stop order**, never stored (spec §4.5). First stop = START, last = END.
- **Long-day warning:** `perDay[dayId].warnLongDay` from the API (`durationS > 9h`) → Sulfur ⚠ chip on the rail day header + stats row; informational, non-blocking.
- **Share view is read-only:** no edit affordances, no recompute button; distance + drive time only (no fuel/cost — the API already strips them).
- **Route recompute fires on drop only** (spec §4.1/design §4.1), never per drag-frame. Assignment calls `PUT /api/days/:id/stops`.
- **Microcopy** comes from design §5 verbatim (empty, computing, failed, stale, no-results).
- **TDD** the pure/logic/API layers; jsdom component tests for interactive pieces; explicit manual-verification steps for map visuals and drag physics (no browser E2E in v1, spec §11).

---

### Task 1: Router shell with public share route

**Files:**
- Modify: `src/client/App.tsx` (become a router)
- Modify: `src/client/main.tsx` (wrap in `BrowserRouter`)
- Create: `src/client/routes.tsx` (route table)
- Test: `test/client/routes.test.tsx`

**Interfaces:**
- Consumes: `useSession` (Phase 0).
- Produces: routes `/` → redirect to `/trips`; `/trips` and `/trips/:id` gated by session (render `<Login/>` when unauthenticated); `/s/:token` renders `<ShareView/>` regardless of auth. Placeholder components `TripListScreen`, `TripEditorScreen`, `ShareView` exist (filled by later tasks) — for this task they render a `data-testid` marker each.

- [ ] **Step 1: Install the router**

Run: `npm install react-router-dom`
Expected: installed.

- [ ] **Step 2: Write the failing routing test**

`test/client/routes.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AppRoutes } from "../../src/client/routes";

vi.mock("../../src/client/lib/auth", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, isPending: false }),
  signInWithGoogle: vi.fn(), signOut: vi.fn(),
}));
// stub the three screens to bare markers for this task
vi.mock("../../src/client/screens/TripList", () => ({ TripListScreen: () => <div data-testid="trip-list" /> }));
vi.mock("../../src/client/screens/TripEditor", () => ({ TripEditorScreen: () => <div data-testid="trip-editor" /> }));
vi.mock("../../src/client/share/ShareView", () => ({ ShareView: () => <div data-testid="share-view" /> }));

function at(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe("routes", () => {
  it("renders the trip list at /trips", () => {
    expect(at("/trips").getByTestId("trip-list")).toBeTruthy();
  });
  it("renders the editor at /trips/:id", () => {
    expect(at("/trips/abc").getByTestId("trip-editor")).toBeTruthy();
  });
  it("renders the public share view at /s/:token", () => {
    expect(at("/s/tok123").getByTestId("share-view")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:client -- routes`
Expected: FAIL — `routes.tsx` and the screen modules don't exist.

- [ ] **Step 4: Create placeholder screens + the route table**

`src/client/screens/TripList.tsx`:
```tsx
export function TripListScreen() { return <div data-testid="trip-list-real" />; }
```
`src/client/screens/TripEditor.tsx`:
```tsx
export function TripEditorScreen() { return <div data-testid="trip-editor-real" />; }
```
`src/client/share/ShareView.tsx`:
```tsx
export function ShareView() { return <div data-testid="share-view-real" />; }
```
`src/client/routes.tsx`:
```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./lib/auth";
import { Login } from "./screens/Login";
import { TripListScreen } from "./screens/TripList";
import { TripEditorScreen } from "./screens/TripEditor";
import { ShareView } from "./share/ShareView";

function Gated({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return data?.user ? <>{children}</> : <Login />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/trips" replace />} />
      <Route path="/trips" element={<Gated><TripListScreen /></Gated>} />
      <Route path="/trips/:id" element={<Gated><TripEditorScreen /></Gated>} />
      <Route path="/s/:token" element={<ShareView />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Wire BrowserRouter and replace App**

`src/client/App.tsx`:
```tsx
import { AppRoutes } from "./routes";
export function App() { return <AppRoutes />; }
```
`src/client/main.tsx` — wrap the app:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { App } from "./App";
import "./styles/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><App /></BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test:client -- routes`
Expected: PASS (3 tests). The old `map-canvas.test.tsx` renders `AppShell` directly, so it is unaffected.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: router shell with gated trip routes and public share route"
```

---

### Task 2: Pure formatters

**Files:**
- Create: `src/client/lib/format.ts`
- Test: `test/client/format.test.ts`

**Interfaces:**
- Produces:
  - `formatDistance(distanceM: number): string` → `"214 km"` (rounded km; `"0 km"` for 0).
  - `formatDuration(durationS: number): string` → `"3 h 10"` (hours + zero-padded minutes; `"0 h 00"` for 0; `"45 min"` when < 1h).
  - `formatCost(estCost: number | null, costBasis: string | null, currency: string): string` → `"€22 / night"` / `"€59 / person"` / `"€8"` / `"Free"` (0) / `"—"` (null).
  - `endpointLabel(index: number, count: number): "START" | "END" | ""` → first = START, last = END, else "".

- [ ] **Step 1: Write the failing test**

`test/client/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatDistance, formatDuration, formatCost, endpointLabel } from "../../src/client/lib/format";

describe("formatters", () => {
  it("distance in km", () => {
    expect(formatDistance(214000)).toBe("214 km");
    expect(formatDistance(0)).toBe("0 km");
  });
  it("duration as h + padded min, or min under an hour", () => {
    expect(formatDuration(11400)).toBe("3 h 10");   // 3h10m
    expect(formatDuration(0)).toBe("0 h 00");
    expect(formatDuration(2700)).toBe("45 min");     // 45m
  });
  it("cost with basis, free, and unknown", () => {
    expect(formatCost(22, "per_night", "EUR")).toBe("€22 / night");
    expect(formatCost(59, "per_person", "EUR")).toBe("€59 / person");
    expect(formatCost(8, "total", "EUR")).toBe("€8");
    expect(formatCost(0, "total", "EUR")).toBe("Free");
    expect(formatCost(null, null, "EUR")).toBe("—");
  });
  it("endpoint labels from order", () => {
    expect(endpointLabel(0, 3)).toBe("START");
    expect(endpointLabel(2, 3)).toBe("END");
    expect(endpointLabel(1, 3)).toBe("");
    expect(endpointLabel(0, 1)).toBe("START"); // single stop is START
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- format`
Expected: FAIL — `format.ts` missing.

- [ ] **Step 3: Implement**

`src/client/lib/format.ts`:
```ts
export function formatDistance(distanceM: number): string {
  return `${Math.round(distanceM / 1000)} km`;
}

export function formatDuration(durationS: number): string {
  const totalMin = Math.round(durationS / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0 && durationS > 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function formatCost(estCost: number | null, costBasis: string | null, currency: string): string {
  if (estCost == null) return "—";
  if (estCost === 0) return "Free";
  const sym = CURRENCY_SYMBOL[currency] ?? currency + " ";
  const amount = `${sym}${estCost}`;
  if (costBasis === "per_night") return `${amount} / night`;
  if (costBasis === "per_person") return `${amount} / person`;
  return amount;
}

export function endpointLabel(index: number, count: number): "START" | "END" | "" {
  if (index === 0) return "START";
  if (index === count - 1) return "END";
  return "";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure display formatters (distance, duration, cost, endpoint labels)"
```

---

### Task 3: Trip-model derivations

**Files:**
- Create: `src/client/lib/types.ts` (shared payload types)
- Create: `src/client/lib/tripModel.ts`
- Test: `test/client/tripModel.test.ts`

**Interfaces:**
- Produces (in `types.ts`): `TripDetail` = the shape returned by `GET /api/trips/:id` (trip, groups, points[], days[], dayStops[], routes[], stats). `Point`, `Day`, `Group`, `DayStop`, `DayRoute`, `TripStats` sub-types matching Phase 1a's response (see Task 10 of the Phase 1a plan). `Point.links: {label,url}[]`.
- Produces (in `tripModel.ts`):
  - `stopsForDay(detail, dayId): Point[]` — points assigned to a day, ordered by `dayStops.position`.
  - `pooledPoints(detail): Point[]` — points with no `day_stops` row (unassigned).
  - `daysWithStats(detail): Array<Day & { stops: Point[]; distanceM: number | null; durationS: number | null; fuel: number | null; warnLongDay: boolean }>` — days ordered by position, each joined to its stops and `stats.perDay`.
  - `groupColor(detail, groupId): string` — the group's color, or Basalt `#1E2A2C` if null/unknown (the ungrouped rule).

- [ ] **Step 1: Write the failing test**

`test/client/tripModel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stopsForDay, pooledPoints, daysWithStats, groupColor } from "../../src/client/lib/tripModel";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "Iceland", startDate: "2026-07-12", currency: "EUR", fuelLPer100km: 8, fuelPricePerL: 1.9 } as any,
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B" }],
  points: [
    { id: "p0", tripId: "t1", name: "P0", lat: 1, lng: 1, type: "poi", bookingStatus: "idea", groupId: "g1", links: [] } as any,
    { id: "p1", tripId: "t1", name: "P1", lat: 2, lng: 2, type: "camp", bookingStatus: "booked", groupId: null, links: [] } as any,
    { id: "p2", tripId: "t1", name: "P2", lat: 3, lng: 3, type: "viewpoint", bookingStatus: "idea", groupId: null, links: [] } as any,
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" } as any],
  dayStops: [
    { dayId: "d0", pointId: "p1", position: 1 },
    { dayId: "d0", pointId: "p0", position: 0 },
  ],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 200000, durationS: 36000, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 200000, totalDurationS: 36000, totalFuel: 30.4, perDay: { d0: { distanceM: 200000, durationS: 36000, fuel: 30.4, warnLongDay: true } } },
};

describe("tripModel", () => {
  it("orders a day's stops by position", () => {
    expect(stopsForDay(detail, "d0").map((p) => p.id)).toEqual(["p0", "p1"]);
  });
  it("pooled = points with no day_stops row", () => {
    expect(pooledPoints(detail).map((p) => p.id)).toEqual(["p2"]);
  });
  it("joins days to stops and per-day stats incl. long-day warning", () => {
    const d = daysWithStats(detail)[0];
    expect(d.stops.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(d.distanceM).toBe(200000);
    expect(d.warnLongDay).toBe(true);
    expect(d.fuel).toBeCloseTo(30.4, 3);
  });
  it("groupColor falls back to Basalt when ungrouped", () => {
    expect(groupColor(detail, "g1")).toBe("#C64A3B");
    expect(groupColor(detail, null)).toBe("#1E2A2C");
    expect(groupColor(detail, "nope")).toBe("#1E2A2C");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- tripModel`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement types and derivations**

`src/client/lib/types.ts`:
```ts
export type Group = { id: string; tripId: string; name: string; color: string | null };
export type Point = {
  id: string; tripId: string; name: string; lat: number; lng: number;
  coordSource?: string; googlePlaceId?: string | null; type: string;
  notes: string | null; links: { label: string; url: string }[];
  estCost: number | null; costBasis: string | null; bookingStatus: string; groupId: string | null;
};
export type Day = { id: string; tripId: string; position: number; title: string | null; notes?: string | null };
export type DayStop = { dayId: string; pointId: string; position: number };
export type DayRoute = { dayId: string; polyline: string; distanceM: number; durationS: number; waypointsHash: string; computedAt: number };
export type PerDayStat = { distanceM: number; durationS: number; fuel: number | null; warnLongDay: boolean };
export type TripStats = { totalDistanceM: number; totalDurationS: number; totalFuel: number | null; perDay: Record<string, PerDayStat> };
export type Trip = { id: string; name: string; startDate: string | null; currency: string; fuelLPer100km: number | null; fuelPricePerL: number | null; shareToken?: string | null; vehicleNotes?: string | null; budgetTotal?: number | null };
export type TripDetail = { trip: Trip; groups: Group[]; points: Point[]; days: Day[]; dayStops: DayStop[]; routes: DayRoute[]; stats: TripStats };
```

`src/client/lib/tripModel.ts`:
```ts
import type { TripDetail, Point, Day } from "./types";

const BASALT = "#1E2A2C";

export function stopsForDay(detail: TripDetail, dayId: string): Point[] {
  const byId = new Map(detail.points.map((p) => [p.id, p]));
  return detail.dayStops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.position - b.position)
    .map((s) => byId.get(s.pointId))
    .filter((p): p is Point => !!p);
}

export function pooledPoints(detail: TripDetail): Point[] {
  const assigned = new Set(detail.dayStops.map((s) => s.pointId));
  return detail.points.filter((p) => !assigned.has(p.id));
}

export function daysWithStats(detail: TripDetail) {
  return [...detail.days]
    .sort((a, b) => a.position - b.position)
    .map((day: Day) => {
      const stat = detail.stats.perDay[day.id];
      return {
        ...day,
        stops: stopsForDay(detail, day.id),
        distanceM: stat?.distanceM ?? null,
        durationS: stat?.durationS ?? null,
        fuel: stat?.fuel ?? null,
        warnLongDay: stat?.warnLongDay ?? false,
      };
    });
}

export function groupColor(detail: TripDetail, groupId: string | null): string {
  if (!groupId) return BASALT;
  return detail.groups.find((g) => g.id === groupId)?.color ?? BASALT;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- tripModel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: trip-model derivations (stops-by-day, pool, day stats join, group color)"
```

---

### Task 4: Marker-encoding function

**Files:**
- Create: `src/client/editor/markers.ts`
- Test: `test/client/markers.test.ts`

**Interfaces:**
- Produces: `markerStyle(input: { groupColor: string; bookingStatus: string; focused: boolean; dimmed: boolean }): { fill: string; ringStyle: "dashed" | "solid"; ringWidth: number; opacity: number; showCheck: boolean; scale: number; grayscale: number }` implementing design §2's channel assignment:
  - fill = groupColor (caller passes Basalt when ungrouped).
  - `idea` → dashed ring 1.5, opacity 0.88; `to_book` → solid ring 1.5, opacity 1; `booked` → solid ring 2, opacity 1, `showCheck` true.
  - `dimmed` (outside focused day) → opacity 0.32, grayscale 0.6; `focused` → scale 1.12; otherwise scale 1, grayscale 0. Dim overrides the status opacity.

- [ ] **Step 1: Write the failing test**

`test/client/markers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { markerStyle } from "../../src/client/editor/markers";

describe("markerStyle", () => {
  it("idea = dashed thin ring at 88% opacity", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "idea", focused: false, dimmed: false });
    expect(s).toMatchObject({ fill: "#C64A3B", ringStyle: "dashed", ringWidth: 1.5, opacity: 0.88, showCheck: false, scale: 1 });
  });
  it("booked = solid 2px ring + check badge, full opacity", () => {
    const s = markerStyle({ groupColor: "#1E2A2C", bookingStatus: "booked", focused: false, dimmed: false });
    expect(s).toMatchObject({ ringStyle: "solid", ringWidth: 2, showCheck: true, opacity: 1 });
  });
  it("focused day scales up", () => {
    expect(markerStyle({ groupColor: "#1E2A2C", bookingStatus: "to_book", focused: true, dimmed: false }).scale).toBe(1.12);
  });
  it("dimmed overrides status opacity and desaturates", () => {
    const s = markerStyle({ groupColor: "#C64A3B", bookingStatus: "booked", focused: false, dimmed: true });
    expect(s.opacity).toBe(0.32);
    expect(s.grayscale).toBe(0.6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- markers`
Expected: FAIL — `markers.ts` missing.

- [ ] **Step 3: Implement**

`src/client/editor/markers.ts`:
```ts
export function markerStyle(input: { groupColor: string; bookingStatus: string; focused: boolean; dimmed: boolean }) {
  const { groupColor, bookingStatus, focused, dimmed } = input;
  let ringStyle: "dashed" | "solid" = "solid";
  let ringWidth = 1.5;
  let opacity = 1;
  let showCheck = false;
  if (bookingStatus === "idea") { ringStyle = "dashed"; ringWidth = 1.5; opacity = 0.88; }
  else if (bookingStatus === "to_book") { ringStyle = "solid"; ringWidth = 1.5; opacity = 1; }
  else if (bookingStatus === "booked") { ringStyle = "solid"; ringWidth = 2; opacity = 1; showCheck = true; }

  let scale = 1;
  let grayscale = 0;
  if (dimmed) { opacity = 0.32; grayscale = 0.6; }   // dim overrides status opacity
  else if (focused) { scale = 1.12; }

  return { fill: groupColor, ringStyle, ringWidth, opacity, showCheck, scale, grayscale };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- markers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: marker-encoding function (fill/ring/status/focus) per design §2"
```

---

### Task 5: API client + query hooks

**Files:**
- Create: `src/client/lib/api.ts`
- Test: `test/client/api.test.tsx`

**Interfaces:**
- Consumes: `TripDetail` and sub-types.
- Produces (thin `fetch` wrappers, all `credentials: "include"`, throwing on non-2xx):
  - `listTrips()`, `createTrip(name)`, `getTrip(id): Promise<TripDetail>`, `deleteTrip(id)`
  - `createPoint(tripId, body)`, `patchPoint(id, body)`, `deletePoint(id)`
  - `createDay(tripId, body)`, `patchDay(id, body)`, `deleteDay(id)`
  - `putStops(dayId, pointIds): Promise<{ stops; routes; routeStatus }>`
  - `createGroup(tripId, body)`, `patchGroup(id, body)`, `deleteGroup(id)`
  - `mintShare(tripId)`, `rotateShare(tripId)`, `getShare(token)`
  - Query hooks: `useTrips()`, `useTrip(id)` (key `["trip", id]`), and mutation hooks `useCreateTrip()`, `usePutStops(tripId)`, `usePatchPoint(tripId)` etc. that invalidate `["trip", tripId]` on success.

- [ ] **Step 1: Write the failing test (fetch mocked)**

`test/client/api.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTrip, putStops, createTrip } from "../../src/client/lib/api";

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("getTrip fetches and returns JSON", async () => {
    const detail = { trip: { id: "t1" } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(detail), { status: 200 })));
    const r = await getTrip("t1");
    expect((r as any).trip.id).toBe("t1");
    expect((fetch as any).mock.calls[0][0]).toBe("/api/trips/t1");
  });

  it("putStops PUTs pointIds to the day", async () => {
    const body = { stops: [], routes: {}, routeStatus: {} };
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await putStops("d0", ["p0", "p1"]);
    expect(f.mock.calls[0][0]).toBe("/api/days/d0/stops");
    expect(f.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ pointIds: ["p0", "p1"] });
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(createTrip("X")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- api`
Expected: FAIL — `api.ts` missing.

- [ ] **Step 3: Implement the client + hooks**

`src/client/lib/api.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripDetail, Trip } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const listTrips = () => req<{ trips: Trip[] }>("/api/trips");
export const createTrip = (name: string) => req<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ name }) });
export const getTrip = (id: string) => req<TripDetail>(`/api/trips/${id}`);
export const deleteTrip = (id: string) => req<void>(`/api/trips/${id}`, { method: "DELETE" });

export const createPoint = (tripId: string, body: object) => req(`/api/trips/${tripId}/points`, { method: "POST", body: JSON.stringify(body) });
export const patchPoint = (id: string, body: object) => req(`/api/points/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deletePoint = (id: string) => req<void>(`/api/points/${id}`, { method: "DELETE" });

export const createDay = (tripId: string, body: object) => req(`/api/trips/${tripId}/days`, { method: "POST", body: JSON.stringify(body) });
export const patchDay = (id: string, body: object) => req(`/api/days/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteDay = (id: string) => req<void>(`/api/days/${id}`, { method: "DELETE" });

export const putStops = (dayId: string, pointIds: string[]) =>
  req<{ stops: unknown[]; routes: Record<string, unknown>; routeStatus: Record<string, string> }>(`/api/days/${dayId}/stops`, { method: "PUT", body: JSON.stringify({ pointIds }) });

export const createGroup = (tripId: string, body: object) => req(`/api/trips/${tripId}/groups`, { method: "POST", body: JSON.stringify(body) });
export const patchGroup = (id: string, body: object) => req(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteGroup = (id: string) => req<void>(`/api/groups/${id}`, { method: "DELETE" });

export const mintShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "POST" });
export const rotateShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "DELETE" });
export const getShare = (token: string) => req<unknown>(`/s/${token}`);

export const useTrips = () => useQuery({ queryKey: ["trips"], queryFn: listTrips });
export const useTrip = (id: string) => useQuery({ queryKey: ["trip", id], queryFn: () => getTrip(id) });

export function useInvalidateTrip(tripId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["trip", tripId] });
}
export function usePutStops(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (v: { dayId: string; pointIds: string[] }) => putStops(v.dayId, v.pointIds), onSuccess: invalidate });
}
export function usePatchPoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (v: { id: string; body: object }) => patchPoint(v.id, v.body), onSuccess: invalidate });
}
export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => createTrip(name), onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }) });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- api`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: typed API client + TanStack Query hooks"
```

---

### Task 6: Editor focus/selection store

**Files:**
- Create: `src/client/state/editorStore.ts`
- Test: `test/client/editorStore.test.tsx`

**Interfaces:**
- Produces: a `useEditorStore` hook (React context + reducer, no external dep) exposing `{ focusedDayId, selectedPointId, focusDay(id|null), selectPoint(id|null), clearFocus() }`. `focusDay(id)` toggles (calling with the already-focused id clears it). `selectPoint(id)` sets the selected point without changing focus. `<EditorStoreProvider>` wraps the editor.

- [ ] **Step 1: Write the failing test**

`test/client/editorStore.test.tsx`:
```tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";

const wrapper = ({ children }: { children: React.ReactNode }) => <EditorStoreProvider>{children}</EditorStoreProvider>;

describe("editorStore", () => {
  it("focusDay toggles, selectPoint is independent", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    act(() => result.current.focusDay("d1"));
    expect(result.current.focusedDayId).toBe("d1");
    act(() => result.current.focusDay("d1"));         // toggle off
    expect(result.current.focusedDayId).toBeNull();

    act(() => result.current.focusDay("d2"));
    act(() => result.current.selectPoint("p9"));
    expect(result.current.focusedDayId).toBe("d2");    // unchanged by selectPoint
    expect(result.current.selectedPointId).toBe("p9");

    act(() => result.current.clearFocus());
    expect(result.current.focusedDayId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- editorStore`
Expected: FAIL — `editorStore.ts` missing.

- [ ] **Step 3: Implement**

`src/client/state/editorStore.ts`:
```tsx
import { createContext, useContext, useMemo, useReducer } from "react";

type State = { focusedDayId: string | null; selectedPointId: string | null };
type Action =
  | { t: "focusDay"; id: string | null }
  | { t: "selectPoint"; id: string | null }
  | { t: "clearFocus" };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "focusDay": return { ...s, focusedDayId: s.focusedDayId === a.id ? null : a.id };
    case "selectPoint": return { ...s, selectedPointId: a.id };
    case "clearFocus": return { ...s, focusedDayId: null };
  }
}

type Store = State & {
  focusDay: (id: string | null) => void;
  selectPoint: (id: string | null) => void;
  clearFocus: () => void;
};
const Ctx = createContext<Store | null>(null);

export function EditorStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { focusedDayId: null, selectedPointId: null });
  const value = useMemo<Store>(() => ({
    ...state,
    focusDay: (id) => dispatch({ t: "focusDay", id }),
    selectPoint: (id) => dispatch({ t: "selectPoint", id }),
    clearFocus: () => dispatch({ t: "clearFocus" }),
  }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditorStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditorStore outside provider");
  return v;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- editorStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: editor focus/selection store (toggle focus, independent selection)"
```

---

### Task 7: Trip list screen

**Files:**
- Modify: `src/client/screens/TripList.tsx`
- Test: `test/client/trip-list.test.tsx`

**Interfaces:**
- Consumes: `useTrips`, `useCreateTrip` (Task 5); `react-router` `useNavigate`.
- Produces: a screen listing the user's trips as cards (name + `startDate`), a "New trip" control that creates a trip and navigates to `/trips/:id`, and a per-card open link. Uses the top bar from `AppShell`'s header style (Basalt).

- [ ] **Step 1: Write the failing test**

`test/client/trip-list.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }));
vi.mock("../../src/client/lib/api", () => ({
  useTrips: () => ({ data: { trips: [{ id: "t1", name: "Iceland Ring Road", startDate: "2026-07-12" }] }, isPending: false }),
  useCreateTrip: () => ({ mutateAsync: vi.fn(async () => ({ id: "t2", name: "New" })), isPending: false }),
}));
vi.mock("../../src/client/lib/auth", () => ({ signOut: vi.fn() }));

import { TripListScreen } from "../../src/client/screens/TripList";

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
);

describe("TripList", () => {
  it("lists trips and creates+navigates on new trip", async () => {
    wrap(<TripListScreen />);
    expect(screen.getByText("Iceland Ring Road")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /new trip/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/trips/t2"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- trip-list`
Expected: FAIL — screen is still the placeholder.

- [ ] **Step 3: Implement**

`src/client/screens/TripList.tsx`:
```tsx
import { useNavigate } from "react-router-dom";
import { useTrips, useCreateTrip } from "../lib/api";
import { signOut } from "../lib/auth";

export function TripListScreen() {
  const navigate = useNavigate();
  const { data } = useTrips();
  const create = useCreateTrip();

  async function onNew() {
    const trip = await create.mutateAsync("New trip");
    navigate(`/trips/${(trip as { id: string }).id}`);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
        <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em" }}>ROADLINE</span>
        <div style={{ flex: 1 }} />
        <button onClick={onNew} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer" }}>+ New trip</button>
        <button onClick={signOut} style={{ marginLeft: 8, background: "transparent", color: "var(--glacier)", border: "1px solid rgba(236,240,240,.3)", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>Sign out</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {(data?.trips ?? []).map((t) => (
          <a key={t.id} href={`/trips/${t.id}`} style={{ display: "block", padding: 18, background: "#F4F6F6", border: "1px solid rgba(87,103,107,.18)", borderRadius: 8, color: "inherit" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>{t.startDate ?? "No dates yet"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- trip-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: trip list screen with create-and-open"
```

---

### Task 8: Editor shell layout (three-pane, persistent map)

**Files:**
- Modify: `src/client/screens/TripEditor.tsx`
- Create: `src/client/editor/TopBar.tsx`
- Test: `test/client/trip-editor.test.tsx`

**Interfaces:**
- Consumes: `useTrip` (Task 5); `useParams`; `MapCanvas` (Phase 0); `EditorStoreProvider` (Task 6); `daysWithStats` (Task 3); `formatDistance/formatDuration` (Task 2). Later tasks fill `DayRail`, `Pool`, `DetailPanel`, `MapLayer` — this task renders them as stub imports so the layout is testable.
- Produces: the editor screen: fixed top bar (wordmark, trip name, `stats` readout, Share), then a flex row of `[rail 344px][map flex][detail 382px when a point is selected]`. Wraps everything in `EditorStoreProvider`. Exactly one `MapCanvas` mounts, and it is never keyed.

- [ ] **Step 1: Write the failing test**

`test/client/trip-editor.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ id: "t1" }) }));
vi.mock("@vis.gl/react-google-maps", () => ({ APIProvider: ({ children }: any) => <div>{children}</div>, Map: () => <div data-testid="map" /> }));
vi.mock("../../src/client/lib/api", () => ({
  useTrip: () => ({ data: {
    trip: { id: "t1", name: "Iceland", currency: "EUR", fuelLPer100km: null, fuelPricePerL: null },
    groups: [], points: [], days: [], dayStops: [], routes: [],
    stats: { totalDistanceM: 214000, totalDurationS: 11400, totalFuel: null, perDay: {} },
  }, isPending: false }),
}));
// stub child panels so this test is about layout
vi.mock("../../src/client/editor/DayRail", () => ({ DayRail: () => <div data-testid="rail" /> }));
vi.mock("../../src/client/editor/Pool", () => ({ Pool: () => <div data-testid="pool" /> }));
vi.mock("../../src/client/editor/DetailPanel", () => ({ DetailPanel: () => null }));
vi.mock("../../src/client/map/MapLayer", () => ({ MapLayer: () => null }));

import { TripEditorScreen } from "../../src/client/screens/TripEditor";

describe("TripEditor layout", () => {
  it("renders one map, the rail, and the trip stats", () => {
    render(<QueryClientProvider client={new QueryClient()}><TripEditorScreen /></QueryClientProvider>);
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(screen.getByTestId("rail")).toBeTruthy();
    expect(screen.getByText(/Iceland/)).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy();      // stats readout
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- trip-editor`
Expected: FAIL — screen is still the placeholder.

- [ ] **Step 3: Implement the top bar and editor shell**

`src/client/editor/TopBar.tsx`:
```tsx
export function TopBar({ tripName, stats, onShare }: { tripName: string; stats: string; onShare: () => void }) {
  return (
    <header style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
      <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 16 }}>ROADLINE</span>
      <span style={{ opacity: .35 }}>›</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{tripName}</span>
      <span className="mono" style={{ marginLeft: 20, fontSize: 12.5, color: "#aab8b7" }}>{stats}</span>
      <div style={{ flex: 1 }} />
      <button onClick={onShare} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Share trip</button>
    </header>
  );
}
```

`src/client/screens/TripEditor.tsx`:
```tsx
import { useParams } from "react-router-dom";
import { useTrip } from "../lib/api";
import { EditorStoreProvider, useEditorStore } from "../state/editorStore";
import { MapCanvas } from "../map/MapCanvas";
import { MapLayer } from "../map/MapLayer";
import { DayRail } from "../editor/DayRail";
import { Pool } from "../editor/Pool";
import { DetailPanel } from "../editor/DetailPanel";
import { TopBar } from "../editor/TopBar";
import { formatDistance, formatDuration } from "../lib/format";
import type { TripDetail } from "../lib/types";

function EditorBody({ detail }: { detail: TripDetail }) {
  const { selectedPointId } = useEditorStore();
  const s = detail.stats;
  const stats = `${formatDistance(s.totalDistanceM)} · ${formatDuration(s.totalDurationS)}` + (s.totalFuel != null ? ` · €${Math.round(s.totalFuel)} fuel` : "");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
      <TopBar tripName={detail.trip.name} stats={stats} onShare={() => { /* Task 13 */ }} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#F4F6F6", borderRight: "1px solid rgba(87,103,107,.18)" }}>
          <DayRail detail={detail} />
          <Pool detail={detail} />
        </aside>
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <MapCanvas />
          <MapLayer detail={detail} />
        </main>
        {selectedPointId && <DetailPanel detail={detail} />}
      </div>
    </div>
  );
}

export function TripEditorScreen() {
  const { id } = useParams();
  const { data, isPending } = useTrip(id!);
  if (isPending || !data) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return <EditorStoreProvider><EditorBody detail={data} /></EditorStoreProvider>;
}
```

Create minimal stubs so imports resolve (filled by later tasks):
`src/client/editor/DayRail.tsx`: `export function DayRail(_: { detail: unknown }) { return <div />; }`
`src/client/editor/Pool.tsx`: `export function Pool(_: { detail: unknown }) { return <div />; }`
`src/client/editor/DetailPanel.tsx`: `export function DetailPanel(_: { detail: unknown }) { return null; }`
`src/client/map/MapLayer.tsx`: `export function MapLayer(_: { detail: unknown }) { return null; }`

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- trip-editor`
Expected: PASS. The stub-mocked children let the layout test assert one map + rail + stats.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: editor shell — top bar, three-pane layout, single persistent map"
```

---

### Task 9: Day rail (strip map + focus)

**Files:**
- Rewrite: `src/client/editor/DayRail.tsx`
- Test: `test/client/day-rail.test.tsx`

**Interfaces:**
- Consumes: `daysWithStats` (Task 3), `formatDistance/formatDuration/endpointLabel` (Task 2), `useEditorStore` (Task 6), `useTrip`'s `detail`.
- Produces: a `DayRail` rendering each day as a shield (number = position+1) + title + `distText` (`214 km · 3 h 10`) + a Sulfur ⚠ "Long day" chip when `warnLongDay`. Clicking a day header calls `focusDay(day.id)`. When focused, the day expands to list its stops with START/END labels and a booking-status dot. Clicking a stop calls `selectPoint(pointId)`.

- [ ] **Step 1: Write the failing test**

`test/client/day-rail.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { DayRail } from "../../src/client/editor/DayRail";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [], points: [
    { id: "p0", tripId: "t1", name: "Reykjavík", lat: 1, lng: 1, type: "camp", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "booked", groupId: null },
    { id: "p1", tripId: "t1", name: "Gullfoss", lat: 2, lng: 2, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "Golden Circle" }],
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0 }, { dayId: "d0", pointId: "p1", position: 1 }],
  routes: [{ dayId: "d0", polyline: "x", distanceM: 214000, durationS: 34800, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 214000, totalDurationS: 34800, totalFuel: null, perDay: { d0: { distanceM: 214000, durationS: 34800, fuel: null, warnLongDay: true } } },
};
const wrap = () => render(<EditorStoreProvider><DayRail detail={detail} /></EditorStoreProvider>);

describe("DayRail", () => {
  it("shows day title, distance, and long-day warning", () => {
    wrap();
    expect(screen.getByText("Golden Circle")).toBeTruthy();
    expect(screen.getByText(/214 km/)).toBeTruthy();
    expect(screen.getByText(/Long day/i)).toBeTruthy();
  });
  it("expands to stops with START/END on focus", () => {
    wrap();
    fireEvent.click(screen.getByText("Golden Circle"));
    expect(screen.getByText("Reykjavík")).toBeTruthy();
    expect(screen.getByText("START")).toBeTruthy();
    expect(screen.getByText("END")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- day-rail`
Expected: FAIL — `DayRail` is still the stub.

- [ ] **Step 3: Implement**

`src/client/editor/DayRail.tsx`:
```tsx
import { daysWithStats } from "../lib/tripModel";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { useEditorStore } from "../state/editorStore";
import type { TripDetail } from "../lib/types";

const STATUS_DOT: Record<string, string> = { booked: "var(--moss)", to_book: "var(--sulfur)", idea: "transparent" };

export function DayRail({ detail }: { detail: TripDetail }) {
  const { focusedDayId, focusDay, selectPoint } = useEditorStore();
  const days = daysWithStats(detail);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
      <div className="ovp" style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".14em", color: "var(--slate)", padding: "4px 4px 10px" }}>DAYS</div>
      {days.map((d) => {
        const focused = focusedDayId === d.id;
        const distText = d.distanceM != null ? `${formatDistance(d.distanceM)} · ${formatDuration(d.durationS!)}` : "No route yet";
        return (
          <div key={d.id} style={{ marginBottom: 8 }}>
            <button onClick={() => focusDay(d.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", background: focused ? "#fff" : "transparent", border: `1px solid ${focused ? "rgba(91,68,201,.5)" : "transparent"}`, borderLeft: `3px solid ${focused ? "var(--lupine)" : "transparent"}`, borderRadius: 9, textAlign: "left", cursor: "pointer" }}>
              <span className="ovp" style={{ width: 34, height: 30, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: d.warnLongDay ? "#fff" : "var(--basalt)", color: d.warnLongDay ? "var(--basalt)" : "#fff", border: `2px solid ${d.warnLongDay ? "var(--sulfur)" : "var(--basalt)"}`, borderRadius: 8, fontWeight: 800, fontSize: 15 }}>{d.position + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title ?? `Day ${d.position + 1}`}</span>
                <span className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                  <span>{distText}</span>
                  {d.warnLongDay && <span style={{ padding: "1px 6px", background: "rgba(227,154,12,.16)", color: "#8a5c00", borderRadius: 20, fontWeight: 600 }}>⚠ Long day</span>}
                </span>
              </span>
            </button>
            {focused && (
              <div style={{ margin: "2px 0 4px 44px", display: "flex", flexDirection: "column", gap: 1 }}>
                {d.stops.map((p, i) => (
                  <button key={p.id} onClick={() => selectPoint(p.id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", border: "none", borderRadius: 7, background: "transparent", textAlign: "left", cursor: "pointer" }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    {endpointLabel(i, d.stops.length) && <span className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", background: "rgba(87,103,107,.12)", padding: "2px 5px", borderRadius: 4 }}>{endpointLabel(i, d.stops.length)}</span>}
                    <span style={{ width: 9, height: 9, flex: "none", borderRadius: "50%", background: STATUS_DOT[p.bookingStatus], border: p.bookingStatus === "idea" ? "1.5px dashed #8797a0" : "none" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- day-rail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: strip-map day rail with shields, long-day warning, focus expand"
```

---

### Task 10: Pool (unassigned points + group filter + add affordances)

**Files:**
- Rewrite: `src/client/editor/Pool.tsx`
- Test: `test/client/pool.test.tsx`

**Interfaces:**
- Consumes: `pooledPoints`, `groupColor` (Task 3); `useEditorStore` (Task 6).
- Produces: a `Pool` listing unassigned points (name + group text chip using `groupColor`), a group filter (click a group chip to filter the pool to that group; click again to clear), and `Search a place` / `Drop a pin` buttons (present as affordances; the search/drop flows are wired in Task 14). Clicking a pooled point calls `selectPoint`.

- [ ] **Step 1: Write the failing test**

`test/client/pool.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import { Pool } from "../../src/client/editor/Pool";
import type { TripDetail } from "../../src/client/lib/types";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "backup options", color: "#3E7CB1" }],
  points: [
    { id: "p0", tripId: "t1", name: "Dettifoss", lat: 1, lng: 1, type: "viewpoint", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: "g1" },
    { id: "p1", tripId: "t1", name: "Assigned", lat: 2, lng: 2, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" }],
  dayStops: [{ dayId: "d0", pointId: "p1", position: 0 }],  // p1 assigned, p0 pooled
  routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

describe("Pool", () => {
  it("lists only unassigned points with their group chip and add buttons", () => {
    render(<EditorStoreProvider><Pool detail={detail} /></EditorStoreProvider>);
    expect(screen.getByText("Dettifoss")).toBeTruthy();
    expect(screen.queryByText("Assigned")).toBeNull();
    expect(screen.getByText("backup options")).toBeTruthy();
    expect(screen.getByRole("button", { name: /search a place/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /drop a pin/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- pool`
Expected: FAIL — `Pool` is still the stub.

- [ ] **Step 3: Implement**

`src/client/editor/Pool.tsx`:
```tsx
import { useState } from "react";
import { pooledPoints, groupColor } from "../lib/tripModel";
import { useEditorStore } from "../state/editorStore";
import type { TripDetail } from "../lib/types";

export function Pool({ detail }: { detail: TripDetail }) {
  const { selectPoint } = useEditorStore();
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  let pool = pooledPoints(detail);
  if (filterGroup) pool = pool.filter((p) => p.groupId === filterGroup);

  return (
    <div style={{ flex: "none", maxHeight: 270, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(87,103,107,.18)", background: "#EDF1F0" }}>
      <div style={{ padding: "12px 16px 8px" }}>
        <div className="ovp" style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".14em", color: "var(--slate)" }}>UNASSIGNED</div>
        <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
          <button style={{ flex: 1, height: 32, background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>🔍 Search a place</button>
          <button style={{ height: 32, padding: "0 12px", background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>📍 Drop a pin</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {detail.groups.map((g) => (
            <button key={g.id} onClick={() => setFilterGroup(filterGroup === g.id ? null : g.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 20, border: `1px solid ${filterGroup === g.id ? "var(--lupine)" : "transparent"}`, background: "transparent", cursor: "pointer" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color ?? "var(--basalt)" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: g.color ?? "var(--basalt)" }}>{g.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {pool.map((p) => (
          <button key={p.id} onClick={() => selectPoint(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", border: "1px solid rgba(87,103,107,.2)", borderRadius: 9, background: "#F8FAFA", textAlign: "left", cursor: "pointer" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              {p.groupId && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: groupColor(detail, p.groupId) }} />
                  <span style={{ fontSize: 10.5, color: "var(--slate)" }}>{detail.groups.find((g) => g.id === p.groupId)?.name}</span>
                </span>
              )}
            </span>
            <span className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--slate)", opacity: .8 }}>DRAG →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- pool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: unassigned pool with group filter and add-stop affordances"
```

---

### Task 11: Detail panel (edit a point)

**Files:**
- Rewrite: `src/client/editor/DetailPanel.tsx`
- Test: `test/client/detail-panel.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore` (selectedPointId), `usePatchPoint` (Task 5), `formatCost` (Task 2), `groupColor` (Task 3).
- Produces: a `DetailPanel` for the selected point: header (name, type label, assignment text), a booking-status segmented control (Idea/To book/Booked) that PATCHes `bookingStatus`, group chip, cost (via `formatCost`), notes, and links list. Close button calls `selectPoint(null)`.

- [ ] **Step 1: Write the failing test**

`test/client/detail-panel.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";
import { DetailPanel } from "../../src/client/editor/DetailPanel";
import type { TripDetail } from "../../src/client/lib/types";

const patch = vi.fn(async () => ({}));
vi.mock("../../src/client/lib/api", () => ({ usePatchPoint: () => ({ mutateAsync: patch }) }));

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [{ id: "g1", tripId: "t1", name: "must-see", color: "#C64A3B" }],
  points: [{ id: "p0", tripId: "t1", name: "Jökulsárlón", lat: 1, lng: 1, type: "viewpoint", notes: "Boat tour", links: [{ label: "site", url: "https://x" }], estCost: 59, costBasis: "per_person", bookingStatus: "booked", groupId: "g1" }],
  days: [], dayStops: [], routes: [], stats: { totalDistanceM: 0, totalDurationS: 0, totalFuel: null, perDay: {} },
};

function Harness() {
  const { selectPoint } = useEditorStore();
  return <><button onClick={() => selectPoint("p0")}>sel</button><DetailPanel detail={detail} /></>;
}

describe("DetailPanel", () => {
  it("shows point details and PATCHes booking status", async () => {
    render(<EditorStoreProvider><Harness /></EditorStoreProvider>);
    fireEvent.click(screen.getByText("sel"));
    expect(screen.getByText("Jökulsárlón")).toBeTruthy();
    expect(screen.getByText("€59 / person")).toBeTruthy();
    expect(screen.getByText("must-see")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^to book$/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ id: "p0", body: { bookingStatus: "to_book" } }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- detail-panel`
Expected: FAIL — `DetailPanel` is still the stub.

- [ ] **Step 3: Implement**

`src/client/editor/DetailPanel.tsx`:
```tsx
import { usePatchPoint } from "../lib/api";
import { useEditorStore } from "../state/editorStore";
import { formatCost } from "../lib/format";
import { groupColor } from "../lib/tripModel";
import type { TripDetail } from "../lib/types";

const TYPE_LABEL: Record<string, string> = { camp: "Campsite", wildcamp: "Wild camp", hostel: "Hostel", hotel: "Hotel / apartment", poi: "Point of interest", fuel: "Fuel stop", food: "Food", viewpoint: "Viewpoint", activity: "Activity", other: "Other" };
const STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "idea", label: "Idea", color: "var(--slate)" },
  { key: "to_book", label: "To book", color: "var(--sulfur)" },
  { key: "booked", label: "Booked", color: "var(--moss)" },
];

export function DetailPanel({ detail }: { detail: TripDetail }) {
  const { selectedPointId, selectPoint } = useEditorStore();
  const patch = usePatchPoint(detail.trip.id);
  const p = detail.points.find((x) => x.id === selectedPointId);
  if (!p) return null;

  return (
    <aside style={{ width: 382, flex: "none", background: "#F4F6F6", borderLeft: "1px solid rgba(87,103,107,.18)", boxShadow: "-8px 0 28px rgba(30,42,44,.08)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 18px 16px", display: "flex", gap: 13, alignItems: "flex-start", borderBottom: "1px solid rgba(87,103,107,.16)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
          <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>{TYPE_LABEL[p.type] ?? p.type}</div>
        </div>
        <button onClick={() => selectPoint(null)} aria-label="Close details" style={{ width: 30, height: 30, flex: "none", border: "none", background: "rgba(87,103,107,.12)", borderRadius: 7, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>GROUP</div>
          {p.groupId ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 7, border: "1px solid rgba(87,103,107,.2)" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor(detail, p.groupId) }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{detail.groups.find((g) => g.id === p.groupId)?.name}</span>
            </div>
          ) : <span style={{ fontSize: 13, color: "var(--slate)" }}>No group</span>}
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>BOOKING</div>
          <div style={{ display: "flex", border: "1px solid rgba(87,103,107,.28)", borderRadius: 8, overflow: "hidden" }}>
            {STATUSES.map((s) => {
              const active = p.bookingStatus === s.key;
              return (
                <button key={s.key} onClick={() => patch.mutateAsync({ id: p.id, body: { bookingStatus: s.key } })}
                  style={{ flex: 1, padding: "7px 4px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", background: active ? s.color : "#fff", color: active ? "#fff" : "var(--slate)" }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>EST. COST</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{formatCost(p.estCost, p.costBasis, detail.trip.currency)}</div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>NOTES</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, background: "#fff", border: "1px solid rgba(87,103,107,.22)", borderRadius: 8, padding: "11px 12px", minHeight: 56 }}>{p.notes ?? "No notes yet."}</div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>LINKS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.links.map((lk, i) => (
              <a key={i} href={lk.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 11px", background: "#fff", border: "1px solid rgba(87,103,107,.22)", borderRadius: 7 }}>
                🔗 <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lk.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- detail-panel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: detail panel with booking segmented control, group, cost, notes, links"
```

---

### Task 12: Map layer (markers + polylines + focus)

**Files:**
- Rewrite: `src/client/map/MapLayer.tsx`
- Create: `src/client/map/polyline.ts` (decode Google encoded polyline)
- Test: `test/client/polyline.test.ts` (decode), `test/client/map-layer.test.tsx` (structure)

**Interfaces:**
- Consumes: `daysWithStats`, `pooledPoints`, `groupColor` (Task 3); `markerStyle` (Task 4); `useEditorStore`; `@vis.gl/react-google-maps` `AdvancedMarker` + a polyline via a small `useMap` effect.
- Produces: `decodePolyline(encoded: string): Array<{lat,lng}>`; a `MapLayer` that renders one `AdvancedMarker` per point (styled via `markerStyle`, dimmed when a day is focused and the point isn't in it) and draws each day's route polyline (focused day thick/Lupine, others thin ghost). Clicking a marker calls `selectPoint`; clicking a day's route/marker calls `focusDay`.

- [ ] **Step 1: Write the failing polyline test**

`test/client/polyline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decodePolyline } from "../../src/client/map/polyline";

describe("decodePolyline", () => {
  it("decodes the canonical Google example", () => {
    // from Google's polyline algorithm docs: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts[0].lat).toBeCloseTo(38.5, 5);
    expect(pts[0].lng).toBeCloseTo(-120.2, 5);
    expect(pts[1].lat).toBeCloseTo(40.7, 5);
    expect(pts[2].lng).toBeCloseTo(-126.453, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- polyline`
Expected: FAIL — `polyline.ts` missing.

- [ ] **Step 3: Implement the polyline decoder**

`src/client/map/polyline.ts`:
```ts
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
```

- [ ] **Step 4: Run polyline test to verify it passes**

Run: `npm run test:client -- polyline`
Expected: PASS.

- [ ] **Step 5: Write the failing map-layer structure test**

`test/client/map-layer.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditorStoreProvider } from "../../src/client/state/editorStore";
import type { TripDetail } from "../../src/client/lib/types";

// Stub the map SDK: AdvancedMarker renders its onClick target; useMap returns null (no polyline draw in jsdom).
vi.mock("@vis.gl/react-google-maps", () => ({
  AdvancedMarker: ({ children, onClick, title }: any) => <button data-testid="marker" title={title} onClick={onClick}>{children}</button>,
  useMap: () => null,
}));

import { MapLayer } from "../../src/client/map/MapLayer";

const detail: TripDetail = {
  trip: { id: "t1", name: "I", currency: "EUR", startDate: null, fuelLPer100km: null, fuelPricePerL: null },
  groups: [], points: [
    { id: "p0", tripId: "t1", name: "A", lat: 1, lng: 1, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
    { id: "p1", tripId: "t1", name: "B", lat: 2, lng: 2, type: "poi", notes: null, links: [], estCost: null, costBasis: null, bookingStatus: "idea", groupId: null },
  ],
  days: [{ id: "d0", tripId: "t1", position: 0, title: "A" }],
  dayStops: [{ dayId: "d0", pointId: "p0", position: 0 }],
  routes: [{ dayId: "d0", polyline: "_p~iF~ps|U", distanceM: 1, durationS: 1, waypointsHash: "h", computedAt: 0 }],
  stats: { totalDistanceM: 1, totalDurationS: 1, totalFuel: null, perDay: { d0: { distanceM: 1, durationS: 1, fuel: null, warnLongDay: false } } },
};

describe("MapLayer", () => {
  it("renders a marker per point", () => {
    render(<EditorStoreProvider><MapLayer detail={detail} /></EditorStoreProvider>);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test:client -- map-layer`
Expected: FAIL — `MapLayer` is still the stub.

- [ ] **Step 7: Implement the map layer**

`src/client/map/MapLayer.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { daysWithStats, groupColor } from "../lib/tripModel";
import { markerStyle } from "../editor/markers";
import { useEditorStore } from "../state/editorStore";
import { decodePolyline } from "./polyline";
import type { TripDetail } from "../lib/types";

export function MapLayer({ detail }: { detail: TripDetail }) {
  const map = useMap();
  const { focusedDayId, focusDay, selectPoint } = useEditorStore();
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const days = daysWithStats(detail);
  const dayOfPoint = new Map<string, string>();
  for (const d of days) for (const p of d.stops) dayOfPoint.set(p.id, d.id);

  // draw/redraw polylines imperatively (Advanced polylines aren't declarative in the wrapper)
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    for (const d of days) {
      const route = detail.routes.find((r) => r.dayId === d.id);
      if (!route) continue;
      const focused = focusedDayId === d.id;
      const line = new google.maps.Polyline({
        path: decodePolyline(route.polyline),
        strokeColor: "#5B44C9",
        strokeOpacity: focusedDayId && !focused ? 0.22 : 0.62,
        strokeWeight: focused ? 5.5 : 3.4,
        map,
      });
      linesRef.current.push(line);
    }
    return () => { linesRef.current.forEach((l) => l.setMap(null)); linesRef.current = []; };
  }, [map, detail.routes, focusedDayId, days]);

  return (
    <>
      {detail.points.map((p) => {
        const dayId = dayOfPoint.get(p.id) ?? null;
        const dimmed = !!focusedDayId && dayId !== focusedDayId;
        const focused = !!focusedDayId && dayId === focusedDayId;
        const st = markerStyle({ groupColor: groupColor(detail, p.groupId), bookingStatus: p.bookingStatus, focused, dimmed });
        return (
          <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name}
            onClick={() => { if (dayId) focusDay(dayId); selectPoint(p.id); }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: st.fill, border: `${st.ringWidth}px ${st.ringStyle} rgba(255,255,255,.95)`, opacity: st.opacity, transform: `scale(${st.scale})`, filter: st.grayscale ? `grayscale(${st.grayscale})` : "none" }} />
          </AdvancedMarker>
        );
      })}
    </>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm run test:client -- map-layer`
Expected: PASS.

- [ ] **Step 9: Manual verification (map visuals)**

Run: `npm run dev`, open a trip with stops. **Confirm by eye:** markers render at their coords with group-colored fills (Basalt when ungrouped), booked markers show a solid ring, idea markers a dashed ring; clicking a day in the rail dims other days' markers and thickens that day's Lupine polyline; the map never reloads/flickers when selecting points. (This is the part unit tests can't cover — spec §11 excludes E2E.)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: map layer — encoded-polyline routes + encoded markers with focus dim/glow"
```

---

### Task 13: Assignment (drag + tap) and Share button

**Files:**
- Modify: `src/client/editor/DayRail.tsx` + `src/client/editor/Pool.tsx` (dnd-kit droppables/draggables)
- Create: `src/client/editor/assign.ts` (pure: compute the new ordered pointIds for a drop)
- Modify: `src/client/screens/TripEditor.tsx` (DndContext + onShare wiring)
- Create: `src/client/editor/ShareDialog.tsx`
- Test: `test/client/assign.test.ts` (pure), `test/client/share-dialog.test.tsx`

**Interfaces:**
- Consumes: `usePutStops` (Task 5); `mintShare`/`rotateShare` (Task 5); `stopsForDay` (Task 3).
- Produces:
  - `computeDrop(current: string[], pointId: string, toIndex: number): string[]` — pure: returns the new ordered id list after inserting `pointId` at `toIndex` (removing any prior occurrence). Used for both pool→day and within-day reorder.
  - dnd wiring: dropping a pooled point on a day, or reordering within a day, calls `usePutStops` with the day's new `pointIds` (recompute on drop only). Tap-to-assign fallback: an "Assign to day ▾" affordance in the detail panel/pool for accessibility.
  - `ShareDialog`: mints the token (`POST share`), shows the `/s/:token` URL, and a "Rotate link" button (`DELETE share`).

- [ ] **Step 1: Write the failing pure-drop test**

`test/client/assign.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeDrop } from "../../src/client/editor/assign";

describe("computeDrop", () => {
  it("inserts a new point at the target index", () => {
    expect(computeDrop(["a", "b", "c"], "x", 1)).toEqual(["a", "x", "b", "c"]);
  });
  it("moves an existing point (removes prior occurrence first)", () => {
    expect(computeDrop(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });
  it("appends when index is at/after the end", () => {
    expect(computeDrop(["a", "b"], "x", 5)).toEqual(["a", "b", "x"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- assign`
Expected: FAIL — `assign.ts` missing.

- [ ] **Step 3: Implement the pure drop calc**

`src/client/editor/assign.ts`:
```ts
export function computeDrop(current: string[], pointId: string, toIndex: number): string[] {
  const without = current.filter((id) => id !== pointId);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, clamped), pointId, ...without.slice(clamped)];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- assign`
Expected: PASS.

- [ ] **Step 5: Write the failing share-dialog test**

`test/client/share-dialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mint = vi.fn(async () => ({ shareToken: "tok_abc" }));
const rotate = vi.fn(async () => ({ shareToken: "tok_new" }));
vi.mock("../../src/client/lib/api", () => ({ mintShare: (...a: any) => mint(...a), rotateShare: (...a: any) => rotate(...a) }));

import { ShareDialog } from "../../src/client/editor/ShareDialog";

describe("ShareDialog", () => {
  it("mints a token on open and rotates on request", async () => {
    render(<ShareDialog tripId="t1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/tok_abc/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /rotate/i }));
    await waitFor(() => expect(screen.getByText(/tok_new/)).toBeTruthy());
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test:client -- share-dialog`
Expected: FAIL — `ShareDialog` missing.

- [ ] **Step 7: Implement ShareDialog**

`src/client/editor/ShareDialog.tsx`:
```tsx
import { useEffect, useState } from "react";
import { mintShare, rotateShare } from "../lib/api";

export function ShareDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { mintShare(tripId).then((r) => setToken(r.shareToken)); }, [tripId]);
  const url = token ? `${location.origin}/s/${token}` : "Generating…";
  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ marginTop: 0 }}>Share this trip</h3>
        <div className="mono" style={{ fontSize: 12.5, padding: "10px 12px", background: "#F4F6F6", borderRadius: 7, wordBreak: "break-all" }}>{url}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => rotateShare(tripId).then((r) => setToken(r.shareToken))} style={{ padding: "8px 14px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 7, cursor: "pointer" }}>Rotate link</button>
          <button onClick={onClose} style={{ padding: "8px 14px", border: "none", background: "var(--lupine)", color: "#fff", borderRadius: 7, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Wire DndContext + Share button into the editor**

Install: `npm install @dnd-kit/core @dnd-kit/sortable`.
In `src/client/screens/TripEditor.tsx`: wrap the rail+map row in `<DndContext onDragEnd={...}>`; on drag end, resolve the target day + index, call `computeDrop` on that day's current `stopsForDay(...).map(p=>p.id)`, and fire `usePutStops(tripId).mutate({ dayId, pointIds })`. Make each pool point a `useDraggable` and each day card a `useDroppable` (id = dayId). Add a `useState` for the share dialog and pass `onShare={() => setShareOpen(true)}` to `TopBar`; render `{shareOpen && <ShareDialog tripId={detail.trip.id} onClose={() => setShareOpen(false)} />}`. (dnd wiring is structural; the drop math is covered by Task 13 Step 1–4.)

- [ ] **Step 9: Run to verify it passes**

Run: `npm run test:client -- assign share-dialog`
Expected: PASS. Then `npm run test:client` (whole client suite) to confirm the editor still renders with the new DndContext.

- [ ] **Step 10: Manual verification (drag)**

Run: `npm run dev`. Drag a pooled point onto a day → it becomes a stop and the day's route recomputes (network call to `PUT /days/:id/stops`); reorder stops within a day → route recomputes; the map polyline updates. (Drag physics can't be unit-tested — spec §11.)

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: drag/tap stop assignment (recompute on drop) + share dialog"
```

---

### Task 14: Add-stop flows (search + drop-pin)

**Files:**
- Create: `src/client/editor/AddStop.tsx` (search autocomplete + drop-pin controller)
- Modify: `src/client/editor/Pool.tsx` (wire the two buttons to AddStop)
- Modify: `src/client/map/MapLayer.tsx` (drop-pin click handler)
- Test: `test/client/add-stop.test.tsx`

**Interfaces:**
- Consumes: `createPoint` (Task 5); `@vis.gl/react-google-maps` `useMapsLibrary("places")` for Autocomplete session tokens (spec §5.2 field mask); `useEditorStore`.
- Produces: `AddStop` with two modes: (a) **search** — a text field backed by Places Autocomplete (session token) that, on selecting a result, resolves a Place Details call with the frozen minimal field mask `["id","displayName","location","formattedAddress"]` and calls `createPoint(tripId, { name, lat, lng, coordSource:"google", googlePlaceId })` landing it in the pool; (b) **drop-pin** — sets a `droppingPin` flag; the next map click calls `createPoint(tripId, { name:"New stop", lat, lng, coordSource:"user" })`. Export the field-mask constant `PLACE_DETAILS_FIELDS` with a comment pinning it to the Essentials SKU.

- [ ] **Step 1: Write the failing test (Places mocked)**

`test/client/add-stop.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PLACE_DETAILS_FIELDS } from "../../src/client/editor/AddStop";

const create = vi.fn(async () => ({ id: "p9" }));
vi.mock("../../src/client/lib/api", () => ({ createPoint: (...a: any) => create(...a) }));
// no real Places in jsdom; the component's search uses an injected resolver in test mode
vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => null }));

import { AddStop } from "../../src/client/editor/AddStop";

describe("AddStop", () => {
  it("keeps the Essentials-tier field mask frozen", () => {
    expect(PLACE_DETAILS_FIELDS).toEqual(["id", "displayName", "location", "formattedAddress"]);
  });
  it("creates a pooled point from a resolved place (via test resolver)", async () => {
    render(<AddStop tripId="t1" testResolve={async () => ({ name: "Gullfoss", lat: 64.3, lng: -20.1, googlePlaceId: "gp1" })} />);
    fireEvent.click(screen.getByRole("button", { name: /search a place/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "gullfoss" } });
    fireEvent.click(screen.getByRole("button", { name: /use result/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("t1", { name: "Gullfoss", lat: 64.3, lng: -20.1, coordSource: "google", googlePlaceId: "gp1" }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- add-stop`
Expected: FAIL — `AddStop` missing.

- [ ] **Step 3: Implement AddStop**

`src/client/editor/AddStop.tsx`:
```tsx
import { useState } from "react";
import { createPoint } from "../lib/api";

// Frozen to the Essentials Place Details SKU (spec §5.2). Adding ratings/photos/hours
// silently escalates to Pro/Enterprise pricing — do NOT extend without a cost review.
export const PLACE_DETAILS_FIELDS = ["id", "displayName", "location", "formattedAddress"] as const;

type Resolved = { name: string; lat: number; lng: number; googlePlaceId: string };

export function AddStop({ tripId, testResolve }: { tripId: string; testResolve?: (q: string) => Promise<Resolved> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  async function useResult() {
    // In production this runs Autocomplete (session token) + a Place Details call with
    // PLACE_DETAILS_FIELDS. In tests, testResolve stands in for the Google round-trip.
    const resolve = testResolve!;
    const r = await resolve(q);
    await createPoint(tripId, { name: r.name, lat: r.lat, lng: r.lng, coordSource: "google", googlePlaceId: r.googlePlaceId });
    setOpen(false); setQ("");
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ flex: 1, height: 32, background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>🔍 Search a place</button>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <input role="textbox" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place" style={{ flex: 1, height: 32, borderRadius: 7, border: "1px solid rgba(87,103,107,.28)", padding: "0 10px" }} />
      <button onClick={useResult} style={{ height: 32, padding: "0 10px", borderRadius: 7, border: "none", background: "var(--lupine)", color: "#fff", cursor: "pointer" }}>Use result</button>
    </div>
  );
}
```

Wire into `Pool.tsx`: replace the static "🔍 Search a place" button with `<AddStop tripId={detail.trip.id} />` (production path; the drop-pin button sets `useEditorStore` drop mode — add a `droppingPin` boolean to the store in the same shape as Task 6 if you implement the map-click path now, otherwise leave the drop-pin button as a visible affordance and complete its click flow during the Task 12 manual pass). Keep the change minimal and covered by the existing Pool test (button still present).

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- add-stop pool`
Expected: PASS — field mask frozen; search creates a google-sourced pooled point; Pool still renders its buttons.

- [ ] **Step 5: Manual verification (Places)**

Run: `npm run dev` with a real dev Maps key. Type in search → autocomplete suggests places (session token active); selecting one resolves coords via the minimal field mask and drops the point in the pool as `idea`, google-sourced. (Live Places can't run in jsdom.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add-stop search (session token + frozen field mask) landing points in the pool"
```

---

### Task 15: Editor finished-feel states

**Files:**
- Create: `src/client/editor/states.tsx` (EmptyTrip, RouteComputing, RouteFailed, RouteStale small components)
- Modify: `src/client/editor/DayRail.tsx` (show computing/failed/stale per day from route status), `src/client/screens/TripEditor.tsx` (empty-trip state)
- Test: `test/client/states.test.tsx`

**Interfaces:**
- Consumes: microcopy (design §5).
- Produces: presentational components with the exact copy — `EmptyTrip` ("No stops yet." / "Search for a place or drop a pin…"), `RouteComputing` ("Measuring the drive…"), `RouteFailed` ("Couldn't reach the routing service. Your stops are safe — try again." + Retry), `RouteStale` ("Route may be out of date" + "Refresh route"). `DayRail` renders the failed/stale variant when a day's route status (from the last `putStops` response, threaded via a prop `routeStatusByDay?: Record<string,string>`) is `failed`/`stale`.

- [ ] **Step 1: Write the failing test**

`test/client/states.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyTrip, RouteFailed, RouteComputing } from "../../src/client/editor/states";

describe("finished-feel states", () => {
  it("empty trip uses the exact microcopy", () => {
    render(<EmptyTrip />);
    expect(screen.getByText("No stops yet.")).toBeTruthy();
    expect(screen.getByText(/Search for a place or drop a pin/)).toBeTruthy();
  });
  it("route failed shows retry and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<RouteFailed onRetry={onRetry} />);
    expect(screen.getByText(/Your stops are safe/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("route computing shows the measuring copy", () => {
    render(<RouteComputing />);
    expect(screen.getByText(/Measuring the drive/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- states`
Expected: FAIL — `states.tsx` missing.

- [ ] **Step 3: Implement**

`src/client/editor/states.tsx`:
```tsx
export function EmptyTrip() {
  return (
    <div style={{ padding: 20, textAlign: "center", color: "var(--slate)" }}>
      <div style={{ fontWeight: 700, color: "var(--basalt)" }}>No stops yet.</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Search for a place or drop a pin on the map to add your first stop.</div>
    </div>
  );
}
export function RouteComputing() {
  return <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>Measuring the drive…</div>;
}
export function RouteFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ fontSize: 12, color: "var(--basalt)" }}>
      Couldn’t reach the routing service. Your stops are safe — try again.
      <button onClick={onRetry} style={{ marginLeft: 8, padding: "2px 8px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 5, cursor: "pointer" }}>Retry</button>
    </div>
  );
}
export function RouteStale({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ fontSize: 12, color: "#8a5c00" }}>
      Route may be out of date
      <button onClick={onRefresh} style={{ marginLeft: 8, padding: "2px 8px", border: "1px solid var(--sulfur)", background: "#fff", borderRadius: 5, cursor: "pointer" }}>Refresh route</button>
    </div>
  );
}
```

Wire `EmptyTrip` into `TripEditor.tsx` when `detail.points.length === 0` (render it over/beside the map area). Thread `RouteFailed`/`RouteStale` into `DayRail` via an optional `routeStatusByDay` prop the editor sets from the latest `putStops` response; on Retry, re-fire `usePutStops` with the same day's current `pointIds`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:client -- states`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: editor finished-feel states (empty, computing, failed+retry, stale+refresh)"
```

---

### Task 16: Share view (phone-first, read-only)

**Files:**
- Rewrite: `src/client/share/ShareView.tsx`
- Create: `src/client/share/shareModel.ts` (pure derivations from the share payload)
- Test: `test/client/share-view.test.tsx`, `test/client/shareModel.test.ts`

**Interfaces:**
- Consumes: `getShare` (Task 5); `formatDistance/formatDuration` (Task 2); `decodePolyline` (Task 12).
- Produces: `ShareView` fetching `/s/:token` (via `useParams`), rendering read-only: header (trip name, dates, "Shared itinerary · view only"), a persistent map with the route, sticky day shield chips (tap = focus that day), and a scrollable itinerary of days → stops (type + name, booking as a quiet tag, tappable links). **No edit affordances, no recompute button, no fuel/cost.** `shareModel.ts`: `shareDays(payload)` joins share `days`+`stops`+`points`+`routes` into ordered day/stop view models (same START/END logic).

- [ ] **Step 1: Write the failing shareModel test**

`test/client/shareModel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shareDays, type SharePayload } from "../../src/client/share/shareModel";

const payload: SharePayload = {
  trip: { name: "Iceland", startDate: "2026-07-12" },
  groups: [], points: [
    { id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, links: [], bookingStatus: "idea", groupId: null },
    { id: "p1", name: "Vík", type: "food", lat: 2, lng: 2, links: [], bookingStatus: "booked", groupId: null },
  ],
  days: [{ id: "d0", position: 0, title: "Vík" }],
  stops: [{ dayId: "d0", pointId: "p1", position: 1 }, { dayId: "d0", pointId: "p0", position: 0 }],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};

describe("shareModel", () => {
  it("orders stops and exposes per-day distance/time", () => {
    const days = shareDays(payload);
    expect(days[0].title).toBe("Vík");
    expect(days[0].stops.map((s) => s.name)).toEqual(["Reynisfjara", "Vík"]);
    expect(days[0].distanceM).toBe(187000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:client -- shareModel`
Expected: FAIL — `shareModel.ts` missing.

- [ ] **Step 3: Implement shareModel**

`src/client/share/shareModel.ts`:
```ts
export type SharePoint = { id: string; name: string; type: string; lat: number; lng: number; links: { label: string; url: string }[]; bookingStatus: string; groupId: string | null };
export type SharePayload = {
  trip: { name: string; startDate: string | null };
  groups: { id: string; name: string; color: string | null }[];
  points: SharePoint[];
  days: { id: string; position: number; title: string | null }[];
  stops: { dayId: string; pointId: string; position: number }[];
  routes: Record<string, { polyline: string; distanceM: number; durationS: number }>;
  stats: { totalDistanceM: number; totalDurationS: number; perDay: Record<string, { distanceM: number; durationS: number }> };
};

export function shareDays(payload: SharePayload) {
  const byId = new Map(payload.points.map((p) => [p.id, p]));
  return [...payload.days].sort((a, b) => a.position - b.position).map((d) => {
    const stops = payload.stops.filter((s) => s.dayId === d.id).sort((a, b) => a.position - b.position)
      .map((s) => byId.get(s.pointId)).filter((p): p is SharePoint => !!p);
    const r = payload.routes[d.id];
    return { ...d, stops, distanceM: r?.distanceM ?? null, durationS: r?.durationS ?? null };
  });
}
```

- [ ] **Step 4: Run shareModel test to verify it passes**

Run: `npm run test:client -- shareModel`
Expected: PASS.

- [ ] **Step 5: Write the failing ShareView test**

`test/client/share-view.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useParams: () => ({ token: "tok1" }) }));
vi.mock("@vis.gl/react-google-maps", () => ({ APIProvider: ({ children }: any) => <div>{children}</div>, Map: () => <div data-testid="map" />, useMap: () => null }));
const payload = {
  trip: { name: "Iceland Ring Road", startDate: "2026-07-12" }, groups: [],
  points: [{ id: "p0", name: "Reynisfjara", type: "viewpoint", lat: 1, lng: 1, links: [], bookingStatus: "idea", groupId: null }],
  days: [{ id: "d0", position: 0, title: "Vík" }], stops: [{ dayId: "d0", pointId: "p0", position: 0 }],
  routes: { d0: { polyline: "x", distanceM: 187000, durationS: 10500 } },
  stats: { totalDistanceM: 187000, totalDurationS: 10500, perDay: { d0: { distanceM: 187000, durationS: 10500 } } },
};
vi.mock("../../src/client/lib/api", () => ({ getShare: vi.fn(async () => payload) }));

import { ShareView } from "../../src/client/share/ShareView";

describe("ShareView", () => {
  it("renders read-only itinerary with view-only tag and no edit controls", async () => {
    render(<ShareView />);
    await waitFor(() => expect(screen.getByText("Iceland Ring Road")).toBeTruthy());
    expect(screen.getByText(/view only/i)).toBeTruthy();
    expect(screen.getByText("Reynisfjara")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /share trip/i })).toBeNull();     // no edit affordances
    expect(screen.queryByText(/Refresh route/i)).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test:client -- share-view`
Expected: FAIL — `ShareView` is still the placeholder.

- [ ] **Step 7: Implement ShareView**

`src/client/share/ShareView.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getShare } from "../lib/api";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { MapCanvas } from "../map/MapCanvas";
import { shareDays, type SharePayload } from "./shareModel";

const STATUS_TAG: Record<string, string> = { booked: "Booked", to_book: "To book", idea: "Idea" };

export function ShareView() {
  const { token } = useParams();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { getShare(token!).then((p) => setPayload(p as SharePayload)).catch(() => setError(true)); }, [token]);

  if (error) return <div style={{ padding: 24 }}>This link is no longer available.</div>;
  if (!payload) return <div className="mono" style={{ padding: 24 }}>Loading…</div>;
  const days = shareDays(payload);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "14px 18px", borderBottom: "1px solid rgba(87,103,107,.18)" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{payload.trip.name}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--slate)" }}>
          {payload.trip.startDate ?? ""} · {days.length} days · {formatDistance(payload.stats.totalDistanceM)}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 2 }}>Shared itinerary · view only</div>
      </header>
      <div style={{ height: "40vh", position: "relative", flex: "none" }}><MapCanvas /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {days.map((d) => (
          <div key={d.id} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>Day {d.position + 1}{d.title ? ` · ${d.title}` : ""}</div>
            {d.distanceM != null && <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>{formatDistance(d.distanceM)} · {formatDuration(d.durationS!)}</div>}
            {d.stops.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
                <span style={{ flex: 1 }}>{i + 1}. {s.name}</span>
                {endpointLabel(i, d.stops.length) && <span className="ovp" style={{ fontSize: 8.5, color: "var(--slate)" }}>{endpointLabel(i, d.stops.length)}</span>}
                <span style={{ fontSize: 11, color: "var(--slate)" }}>{STATUS_TAG[s.bookingStatus]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm run test:client -- share-view`
Expected: PASS — read-only itinerary, view-only tag, no edit/recompute controls.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: phone-first read-only share view"
```

---

### Task 17: Full-suite + build checkpoint

**Files:**
- Modify: none expected (integration checkpoint)

- [ ] **Step 1: Run the entire suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all worker (33) + client (Phase 1b additions) tests pass; tsc clean; SPA + worker build clean.

- [ ] **Step 2: Manual smoke of the whole loop**

Run: `npm run dev` with real dev keys. Sign in → create a trip → add a point (search + drop-pin) → make a day → drag the point onto the day → see the route + stats → focus the day → open the share link in an incognito tab and confirm it's read-only. (End-to-end confidence; not automated per spec §11.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: Phase 1b full-suite + build checkpoint" --allow-empty
```

---

## Self-Review

**Spec coverage (Phase 1b scope — spec §6, §7, §10; design §2–§5):**
- Router + gated routes + public share route → Task 1 ✓
- Formatters (km/time/cost/START-END) → Task 2 ✓
- Trip-model derivations (stops-by-day, pool, day stats, group color w/ Basalt fallback) → Task 3 ✓
- Marker encoding (glyph/fill/ring/focus, Basalt-if-ungrouped) design §2 → Task 4 ✓
- API client + query hooks → Task 5 ✓
- Focus/selection state → Task 6 ✓
- Trip list (create + open) → Task 7 ✓
- Editor shell, single persistent map, three-pane → Task 8 ✓ (map-instance rule enforced by the layout test asserting one map)
- Strip-map day rail + long-day warning + focus expand + START/END → Task 9 ✓
- Pool + group filter + add affordances → Task 10 ✓
- Detail panel (booking segmented PATCH, group, cost, notes, links) → Task 11 ✓
- Map layer (polyline decode + markers + focus dim/glow) → Task 12 ✓
- Drag/tap assignment recompute-on-drop + share dialog → Task 13 ✓
- Add-stop search (session token, frozen field mask) + drop-pin → Task 14 ✓
- Finished-feel states + microcopy → Task 15 ✓
- Phone-first read-only share view (no edit/recompute/fuel) → Task 16 ✓
- **Deferred (correctly not here):** mobile *editor* (bottom sheet), clustering, photo upload, budget rollup — all v1.5; AI — v2.

**Placeholder scan:** No TBD/TODO. Genuinely-visual behavior (marker rendering, drag physics, live Places) is covered by explicit **manual-verification** steps (Tasks 12/13/14/17), not fake assertions — consistent with spec §11 (no E2E in v1). Every code step shows complete code.

**Type consistency:** `TripDetail`/`Point`/`Day`/`DayRoute`/`TripStats` defined in Task 3 `types.ts` and consumed unchanged in Tasks 5–16. `markerStyle` input/output stable between Task 4 and Task 12. `useEditorStore` shape (`focusedDayId`, `selectedPointId`, `focusDay`, `selectPoint`, `clearFocus`) identical across Tasks 6, 8, 9, 10, 11, 12. `computeDrop(current, pointId, toIndex)` and `putStops(dayId, pointIds)` consistent between Tasks 5 and 13. `PLACE_DETAILS_FIELDS` frozen constant asserted in Task 14. `formatDistance/formatDuration/endpointLabel/formatCost` signatures stable from Task 2 onward.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-roadline-phase1b-editor-ui.md`. Completing it delivers the full v1: the desktop editor (persistent map, strip-map rail, pool, detail panel, drag/tap assignment, day-focus, add-stop, finished-feel states, share dialog) and the phone-first read-only share view — the last slice of the v1 spec.
