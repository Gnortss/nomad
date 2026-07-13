# Share view: planner design, read-only — design

Date: 2026-07-13
Status: approved

## Goal

The public share page (`/s/:token`) currently uses a bespoke stacked layout (header, 40vh map,
scrolling day list) and clicking a stop does nothing visible. Rebuild it to look and behave like
the default planning view — day rail + pool sidebar, full-height map, stop detail panel on click —
with every edit affordance removed (no AI planner, no drag & drop, no editing).

## Decisions made during brainstorming

- **Privacy**: the shared stop panel shows everything the owner sees *except* notes and est. cost
  (unchanged privacy stance). The Google PLACE card (rating, address, website, opening hours) IS
  shown, which requires exposing `googlePlaceId` and a public, share-token-scoped place-info
  endpoint.
- **Pool**: the unassigned-stops pool renders read-only in the shared sidebar (its markers already
  render on the shared map; hiding the list would orphan them).
- **Approach**: reuse the real display components (`DayRail`, `Pool`, map stack) behind a
  `readOnly` store flag; the stop panel is a new small read-only component styled like
  `DetailPanel` (which is ~90% input widgets, so dual-moding it would touch every section).
  Rejected: dual-mode `DetailPanel` (too much churn in editor code), duplicating components under
  `share/` (design drift).

## Client design

### Read-only flag

`EditorStoreProvider` gains a `readOnly?: boolean` prop (default false) exposed through the store.
Components consult `useEditorStore().readOnly` — no prop threading.

### ShareView shell (`src/client/share/ShareView.tsx`)

Rebuilt as an editor-style shell around the payload it already fetches:

- **Top bar**: slim share variant written inline in ShareView (~15 lines) matching `TopBar`
  styling — 50px basalt header with contour, lupine square, NOMAD wordmark, trip name as plain
  text, the stats line (`distance · duration`; fuel is private and stays out), and the existing
  VIEW ONLY pill on the right. No Settings/Delete/Share/AI.
- **Desktop**: same body as the planner — left `aside` (344px, `#F4F6F6`) with `DayRail` + `Pool`,
  full-height map (`MapCanvas` + `MapCamera` + `MapLayer`), read-only stop panel sliding in on the
  right when a stop is selected.
- **Mobile** (`useIsMobile`): map fills the row, `BottomSheet` holds `DayRail` + `Pool` (header =
  centered stats line, as in the planner), stop panel goes fullscreen.
- **dnd-kit**: `DayRail`/`Pool` rows call `useSortable`/`useDraggable`/`useDndContext`, which need
  a `DndContext` ancestor. ShareView wraps the body in a bare `DndContext` with **no sensors** —
  hooks satisfied, drags physically impossible.
- Markers already select points (`MapLayer` → `selectPoint`); no map changes needed.

### readOnly behavior in reused components

Hidden when `readOnly`:

- `DayRail`: "+ Add day" button, sparkles refine-with-AI button, the "Drop here to keep it off the
  route" placeholder; stop rows drop `cursor: grab`.
- `Pool`: "Add stop" (`AddStop`), "Drop a pin", the "＋ Day" menu on rows, the "DRAG →" hint
  (row renders `trailing` empty), `cursor: grab`.
- `ChatPanel` is never rendered in ShareView.

Still working (read gestures): day select/expand/collapse, stop selection from rail rows, pool
cards and map markers, group filter chips in the pool, day+stop selection syncing the map
highlight.

### Read-only stop panel (`src/client/share/SharePointPanel.tsx`)

Rendered when `selectedPointId` is set. Same container as `DetailPanel`: 382px right `aside` on
desktop, fullscreen fixed overlay on mobile, same borders/shadows/spacing. Contents, in the
planner's visual order:

1. **Header** — stop name as static text (19px display font, no dashed underline), type icon +
   type label + group chip line beneath, close button (clears selection).
2. **PLACE** — the existing card, unchanged. `PlaceSection` is extracted from `DetailPanel.tsx`
   into a shared component that receives the point and a `PlaceInfo`-shaped query result; the
   editor passes the authenticated `usePlaceInfo` result, the share panel passes
   `useSharePlaceInfo`. "Open in Google Maps ↗" uses `googlePlaceId` when present, coords
   otherwise (same logic as today).
3. **DAY** — static line: "Day N — title" (or "Unassigned"), with an "off route" note when the
   stop is attached (`inRoute: false`). No menu, no checkbox.
4. **BOOKING** — status as a colored word using the planner's status colors, not the segmented
   control.
5. **LINKS** — the same link cards without remove buttons and without "+ Add link"; section
   omitted when the point has no links.

Omitted entirely: TYPE chips, GROUP chips, EST. COST, NOTES, Delete. Selecting a stop also selects
its day, as in the planner.

## Server design

### Share payload (`src/worker/routes/share.ts`)

Points additionally expose `googlePlaceId` (public Google identifier). Notes, est. cost/basis,
fuel and other private fields stay omitted; the privacy comment is updated. `shareModel.ts`
(`SharePoint`, `shareToTripDetail`) passes `googlePlaceId` through instead of defaulting it away.

### Public place-info endpoint

`GET /api/share/:token/points/:pid/place`, added inside `makePlaceInfoRouter` so both place
routes share the factory's `PlaceDetailsFetcher` override in tests. Auth: the token must resolve
to a trip and the point must belong to that trip — otherwise 404.

The cache-or-fetch-with-budget core of the existing route (src/worker/routes/points.ts) is
extracted into a helper — `resolvePlaceInfo(db, placeId, fetchPlace)` returning the `PlaceInfo`
JSON — used by both the authenticated route and the new share route. Identical semantics: D1
cache with 30-day TTL, 900-call/month hard cap (`status: "budget"` past it, which the card
renders as nothing), `status: "none"` for points without a place id, `status: "error"` on fetch
failure.

### Client API (`src/client/lib/api.ts`)

`getSharePlaceInfo(token, pointId)` and `useSharePlaceInfo(token, pointId, enabled)` mirroring
`usePlaceInfo` (query key `["share-place", pointId]`, `staleTime: Infinity`).

## Testing

Extend the existing suites:

- `test/worker/share.test.ts` — payload includes `googlePlaceId` and still excludes notes/cost;
  new endpoint: 404 on unknown token and on a point from another trip; ok / none / budget paths
  using the fetch-override pattern from `place-info.test.ts`.
- `test/client/share-view.test.tsx` — rewritten for the new shell: top bar with VIEW ONLY, day
  rail + pool render, clicking a stop row opens the read-only panel, no edit affordances in the
  DOM ("+ Add day", "Add stop", "Drop a pin", sparkles, textareas, "Delete stop").
- `test/client/day-rail.test.tsx`, `test/client/pool.test.tsx` — readOnly cases: edit buttons
  hidden, selection still fires.
- New `test/client/share-point-panel.test.tsx` — renders name/type/group/day/booking/links, omits
  notes/cost/delete, shows the PLACE card from a mocked share place-info response, "off route"
  note for attached stops.
- `test/client/detail-panel.test.tsx` keeps passing after the `PlaceSection` extraction.

Verification: `npm run typecheck` + `npm test` (worker + client vitest suites) green; optional live
end-to-end pass via the project `verify` skill (share a trip, open `/s/:token`, click stops on
desktop + mobile widths).

## Out of scope

- Exposing notes/est. cost to viewers (explicitly rejected).
- Any mutation path from the share page; the share payload stays read-only.
- MapLibre rendering swap (separate plan in docs/superpowers/plans/).
