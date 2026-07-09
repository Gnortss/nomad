# MapLibre Rendering Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Maps tile rendering (`@vis.gl/react-google-maps`) with MapLibre GL (`react-map-gl/maplibre`) while keeping Google Places for place search.

**Architecture:** The map is already isolated behind `MapCanvas` (takes `children` + `onMapClick`); all imperative Google calls live only in `MapCamera` (camera) and `MapLayer` (markers + polylines). We swap those three components to `react-map-gl/maplibre`, drop the `<APIProvider>` wrappers, and move Places autocomplete onto a standalone `@googlemaps/js-api-loader` hook so `AddStop` keeps working without the provider. Tiles come from a MapLibre style URL (MapTiler) instead of a Google cloud `mapId`.

**Tech Stack:** React 19 · `react-map-gl` v8 + `maplibre-gl` · `@googlemaps/js-api-loader` (Places only) · Vite · Vitest (jsdom client project) + `@testing-library/react`.

## Global Constraints

- **React 19** — `react-map-gl` must be v8 (v7 does not declare React 19 peer support). Verify `npm ls react` shows a single React 19 after install.
- **Keep Google Places.** Place search quality is out of scope to change here; `AddStop` continues to use the Google Places New API via a standalone loader. `VITE_GOOGLE_MAPS_BROWSER_KEY` stays.
- **Single never-unmounting map instance** (spec §8): no `key` prop derived from trip/day state anywhere up the map tree. Preserve this — do not add remount triggers.
- **Attribution stays visible.** OSM/MapTiler licensing requires the attribution control; do NOT hide it. (MapLibre shows it by default — just don't disable it.)
- **Out of scope (future plan):** the server-side injectable `Geocoder` (`src/worker/lib/geocode.ts`) and `RouteComputer` (`src/worker/lib/routes-google.ts`), and the AI planner's `googlePlaceId` flow (`plan-schema.ts`, `apply-plan.ts`). These stay on Google. The DB columns `coord_source` / `google_place_id` are free-text and are NOT migrated.
- **Runnable-complete after Task 5.** Tasks 3–5 are the rendering swap; each keeps its unit tests green independently, but the live app map is only coherent once all of Tasks 3, 4, and 5 have landed. Task 6 is cleanup + full verification.

---

### Task 1: Dependencies, env var, and map style

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/client/env.d.ts`
- Config only (no file): create the MapTiler style, set `VITE_MAP_STYLE_URL`

**Interfaces:**
- Consumes: nothing.
- Produces: `import.meta.env.VITE_MAP_STYLE_URL: string` (MapLibre style JSON URL, key embedded, HTTP-referrer restricted). `maplibre-gl`, `react-map-gl`, `@googlemaps/js-api-loader` available as direct deps; `@types/google.maps` as a direct devDep (it was transitive via `@vis.gl` and disappears when that is removed in Task 6).

- [ ] **Step 1: Install new deps (do NOT remove `@vis.gl` yet — map files still import it until Task 5)**

Run:
```bash
npm install maplibre-gl react-map-gl @googlemaps/js-api-loader
npm install -D @types/google.maps
```

- [ ] **Step 2: Verify React stays single-copy v19 and types still compile**

Run: `npm ls react && npm run typecheck`
Expected: one `react@19.x`; typecheck PASS (no source changed yet).

- [ ] **Step 3: Create the MapLibre style (manual, MapTiler dashboard)**

Recreate the muted gray-green look of the old `mapId`:
1. Create a MapTiler Cloud account → Maps → duplicate a neutral base style (e.g. "Dataviz" or "Basic") and tune land/water toward the existing gray-green palette (`src/client/styles/tokens.css` has the reference colors).
2. Copy its style URL: `https://api.maptiler.com/maps/<style-id>/style.json?key=<KEY>`.
3. To unblock dev immediately without styling, a stock URL works: `https://api.maptiler.com/maps/dataviz/style.json?key=<KEY>`.

- [ ] **Step 4: Add `VITE_MAP_STYLE_URL` to `.env.local` and to the env typing**

Add to `.env.local`:
```
VITE_MAP_STYLE_URL=https://api.maptiler.com/maps/<style-id>/style.json?key=<KEY>
```

Edit `src/client/env.d.ts` — add the style URL, keep the Places browser key + the `google.maps` type reference (still used by Places), drop nothing yet:
```ts
/// <reference types="google.maps" />
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID: string;
  readonly VITE_MAP_STYLE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/client/env.d.ts
git commit -m "chore: add maplibre + js-api-loader deps and VITE_MAP_STYLE_URL"
```

---

### Task 2: Standalone Places loader (`AddStop` off `APIProvider`)

**Files:**
- Create: `src/client/map/usePlacesLibrary.ts`
- Modify: `src/client/editor/AddStop.tsx:2,31`
- Test: `test/client/add-stop.test.tsx:17`, `test/client/pool.test.tsx:8`

**Interfaces:**
- Consumes: `VITE_GOOGLE_MAPS_BROWSER_KEY` (Task 1 env).
- Produces: `usePlacesLibrary(): unknown` — resolves to the Google Maps `places` library object (cast by the caller to its local `PlacesLib` shape), or `null` until loaded. Replaces `useMapsLibrary("places")`.

- [ ] **Step 1: Point the two test mocks at the new hook (they fail until the hook + wiring exist)**

Edit `test/client/add-stop.test.tsx` line 17, replacing the `@vis.gl` mock:
```tsx
vi.mock("../../src/client/map/usePlacesLibrary", () => ({ usePlacesLibrary: () => fakePlaces }));
```

Edit `test/client/pool.test.tsx` line 8, replacing the `@vis.gl` mock:
```tsx
// AddStop (embedded in Pool) reads the places library; not loaded in jsdom.
vi.mock("../../src/client/map/usePlacesLibrary", () => ({ usePlacesLibrary: () => null }));
```

- [ ] **Step 2: Run the two files to verify they fail (module + hook not wired yet)**

Run: `npx vitest run -c vitest.client.ts test/client/add-stop.test.tsx test/client/pool.test.tsx`
Expected: FAIL — `AddStop` still imports `useMapsLibrary` from `@vis.gl`, and `../map/usePlacesLibrary` does not resolve.

- [ ] **Step 3: Create the loader hook**

Create `src/client/map/usePlacesLibrary.ts`:
```ts
import { useEffect, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";

// Loads only the Places library of the Google Maps JS SDK, on demand — replaces
// the APIProvider-based useMapsLibrary("places") now that map tiles are MapLibre.
// Module-level promise so the SDK loads at most once across the app.
let placesPromise: Promise<unknown> | null = null;

export function usePlacesLibrary(): unknown {
  const [places, setPlaces] = useState<unknown>(null);
  useEffect(() => {
    if (!placesPromise) {
      const loader = new Loader({ apiKey: import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY, version: "weekly" });
      placesPromise = loader.importLibrary("places");
    }
    placesPromise.then(setPlaces);
  }, []);
  return places;
}
```

- [ ] **Step 4: Wire `AddStop` to the hook**

Edit `src/client/editor/AddStop.tsx`:
- Line 2 — replace the import:
```tsx
import { usePlacesLibrary } from "../map/usePlacesLibrary";
```
- Line 31 — replace the call:
```tsx
  const places = usePlacesLibrary() as PlacesLib | null;
```

- [ ] **Step 5: Run the two files to verify they pass**

Run: `npx vitest run -c vitest.client.ts test/client/add-stop.test.tsx test/client/pool.test.tsx`
Expected: PASS (4 tests: field-mask frozen, suggestion→create, pool listing, assign-to-day).

- [ ] **Step 6: Commit**

```bash
git add src/client/map/usePlacesLibrary.ts src/client/editor/AddStop.tsx test/client/add-stop.test.tsx test/client/pool.test.tsx
git commit -m "feat: load Google Places via standalone js-api-loader hook"
```

---

### Task 3: Swap `MapCanvas` to MapLibre + drop `APIProvider`

**Files:**
- Modify: `src/client/map/MapCanvas.tsx` (full rewrite)
- Modify: `src/client/screens/TripEditor.tsx:3,79,116`
- Modify: `src/client/share/ShareView.tsx:3,31`
- Test: `test/client/trip-editor.test.tsx:7`, `test/client/share-view.test.tsx:5`

**Interfaces:**
- Consumes: `VITE_MAP_STYLE_URL` (Task 1).
- Produces: `<MapCanvas>` renders a `react-map-gl/maplibre` `<Map>` that provides the map context to children via `useMap()`. Same props as before: `children?: React.ReactNode`, `onMapClick?: (latLng: { lat: number; lng: number }) => void`. No `<APIProvider>` needed anywhere.

- [ ] **Step 1: Update the two layout test mocks (they mock the map module; the default export drops children so `MapCamera`/`MapLayer` do not mount)**

Edit `test/client/trip-editor.test.tsx` line 7, replacing the `@vis.gl` mock:
```tsx
vi.mock("react-map-gl/maplibre", () => ({ default: () => <div data-testid="map" /> }));
```

Edit `test/client/share-view.test.tsx` line 5, replacing the `@vis.gl` mock:
```tsx
vi.mock("react-map-gl/maplibre", () => ({ default: () => <div data-testid="map" /> }));
```

- [ ] **Step 2: Run both files to verify they fail (real `MapCanvas` still imports `@vis.gl` `Map`)**

Run: `npx vitest run -c vitest.client.ts test/client/trip-editor.test.tsx test/client/share-view.test.tsx`
Expected: FAIL — `MapCanvas` imports from `@vis.gl/react-google-maps`, which is no longer what the tests mock.

- [ ] **Step 3: Rewrite `MapCanvas`**

Replace `src/client/map/MapCanvas.tsx` entirely:
```tsx
import Map, { type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// Also the instant fallback when geolocation is denied/unavailable (see MapCamera).
const EUROPE = { longitude: 10, latitude: 50, zoom: 4 };

// Renders the single persistent map. `react-map-gl`'s <Map> provides the map
// context so sibling children (MapCamera, MapLayer) can call useMap(). Mounts
// exactly once — never give this or an ancestor a state-derived `key` (spec §8).
export function MapCanvas({ children, onMapClick }: { children?: React.ReactNode; onMapClick?: (latLng: { lat: number; lng: number }) => void }) {
  return (
    <Map
      mapStyle={import.meta.env.VITE_MAP_STYLE_URL}
      initialViewState={EUROPE}
      dragRotate={false}
      style={{ width: "100%", height: "100%" }}
      onClick={(e: MapLayerMouseEvent) => { if (onMapClick) onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }); }}
    >
      {children}
    </Map>
  );
}
```

- [ ] **Step 4: Remove `<APIProvider>` from `TripEditor`**

Edit `src/client/screens/TripEditor.tsx`:
- Delete the import on line 3 (`import { APIProvider } from "@vis.gl/react-google-maps";`).
- Line 79 — replace `<APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>` with the bare fragment/root: make the `<div style={{ height: "100%", ... }}>` on the next line the returned root, i.e. `return (` immediately followed by that `<div>`.
- Line 116 — remove the matching `</APIProvider>` so the `</div>` becomes the last element before `);`.

- [ ] **Step 5: Remove `<APIProvider>` from `ShareView`**

Edit `src/client/share/ShareView.tsx`:
- Delete the import on line 3 (`import { APIProvider } from "@vis.gl/react-google-maps";`).
- Line 31 — replace `<APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}><MapCanvas /></APIProvider>` with `<MapCanvas />`.

- [ ] **Step 6: Run both files to verify they pass**

Run: `npx vitest run -c vitest.client.ts test/client/trip-editor.test.tsx test/client/share-view.test.tsx`
Expected: PASS. (If a `maplibre-gl/dist/maplibre-gl.css` import error appears, confirm the client vitest config uses the Vite React plugin — it resolves CSS imports as empty modules; no code change should be needed.)

- [ ] **Step 7: Commit**

```bash
git add src/client/map/MapCanvas.tsx src/client/screens/TripEditor.tsx src/client/share/ShareView.tsx test/client/trip-editor.test.tsx test/client/share-view.test.tsx
git commit -m "feat: render map with react-map-gl/maplibre, drop APIProvider"
```

---

### Task 4: Swap `MapLayer` markers + polylines to MapLibre

**Files:**
- Modify: `src/client/map/MapLayer.tsx` (full rewrite)
- Test: `test/client/map-layer.test.tsx:6-10,48`

**Interfaces:**
- Consumes: `<MapCanvas>` map context (Task 3) via `react-map-gl/maplibre` `<Marker>` / `<Source>` / `<Layer>` (they read the context internally — no `useMap()` needed here anymore).
- Produces: `<MapLayer detail={detail}>` — one `<Marker>` per point (styled div child carries `title={p.name}`), one `<Source>`+`<Layer>` line per day route.

- [ ] **Step 1: Update the test mock and the `pin` helper**

Edit `test/client/map-layer.test.tsx`:
- Replace the mock block (lines 6–10) — `Marker` renders its children and forwards a synthetic `{ originalEvent }` click; `Source` passes children through; `Layer` renders nothing; no `useMap` is used by the new `MapLayer`:
```tsx
// Stub the map SDK: Marker renders its child pin; Source passes through; Layer draws nothing in jsdom.
vi.mock("react-map-gl/maplibre", () => ({
  Marker: ({ children, onClick }: any) => <div data-testid="marker" onClick={(e: any) => onClick?.({ originalEvent: e })}>{children}</div>,
  Source: ({ children }: any) => <>{children}</>,
  Layer: () => null,
}));
```
- The `title` now lives on the styled pin `<div>` itself (Marker has no `title` prop), so change the helper on line 48 from `screen.getByTitle(name).firstElementChild` to the titled div directly:
```tsx
    const pin = (name: string) => screen.getByTitle(name) as HTMLElement;
```

- [ ] **Step 2: Run the file to verify it fails (real `MapLayer` still imports `@vis.gl` `AdvancedMarker`/`useMap`)**

Run: `npx vitest run -c vitest.client.ts test/client/map-layer.test.tsx`
Expected: FAIL — import/mock mismatch and `.firstElementChild` path removed.

- [ ] **Step 3: Rewrite `MapLayer`**

Replace `src/client/map/MapLayer.tsx` entirely (imperative polyline effect becomes declarative `<Source>`/`<Layer>`; `useMap`/`useRef`/`useEffect` removed):
```tsx
import { Marker, Source, Layer } from "react-map-gl/maplibre";
import { daysWithStats, groupColor } from "../lib/tripModel";
import { markerStyle } from "../editor/markers";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { decodePolyline } from "./polyline";
import type { TripDetail } from "../lib/types";

export function MapLayer({ detail }: { detail: TripDetail }) {
  const { selectedDayId, selectDay, selectPoint } = useEditorStore();
  const days = daysWithStats(detail);
  const dayOfPoint = new Map<string, string>();
  for (const d of days) for (const p of [...d.stops, ...d.attached]) dayOfPoint.set(p.id, d.id);

  return (
    <>
      {days.map((d) => {
        const route = detail.routes.find((r) => r.dayId === d.id);
        if (!route) return null;
        const selected = selectedDayId === d.id;
        const coordinates = decodePolyline(route.polyline).map((p) => [p.lng, p.lat] as [number, number]);
        return (
          <Source key={d.id} id={`route-${d.id}`} type="geojson"
            data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } } as GeoJSON.Feature}>
            <Layer id={`route-line-${d.id}`} type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#5B44C9",
                "line-opacity": selectedDayId && !selected ? 0.22 : 0.62,
                "line-width": selected ? 5.5 : 3.4,
              }} />
          </Source>
        );
      })}
      {detail.points.map((p) => {
        const dayId = dayOfPoint.get(p.id) ?? null;
        const dimmed = !!selectedDayId && dayId !== selectedDayId;
        const focused = !!selectedDayId && dayId === selectedDayId;
        const st = markerStyle({ groupColor: groupColor(detail, p.groupId), bookingStatus: p.bookingStatus, focused, dimmed });
        return (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center"
            onClick={(e) => { e.originalEvent.stopPropagation(); if (dayId) selectDay(dayId); selectPoint(p.id); }}>
            <div title={p.name} style={{ width: 30, height: 30, borderRadius: 8, background: st.fill, border: `${st.ringWidth}px ${st.ringStyle} rgba(255,255,255,.95)`, opacity: st.opacity, transform: `scale(${st.scale})`, filter: st.grayscale ? `grayscale(${st.grayscale})` : "none", display: "flex", alignItems: "center", justifyContent: "center" }}><TypeIcon type={p.type} size={16} color="#fff" /></div>
          </Marker>
        );
      })}
    </>
  );
}
```

- [ ] **Step 4: Run the file to verify it passes**

Run: `npx vitest run -c vitest.client.ts test/client/map-layer.test.tsx`
Expected: PASS (2 tests: marker-per-point with category icon; focused/dimmed styling).

- [ ] **Step 5: Commit**

```bash
git add src/client/map/MapLayer.tsx test/client/map-layer.test.tsx
git commit -m "feat: draw markers and route lines with react-map-gl/maplibre"
```

---

### Task 5: Swap `MapCamera` to MapLibre

**Files:**
- Modify: `src/client/map/MapCamera.tsx` (full rewrite)

**Interfaces:**
- Consumes: `<MapCanvas>` map context (Task 3) via `react-map-gl/maplibre` `useMap()`.
- Produces: initial-camera behavior unchanged — single point → center+zoom 11; multiple → `fitBounds` with 60px padding; empty → geolocation then Europe fallback. Fits once per mount, never re-fits.

- [ ] **Step 1: Rewrite `MapCamera`**

Replace `src/client/map/MapCamera.tsx` entirely (`useMap().current` is the MapLibre map ref; bounds computed by hand; the `typeof google` guard is gone):
```tsx
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { TripDetail } from "../lib/types";

// Sets the initial camera once per mount (imperatively — the Map itself stays
// uncontrolled and is never remounted): fit bounds to the trip's points if any,
// otherwise try geolocation; on deny/timeout the EUROPE default in MapCanvas
// is already showing. Never re-fits on later data changes.
export function MapCamera({ detail }: { detail: TripDetail }) {
  const { current: map } = useMap();
  const didInit = useRef(false);

  useEffect(() => {
    if (!map || didInit.current) return;
    didInit.current = true;
    const points = detail.points;
    if (points.length === 1) {
      map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 11 }); // fitBounds on a single point over-zooms
    } else if (points.length > 1) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const p of points) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
      map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 0 });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 8 }),
        () => {}, // denied/unavailable → keep the Europe default
        { timeout: 5000, maximumAge: 600_000 },
      );
    }
  }, [map, detail.points]);

  return null;
}
```

- [ ] **Step 2: Verify the full client test suite passes and types compile**

Run: `npm run test:client && npm run typecheck`
Expected: PASS. (`MapCamera` has no dedicated test; it's covered by typecheck + manual verification in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/client/map/MapCamera.tsx
git commit -m "feat: drive initial camera with react-map-gl/maplibre useMap"
```

---

### Task 6: Remove `@vis.gl`, update CI/docs, full verification

**Files:**
- Modify: `package.json` (remove `@vis.gl/react-google-maps`)
- Modify: `src/client/env.d.ts` (drop `VITE_GOOGLE_MAPS_MAP_ID`)
- Modify: `.github/workflows/deploy.yml:32`
- Modify: `docs/DEPLOY.md:30-31,59`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: no remaining reference to `@vis.gl/react-google-maps` or `VITE_GOOGLE_MAPS_MAP_ID` anywhere in the repo.

- [ ] **Step 1: Confirm nothing still imports the old package**

Run: `git grep -n "@vis.gl/react-google-maps\|VITE_GOOGLE_MAPS_MAP_ID" -- src test`
Expected: no matches under `src/` or `test/`.

- [ ] **Step 2: Remove the dependency**

Run: `npm uninstall @vis.gl/react-google-maps`

- [ ] **Step 3: Drop the dead env var from the typing**

Edit `src/client/env.d.ts` — remove the `VITE_GOOGLE_MAPS_MAP_ID` line so the interface is:
```ts
/// <reference types="google.maps" />
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY: string;
  readonly VITE_MAP_STYLE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Update CI build vars**

Edit `.github/workflows/deploy.yml` — replace the `VITE_GOOGLE_MAPS_MAP_ID` env line (line 32) with the style URL, keeping the browser key line above it:
```yaml
          VITE_GOOGLE_MAPS_BROWSER_KEY: ${{ vars.VITE_GOOGLE_MAPS_BROWSER_KEY }}
          VITE_MAP_STYLE_URL: ${{ vars.VITE_MAP_STYLE_URL }}
```
Then set the `VITE_MAP_STYLE_URL` GitHub Actions **variable** for the prod + preview environments, and remove the now-unused `VITE_GOOGLE_MAPS_MAP_ID` variable.

- [ ] **Step 5: Update deploy docs**

Edit `docs/DEPLOY.md`:
- Lines 30–31: replace the "cloud-styled Map ID" bullet with a "MapTiler style URL (`VITE_MAP_STYLE_URL`)" bullet; update the browser-key bullet to note the key now only needs the **Places API** enabled (Maps JS is no longer used for tiles, only for Places autocomplete).
- Line 59: replace `VITE_GOOGLE_MAPS_MAP_ID` with `VITE_MAP_STYLE_URL` in the Variables list.

- [ ] **Step 6: Run the full suite, typecheck, and production build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all worker + client tests PASS; typecheck clean; build succeeds.

- [ ] **Step 7: Manual end-to-end verification**

Use the `verify` skill (or `npm run dev`) to confirm in the running app: tiles render with the MapTiler style; markers appear and are clickable (day selects, marker propagation does not trigger drop-pin); route polylines draw and thicken on day-select; camera fits to trip points; drop-pin still creates a stop on map click; Place search (AddStop) still returns Google suggestions and creates a `coordSource: "google"` point.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/client/env.d.ts .github/workflows/deploy.yml docs/DEPLOY.md
git commit -m "chore: remove @vis.gl/react-google-maps and Google map-id config"
```

---

## Notes / decisions captured

- **Why keep Google Places:** OSM POI recall is materially weaker for a trip planner (missing/newer businesses, no ratings/hours). Rendering + camera + routing are at parity with MapLibre; place *search* is the one surface where Google is clearly better, and it's already cost-capped to the Essentials field mask (`AddStop.PLACE_DETAILS_FIELDS`). Full de-Googling of Places + server geocoder is a separate future plan.
- **Marker click propagation** (`e.originalEvent.stopPropagation()`) is defensive: MapLibre DOM markers sit above the canvas and generally don't fire the map `click`, but stopping propagation guarantees drop-pin mode isn't triggered by a marker click.
- **Marker anchor** is `center` (MapLibre default) vs Google `AdvancedMarker`'s bottom-center; for the 30×30 rounded-square pins this reads correctly — confirm visually in Task 6 Step 7 and switch to `anchor="bottom"` if the offset looks wrong.
- **Attribution control** stays (MapLibre default) — required by OSM/MapTiler licensing.
