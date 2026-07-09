# Nomad "Basecamp" Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Basecamp" visual redesign from the design deck (claude.ai/design project `f43c7d0f-de12-4225-ae2c-58eda34957f3`, "Nomad Redesign Deck") across the whole client app — same bones, same semantics, new atmosphere.

**Architecture:** The app styles with inline React styles plus a small `tokens.css`. The redesign keeps that approach but centralizes the recurring recipes (buttons, elevation, section headers, chips, popovers, dialog frame) in a new shared style module `src/client/styles/ui.ts` so every recurring object is defined once and reused everywhere — the deck's core rule. Behavioral deltas (filter dims instead of hides, Enter picks first suggestion, unread chat dot, dashboard rename, days count in list API) get TDD; pure reskins are validated visually against the deck.

**Tech Stack:** React 19 + inline styles, tokens.css CSS vars, lucide-react icons, @vis.gl/react-google-maps, vitest + RTL.

**Design source:** extracted deck at scratchpad `deck.html` (saved from the design project). Slides: 00 Foundations, 01 Dashboard, 02 New trip, 03 Editor layout, 04 Days rail, 05 Pool, 06 AI chat, 06b Kickoff, 07 Stops, 08 Map layer, 09 Stop detail, 10 Dialogs, 11 Density proof.

## Global Constraints (from slide 00 — verbatim values)

**Palette (semantic roles kept):**
| token | value | role |
|---|---|---|
| basalt | `#16211F` | chrome, day badges, default marker — deepened from #1E2A2C, contour-textured |
| ink | `#1E2A2C` | body text on light |
| glacier | `#EDF1EE` | app background · panels `#F7F9F8` · cards `#FFFFFF` · pool tray `#EEF2F0` |
| slate | `#57676B` | secondary text, icons |
| border | `rgba(30,42,44,.12)` | hairlines (inputs/buttons use `.16`, section rules `.10`) |
| lupine | `#5B44C9` | primary · AI · selection · routes — tint `rgba(91,68,201,.08)` |
| sulfur | `#E39A0C` | warning · to book — text on light = `#8A5C00` |
| moss | `#2F7A55` | booked · success |
| brick (destructive) | `#B23A2E` | destructive actions (text `#8C2D23` on tint) |
| dark-surface text | `#ECF0F0` primary, `#B9C6C3` secondary, `#8FA3A0` mono-muted, `#6E8380` faint |

**Group hues — 6 fixed:** `#C64A3B` `#E39A0C` `#4C7A34` `#2C6E8A` `#5B44C9` `#57676B`. Ungrouped = basalt everywhere.

**Elevation:** e1 card `0 1px 2px rgba(22,33,31,.05)` · e2 float `0 1px 2px rgba(22,33,31,.06), 0 8px 22px rgba(22,33,31,.10)` · e3 modal `0 2px 6px rgba(22,33,31,.08), 0 18px 48px rgba(22,33,31,.18)` · dialog scrim `rgba(22,33,31,.5)`.

**Shape:** radii 11 cards · 9 buttons/inputs · 7 nested · pills (20) for chips · 14–16 modals. Selection = lupine left-rail 4px. Dark surfaces carry a faint contour-ring texture: `repeating-radial-gradient(circle at <pos>, transparent 0 Npx, rgba(236,240,240,.05) Npx (N+1.5)px)`.

**Type:** Overpass 800 display/panel titles (28/18px) · section headers Overpass 700, 11–12px, letter-spacing .13–.14em, slate, with hairline rule + mono count · Public Sans body 12.5–14px (600–700 emphasis) · Overpass Mono tabular for EVERY number/distance/date/cost, **set in caps** · inline-editable = dashed underline everywhere.

**Buttons (slide 00):** primary = lupine, 700, radius 9, `box-shadow: 0 1px 2px rgba(22,33,31,.2), inset 0 1px 0 rgba(255,255,255,.18)` · secondary = white, 600, border `rgba(30,42,44,.16)`, e1 · ghost = transparent, slate border `rgba(87,103,107,.3)` · quiet-destructive = borderless brick text · destructive-confirm = brick fill. Height 36 (34 compact).

**Inputs:** 36px, radius 9, border `rgba(30,42,44,.16)`, `inset 0 1px 2px rgba(22,33,31,.04)`; focus = `1.5px solid #5B44C9` + `0 0 0 3px rgba(91,68,201,.12)` ring.

**Status, one rule (slide 07):** idea = dashed hollow · to book = sulfur · booked = moss + check. Cards: trailing 9px dot. Markers: dashed white ring (idea) / sulfur corner dot (to book) / moss check badge (booked).

**Existing behavior must not change** except the deltas explicitly listed in tasks (filter dimming, Enter-picks-first, unread dot, rename, daysCount). All existing tests keep passing (updated only where a task says so). Copy that tests assert ("＋ Day", "DRAG →", "Search a place", dialog copy) stays unless a task says otherwise.

**Validation cadence:** after Tasks 4, 9, 12 and 16, run the app (`npm run dev`, port 5173 — see the project `verify` skill) and compare screenshots against the corresponding deck slides. Note: AdvancedMarkers may not mount in dev at HEAD (known pre-existing issue, see memory) — validate marker DOM/styles via tests + devtools, not only pixels.

---

### Task 1: Foundations — tokens.css + shared `ui.ts` + basalt deepening

**Files:**
- Modify: `src/client/styles/tokens.css`
- Create: `src/client/styles/ui.ts`
- Modify: `src/client/lib/tripModel.ts:3` (BASALT `#1E2A2C` → `#16211F`)
- Test: `test/client/tripModel.test.ts` (existing groupColor tests — update expected hex if asserted)

**Interfaces (Produces):** `ui.ts` exports used by all later tasks:
```ts
export const E1: string; export const E2: string; export const E3: string;
export const BORDER = "1px solid rgba(30,42,44,.12)";
export const FIELD_BORDER = "1px solid rgba(30,42,44,.16)";
export const RULE = "1px solid rgba(30,42,44,.10)";
export const SCRIM = "rgba(22,33,31,.5)";
export const GROUP_HUES: string[]; // 6 fixed
export const contour: (pos: string, step?: number) => React.CSSProperties; // dark-surface texture
export const btnPrimary: (h?: number) => React.CSSProperties;
export const btnSecondary: (h?: number) => React.CSSProperties;
export const btnGhostDark: (h?: number) => React.CSSProperties; // for dark top bars
export const btnQuietDestructive: React.CSSProperties;
export const btnDestructive: (h?: number) => React.CSSProperties;
export const field: (h?: number) => React.CSSProperties; // input/select base
export const sectionHead: React.CSSProperties; // ruled all-caps header
export const popover: React.CSSProperties;     // radius 10, e3, white
export const dialogCard: (w: number) => React.CSSProperties; // radius 16, e3+
export const dashedAction: React.CSSProperties; // "+ Add link", "Open in Maps ↗"
export const iconBtn: (size?: number) => React.CSSProperties; // tinted square icon button
```

- [ ] **Step 1:** Rewrite `tokens.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Overpass:wght@400;600;700;800&family=Overpass+Mono:wght@400;600&family=Public+Sans:wght@400;500;600;700&display=swap");

:root {
  --basalt: #16211f;        /* chrome, badges, default marker */
  --ink: #1e2a2c;           /* body text on light */
  --glacier: #edf1ee;       /* app background */
  --panel: #f7f9f8;
  --tray: #eef2f0;
  --slate: #57676b;
  --lupine: #5b44c9;
  --lupine-tint: rgba(91, 68, 201, 0.08);
  --sulfur: #e39a0c;
  --sulfur-text: #8a5c00;
  --moss: #2f7a55;
  --brick: #b23a2e;
  --font-body: "Public Sans", system-ui, sans-serif;
  --font-display: "Overpass", sans-serif;
  --font-mono: "Overpass Mono", monospace;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--glacier);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--lupine); text-decoration: none; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.ovp { font-family: var(--font-display); }
input, select, textarea, button { accent-color: var(--lupine); }
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: none;
  border-color: var(--lupine) !important;
  box-shadow: 0 0 0 3px rgba(91, 68, 201, 0.12) !important;
}
/* keep existing @keyframes ai-dot / ai-spin / ai-shimmer + .ai-dots/.ai-spinner/.ai-skeleton unchanged */
@keyframes marker-pulse { 0%,100% { transform: scale(1); opacity: .5; } 50% { transform: scale(1.6); opacity: 0; } }
```
(Keep the existing AI keyframe block verbatim; add `marker-pulse`.)

- [ ] **Step 2:** Create `src/client/styles/ui.ts` with the exact exports above; values:
  - `E1 = "0 1px 2px rgba(22,33,31,.05)"`, `E2 = "0 1px 2px rgba(22,33,31,.06), 0 8px 22px rgba(22,33,31,.10)"`, `E3 = "0 2px 6px rgba(22,33,31,.08), 0 18px 48px rgba(22,33,31,.18)"`.
  - `GROUP_HUES = ["#C64A3B","#E39A0C","#4C7A34","#2C6E8A","#5B44C9","#57676B"]`.
  - `contour(pos, step=46)` → `{ backgroundImage: \`repeating-radial-gradient(circle at ${pos}, transparent 0 ${step}px, rgba(236,240,240,.05) ${step}px ${step + 1.5}px)\` }`.
  - `btnPrimary(h=36)` → lupine bg, white, 700, radius 9, px 16, inset-highlight shadow, `fontFamily: "inherit"`, `cursor: "pointer"`, border none, fontSize 13.5.
  - `btnSecondary(h=36)` → white bg, ink, 600, FIELD_BORDER, radius 9, E1.
  - `btnGhostDark(h=31)` → transparent, `#ECF0F0`, `1px solid rgba(236,240,240,.28)`, radius 8, fontSize 12.
  - `btnQuietDestructive` → transparent, no border, brick, 600, fontSize 13.
  - `btnDestructive(h=34)` → brick bg, white, 700, radius 9.
  - `field(h=36)` → white bg, FIELD_BORDER, radius 9, px 12, fontSize 13, `boxShadow: "inset 0 1px 2px rgba(22,33,31,.04)"`, fontFamily inherit.
  - `sectionHead` → `{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, letterSpacing: ".13em", color: "var(--slate)", marginBottom: 8, borderBottom: RULE, paddingBottom: 5 }`.
  - `popover` → white, BORDER, radius 10, `boxShadow: E3`, overflow hidden.
  - `dialogCard(w)` → white, radius 16, `boxShadow: "0 2px 6px rgba(22,33,31,.1), 0 24px 60px rgba(22,33,31,.22)"`, padding "22px 24px", width w, maxWidth "92vw".
  - `dashedAction` → transparent, `1px dashed rgba(87,103,107,.4)`, radius 9, "6px 11px" padding, 12px 600 slate.
  - `iconBtn(s=28)` → `rgba(87,103,107,.10)` bg, radius 8, centered flex, border none, cursor pointer.

- [ ] **Step 3:** `tripModel.ts` BASALT → `#16211F`. Run `npx vitest run -c vitest.client.ts test/client/tripModel.test.ts` — fix any asserted hex.
- [ ] **Step 4:** `npm run typecheck` + `npm run test:client` → all pass. Commit `feat(redesign): foundations — palette, elevation, shared ui kit`.

### Task 2: Dialog frame — ConfirmDialog, ShareDialog, TripSettingsDialog

**Files:** Modify `src/client/components/ConfirmDialog.tsx`, `src/client/editor/ShareDialog.tsx`, `src/client/editor/TripSettingsDialog.tsx`. Tests: existing `confirm-dialog.test.tsx`, `share-dialog.test.tsx` keep passing.

**Spec (slides 00 & 10):**
- Overlay: `background: SCRIM`. Card: `dialogCard(420)` (ConfirmDialog), 460 (settings/share).
- ConfirmDialog: title Overpass 800 17px + X `iconBtn(28)` top-right (calls onCancel); body 13px slate; footer right-aligned `btnSecondary(34)` Cancel + `btnDestructive(34)` confirm.
- ShareDialog: title Overpass 800 18; subtitle "Anyone with the link can view — never edit." 12.5 slate; URL well = basalt bg + `contour("90% -60%", 26)`, radius 10, mono 12 `#B9C6C3`, with a **Copy** chip (`rgba(236,240,240,.14)` bg, `#ECF0F0`, radius 6, 10.5px 600) that calls `navigator.clipboard.writeText(url)`; footer: left `Rotate link` (white bg, brick text, `1px solid rgba(178,58,46,.35)`), right `btnPrimary` Done; helper "rotating invalidates the old link immediately" 11px `#8FA3A0`.
- TripSettingsDialog: labels 12px 700 slate; `field()` styles; EV range block wrapped in tinted conditional card `{ padding: 12, background: "rgba(91,68,201,.05)", border: "1px solid rgba(91,68,201,.2)", borderRadius: 10 }` with helper "conditional — only for EVs; fuel stat hides in the top bar" 11px `#8FA3A0`; Save button busy state renders spinner (`<span className="ai-spinner">` ring, 13px, `border: 2px solid rgba(255,255,255,.35); borderTopColor: #fff; borderRadius: 50%`) + label "Saving…"; helper under footer "saving recomputes every day's route" 11px `#8FA3A0` right-aligned.

- [ ] **Step 1:** Restyle the three dialogs per spec (keep all handlers/copy asserted by tests: title strings, "Cancel", confirm labels, "Rotate link", "Done", "Save"/"Saving…").
- [ ] **Step 2:** `npm run test:client` → confirm-dialog, share-dialog, trip-settings tests pass. Commit `feat(redesign): dialog frame — confirm, share, settings`.

### Task 3: Popovers & menus — DayMenu + dashboard card menu polish

**Files:** Modify `src/client/editor/DayMenu.tsx`, `src/client/screens/TripList.tsx` (TripCardMenu only). Test: `test/client/day-menu.test.tsx`, `test/client/trip-list.test.tsx`.

**Spec (slides 00/01/05):** popover = `popover` style, width 190 (DayMenu) / 160 (card menu); rows "8px 13px", 12.5px, 500 slate; current day row = 700 ink on `var(--lupine-tint)` bg with trailing lupine ✓; destructive row = brick 600 with `borderTop: RULE`. Card menu gains a **Rename** row (pencil, slate) above **Delete trip** (trash, brick).

- [ ] **Step 1 (TDD for rename):** Add to `test/client/trip-list.test.tsx`:
```tsx
it("renames a trip from the card menu", async () => {
  // open ⋯ menu, click "Rename", type new name in the inline input, press Enter
  // assert PATCH /api/trips/:id called with { name: "New name" } (msw or fetch mock per existing test patterns)
});
```
Run → FAIL (no Rename item).
- [ ] **Step 2:** Implement: menu item "Rename" sets `renaming` state; card title becomes an input (dashed underline style like TopBar's TripName) committing via the existing `usePatchTrip` hook on blur/Enter. Menu item order: Rename, Delete trip.
- [ ] **Step 3:** Restyle both menus per spec. Run trip-list + day-menu tests → PASS. Commit `feat(redesign): popover kit + dashboard rename`.

### Task 4: Dashboard — trips list API daysCount, TripThumb night-map, TripList reskin, empty-state hero

**Files:**
- Modify: `src/worker/routes/trips.ts:44-67` (add `daysCount`), `src/client/lib/types.ts:25` (`TripListItem` gains `daysCount: number`)
- Modify: `src/client/map/TripThumb.tsx`, `src/client/screens/TripList.tsx`
- Test: `test/worker/…` trips list test (follow existing worker test layout under `test/worker`), `test/client/trip-thumb.test.tsx`, `test/client/trip-list.test.tsx`

**Spec (slide 01):**
- Top bar: 56px basalt + `contour("85% -60%")`; lupine 11px logo square (radius 3) + "NOMAD" Overpass 800 `.14em` 16px; `btnPrimary(34)` "+ New trip"; `btnGhostDark(34)` "Sign out".
- Grid: `repeat(auto-fill, minmax(260px, 1fr))`, gap 18, padding 30 26.
- Card: white, `1px solid rgba(30,42,44,.10)`, radius 12, padding 12, E1; hover (CSS `:hover` via a small class in tokens.css or onMouseEnter state): lupine border `rgba(91,68,201,.45)`, `translateY(-2px)`, `0 2px 6px rgba(22,33,31,.08), 0 16px 40px rgba(22,33,31,.16)`.
- Thumbnail: basalt rect radius 9; contour rings = 2–3 concentric `<circle>` strokes `rgba(236,240,240,.05–.07)` centered off-canvas (seed position from trip id hash so cards differ); route paths lupine 2.5px round; stop dots r=3–4 `#ECF0F0`; **last stop dot sulfur `#E39A0C`**; meta chip bottom-right mono 9px `#8FA3A0`: `${daysCount} DAYS · ${points.length} STOPS` (caps).
- Title: Overpass 800 16 marginTop 11. Date: mono 12 slate, caps (`12 JUL 2026` style — format existing startDate; when null: `NO DATES YET` in `#8FA3A0`).
- ⋯ overflow: 28×28, `rgba(22,33,31,.55)` bg, white glyph, radius 8, top-right **over the thumbnail** (top 18 right 18).
- Empty state (zero trips): dark hero panel (flex-fill area): basalt bg + contour texture; dashed lupine dream-route SVG (`stroke-dasharray="1 12"`, lupine + sulfur end dots); centered: "Where to first?" Overpass 800 26 `#ECF0F0`; sub 14px `#B9C6C3` "Describe a trip in one sentence — the AI planner drafts the days, stops and routes with you."; `btnPrimary(38)` "+ Plan your first trip" with glow `0 6px 20px rgba(91,68,201,.4)` → opens NewTripModal. No dummy cards.

- [ ] **Step 1 (TDD, worker):** trips list test asserts each item has `daysCount` = number of days rows. Run → FAIL.
- [ ] **Step 2:** In `trips.ts` GET /api/trips add a third parallel query `db.select({ tripId: days.tripId, id: days.id }).from(days).where(inArray(days.tripId, tripIds))` and map `daysCount: dayRows.filter((d) => d.tripId === t.id).length`. Update `TripListItem`. Run → PASS.
- [ ] **Step 3 (TDD, thumb):** extend `trip-thumb.test.tsx`: last dot has `fill="#E39A0C"`; meta chip text renders when `meta` prop passed. Run → FAIL. Implement TripThumb: new optional prop `meta?: string`; render rings, sulfur last dot, meta `<text>` or absolutely-positioned span (keep `projectAll` untouched). Run → PASS.
- [ ] **Step 4:** Reskin TripList per spec incl. empty-state hero (render when `data && data.trips.length === 0`). Keep Link-wraps-card behavior. Run trip-list tests → PASS.
- [ ] **Step 5:** `npm run test` (worker + client) → PASS. Commit `feat(redesign): dashboard — night-map cards, daysCount, empty hero`.
- [ ] **Step 6 (VALIDATE):** dev server → screenshot dashboard vs slide 01; fix drift.

### Task 5: New trip modal (slide 02)

**Files:** Modify `src/client/components/NewTripModal.tsx`. Test: `test/client/new-trip-modal.test.tsx` keeps passing.

**Spec:** `dialogCard(560)`; header row: 34px sparkle chip (`rgba(91,68,201,.1)` bg radius 10, lupine `Sparkles` 17px) + "New trip" Overpass 800 21 + X `iconBtn(30)`; name input = `field(40)` but `background: var(--panel)`, placeholder unchanged; description textarea = hero: minHeight 128, autoFocus, focus ring per foundations, fontSize 13.5 lh 1.55; hint below (12px slate): "Where to, roughly when and how long, the vibe, your vehicle and constraints — anything helps."; primary CTA `btnPrimary(44)` full-width "Create trip"; busy: fields `disabled` with `background: #F1F4F2`, indeterminate bar above CTA (3px track `rgba(91,68,201,.15)`, 45% lupine bar `className="ai-skeleton"`), CTA shows white ring spinner + "Creating your trip…", close button `opacity: .4`; error: tinted banner `{ background: "rgba(178,58,46,.07)", border: "1px solid rgba(178,58,46,.25)", borderRadius: 9, color: "#8C2D23", fontSize: 12.5 }` with `TriangleAlert` 13px brick — copy unchanged; skip link unchanged (12.5 slate underline, `#B9C6C3` while busy).

- [ ] **Step 1:** Implement. Keep handler logic and copy asserted by tests.
- [ ] **Step 2:** `npx vitest run -c vitest.client.ts test/client/new-trip-modal.test.tsx` → PASS. Commit `feat(redesign): new trip modal — AI-first hero field`.

### Task 6: Login (slide 10)

**Files:** Modify `src/client/screens/Login.tsx`.

**Spec:** full-viewport basalt; two contour layers (`contour("82% -12%", 48)` + `contour("6% 112%", 60)` — merge into one backgroundImage with comma); dashed lupine route SVG with lupine + sulfur dots; content block: logo row (12px lupine square radius 4 + NOMAD Overpass 800 `.14em` 20 `#ECF0F0`), headline Overpass 800 36/1.12 `#ECF0F0` "Plan the drive.<br>Not just the destination.", sub 14 `#B9C6C3` "Multi-day road trips on a map — days, stops and routes, planned with an AI copilot."; CTA: white `#ECF0F0` bg, ink text, 700, h 46 radius 11, `0 8px 26px rgba(0,0,0,.35)`, leading 20px round "G" badge (white circle, `#4285F4` G, font Roboto fallback sans); footer mono 10.5 `#6E8380` "TERMS · PRIVACY".

- [ ] **Step 1:** Implement (keep `signInWithGoogle` handler + "Continue with Google" text).
- [ ] **Step 2:** `npm run test:client` routes test still passes. Commit `feat(redesign): atmospheric login`.

### Task 7: Editor top bar + AI-planning pill (slides 03/06b)

**Files:** Modify `src/client/editor/TopBar.tsx`. Test: `test/client/top-bar.test.tsx`.

**Spec:** height 50, basalt + `contour("90% -80%")`; 10px lupine square radius 3; NOMAD link Overpass 800 `.14em` 14; `›` opacity .35; TripName input: 600 13.5, dashed bottom `1.5px dashed rgba(236,240,240,.4)`; stats: mono 11.5 `#8FA3A0`, **uppercase** (wrap in `text-transform: uppercase`); right: `btnGhostDark(31)` Settings, `btnGhostDark(31)` Delete trip, `btnPrimary(31)` Share trip (fontSize 12, px 13). When `aiBusy` (from `useEditorStore()`): pill after trip name `{ display:"inline-flex", gap:6, padding:"3px 10px", borderRadius:14, background:"rgba(91,68,201,.28)", border:"1px solid rgba(122,99,232,.5)", fontSize:10.5, fontWeight:700, color:"#CFC5F5" }` with 10px `Sparkles` — label "AI planning…"; Settings + Share get `opacity: .5` while aiBusy (still enabled — deck: only dimmed).

- [ ] **Step 1:** Implement; TopBar needs `aiBusy` → call `useEditorStore()` inside TopBar (it renders under the provider).
- [ ] **Step 2:** top-bar tests pass (update rendering context if the store provider is now required — wrap with `EditorStoreProvider` in the test if not already). Commit `feat(redesign): editor top bar + AI planning pill`.

### Task 8: Days rail (slide 04)

**Files:** Modify `src/client/editor/DayRail.tsx`. Test: `test/client/day-rail.test.tsx`.

**Spec:**
- Header: "DAYS" Overpass 700 11 `.14em` slate + mono count `· N` (10px, weight 400) with the count of days; right `btnSecondary(24)`-style "+ Add day" (fontSize 11, radius 7).
- Day badge: 36×32 (list rows 31×28 keep current size — deck editor mock uses 31×28 at 306px rail; **use 31×28**), radius 8, Overpass 800 13; default basalt bg white text; **selected: lupine bg**; long-day: white bg, ink text, `2px solid var(--sulfur)`.
- Day card (selected): white bg, `1px solid rgba(91,68,201,.4)`, **borderLeft 4px lupine**, radius 10, shadow `0 1px 2px rgba(22,33,31,.06), 0 8px 22px rgba(22,33,31,.08)`.
- Title Overpass 700 12 (`className="ovp"`); stats mono 9.5 slate **uppercase**; "No route yet" → `NO ROUTE YET` mono `#8FA3A0`.
- Long-day pill: `{ gap:3, padding:"1px 6px", background:"rgba(227,154,12,.16)", color:"#8A5C00", borderRadius:20, fontWeight:700, fontSize:9 }` + 8px TriangleAlert — keep "Long day" copy.
- Sparkle refine button: lupine when day selected, slate otherwise.
- Routed stop rows: unchanged structure; icon color slate; selected-point row gets `background: var(--lupine-tint)` + lupine icon/name (needs `selectedPointId` from store — row is `p.id === selectedPointId`); END tag unchanged.
- ALSO THIS DAY: label above a `borderTop: 1px dashed rgba(30,42,44,.10)` rule, 8.5px `.08em` `#8FA3A0`; group cluster headers with 8px radius-2.5 color square + 11px 700 group-colored name (per deck slide 04: `color: #C64A3B` style — use the group hue for the name text).
- Empty state: `{ padding:"14px 12px", border:"1.5px dashed rgba(87,103,107,.35)", borderRadius:11, fontSize:12.5, color:"var(--slate)", textAlign:"center" }` — "No days yet." + second line 12px `#8FA3A0` "Add a day, then drag stops onto it."
- AI skeleton block: keep, but status line becomes lupine 600 with `.ai-dots` prefix (deck 06b): "The AI is planning — days appear here as they're written."
- Drop highlight: `outline: 2px solid var(--lupine)` + `rgba(91,68,201,.07)` bg (change from .08); insertion line stays lupine (upgrade to 3px bar + 9px dot at left end per slide 04: in `DayStopRow`, replace the `boxShadow` hairline with an absolutely-positioned bar `{ position:"absolute", left:-4, right:0, top:-2, height:3, borderRadius:2, background:"var(--lupine)" }` plus dot `{ left:-9, top:-5, width:9, height:9, borderRadius:"50%" }` — row gets `position:"relative"`).

- [ ] **Step 1:** Implement. Keep all aria labels/copy tests assert ("Refine day N with AI", "Toggle stops", "+ Add day", "Long day", END).
- [ ] **Step 2:** `npx vitest run -c vitest.client.ts test/client/day-rail.test.tsx` → PASS (adjust test only if it asserts style values). Commit `feat(redesign): days rail`.

### Task 9: Pool tray + search + filters (slide 05) and drag overlay (slide 07)

**Files:** Modify `src/client/editor/Pool.tsx`, `src/client/editor/AddStop.tsx`, `src/client/screens/TripEditor.tsx:125-127` (DragOverlay variant). Test: `test/client/pool.test.tsx`, `test/client/add-stop.test.tsx`.

**Spec:**
- Tray: `background: var(--tray)`, `borderTop: BORDER`, `boxShadow: "inset 0 6px 12px -8px rgba(22,33,31,.12)"`; header "UNASSIGNED" + mono count `· N` (pool length before filtering).
- Buttons row: both `btnSecondary(29)`-ish (fontSize 11, radius 8, icon 11px): "Search a place" with `Search` icon (replace 🔍 emoji — **update add-stop test if it queries by the emoji text**), "Drop a pin" with `MapPin`; armed pin state = `btnPrimary` colors.
- Search input expanded: `field(34)` with focus ring; suggestions panel: radius 11, E3; **first suggestion row highlighted** (`background: var(--lupine-tint)`, lupine `MapPin` 13px, trailing mono `↵` 9px `#8FA3A0`); other rows slate pin; **typed match bolded**: wrap the case-insensitive prefix/first occurrence of the query inside the label in `<b>`; **Enter picks the first suggestion**.
- Filter chips: base `{ display:"inline-flex", gap:6, padding:"4px 11px", borderRadius:20, fontSize:11.5 }` with 8px radius-2.5 hue square + hue-colored 600 name; **active**: `1.5px solid <hue>` border, `rgba(<hue>,.10)` bg (use `hexToRgba` helper in ui.ts: `export function tint(hex: string, a: number): string`), 700, trailing 10px `X` icon; inactive: transparent border.
- **Filtering dims, not hides:** filtered-out cards render with `opacity: .45` (still draggable/clickable). Footer hint (mono 9.5 `#8FA3A0` `.06em`): `FILTERED BY "<NAME>" — OTHERS DIM, NOT HIDDEN` — optional; include the dimming, include the hint.
- StopCard: white bg, `1px solid rgba(30,42,44,.10)`, radius 10, E1, padding "8px 10px"; **tinted icon chip**: 26×26 radius 7, `tint(groupHue, .14)` bg (basalt `rgba(22,33,31,.08)` when ungrouped), icon 14px in the group hue (basalt when ungrouped); name 13/600; group line: 7px radius-2 square + 10.5 slate name; trailing status dot **added** (9px, same rule as day rows — pool cards on slide 07 carry the dot) unless `trailing` overrides; PoolRow keeps the ＋ Day trigger as trailing (deck shows ＋ Day on pool rows; status dot only on non-interactive contexts — **keep ＋ Day, skip dot in PoolRow, show dot in DragOverlay variant? No** — slide 07 pool card shows the dot *and* slide 05 shows ＋ Day; resolve: PoolRow trailing = ＋ Day button; plain StopCard (DragOverlay) trailing = `DRAG →` tag).
- Drag overlay (slides 05/07): in TripEditor's `<DragOverlay>`, wrap StopCard with `{ transform: "rotate(-2deg)", border-color via a new `overlay` prop: lupine border `1px solid rgba(91,68,201,.5)`, shadow `0 2px 6px rgba(22,33,31,.1), 0 22px 52px rgba(22,33,31,.28)` }`; `DRAG →` tag becomes lupine on `rgba(91,68,201,.1)` chip (Overpass 9px 700 `.08em`).

- [ ] **Step 1 (TDD):** pool test: filtering renders non-members with reduced opacity instead of removing them (`expect(screen.getByText("Other stop")).toBeInTheDocument()` + opacity assertion via style). add-stop test: pressing Enter in the search input picks the first suggestion (asserts `create` called). Run → FAIL.
- [ ] **Step 2:** Implement both behaviors + full reskin. Run pool + add-stop tests → PASS.
- [ ] **Step 3:** Full client suite → PASS. Commit `feat(redesign): pool tray, search, tinted filters, drag overlay`.
- [ ] **Step 4 (VALIDATE):** dev server → compare rail+pool against slides 04/05.

### Task 10: Map markers + routes + selected-stop flag (slide 08)

**Files:** Modify `src/client/editor/markers.ts`, `src/client/map/MapLayer.tsx`. Test: `test/client/markers.test.ts` (rewrite), `test/client/map-layer.test.tsx`.

**Spec — anchored marker:** squircle + 9px tail, white casing, real shadow.
- Sizes: default 32px (radius 10, icon 16), focused/selected 38px (radius 11, icon 19) + lupine halo `0 0 0 3px rgba(91,68,201,.5)`, dimmed 26px (radius 8, icon 13) `opacity .32` + `grayscale(.6)` + **no tail shadow emphasis**.
- Fill = group hue (basalt ungrouped). Casing `2.5px solid #fff` (2px when dimmed); shadow `0 3px 8px rgba(22,33,31,.35)`.
- Tail: 9×9 square, same fill, `borderRight/borderBottom 2px solid #fff`, `rotate(45deg)`, centered at bottom `-8px` (marker anchors at its coordinate — AdvancedMarker anchors bottom-center by default; wrap so the tail tip is the anchor point).
- Status: idea → casing `dashed`; to_book → 13px sulfur corner dot top-right (`border: 2px solid #fff`); booked → 15px moss circle top-right with 8px white check.
- Selected stop (`selectedPointId`): 38px + halo + **name flag** under the marker: `{ padding:"4px 9px", background:"rgba(22,33,31,.88)", color:"#ECF0F0", borderRadius:7, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }` + trailing mono 9px status word (`TO BOOK` `#F0BF6A` / `BOOKED` `#7FD3A8` / `IDEA` `#B9C6C3`).
- Routes: selected day = **two polylines**: white casing strokeWeight 9 opacity .95 under lupine strokeWeight 5; unselected = lupine 3.5, opacity `selectedDayId ? 0.22 : 0.62`.
- Day badge overlay (top-left of map, when a day is selected): `{ position:"absolute", left:14, top:14, display:"flex", gap:8, padding:"7px 12px", background:"rgba(255,255,255,.95)", border:BORDER, borderRadius:10, boxShadow:"0 2px 8px rgba(22,33,31,.12)" }` — 20×18 lupine day-number chip (Overpass 800 11) + mono 11 uppercase `TITLE · KM · H MM`. Render inside the map container in `TripEditor.tsx` or `MapLayer` sibling — put it in `TripEditor.tsx` next to the drop-pin banner, computed from `selectedDayId` + `daysWithStats`.

**New `markerStyle` contract:**
```ts
export function markerStyle(input: { groupColor: string; bookingStatus: string; focused: boolean; dimmed: boolean; selected?: boolean }): {
  fill: string; size: number; radius: number; iconSize: number;
  casingWidth: number; casingStyle: "solid" | "dashed";
  opacity: number; grayscale: number; halo: boolean;
  badge: "none" | "toBook" | "booked";
}
```
Rules: base size 32/r10/icon16/casing2.5; focused-or-selected → 38/r11/icon19, halo when `selected` (and when `focused`? deck: focused = 38 + halo on *selected stop* only; day-focused = 34 in editor mock — simplify: focused day → 34/r10/icon17; selected stop → 38/r11/icon19 + halo); dimmed → 26/r8/icon13, opacity .32, grayscale .6, casing 2; idea → casingStyle dashed; to_book → badge "toBook"; booked → badge "booked".

- [ ] **Step 1 (TDD):** Rewrite `markers.test.ts` against the new contract (idea dashed, booked badge, dimmed 26/.32/.6, focused 34, selected 38+halo, default 32). Run → FAIL.
- [ ] **Step 2:** Implement `markerStyle`. Run → PASS.
- [ ] **Step 3:** Rebuild `MapLayer` marker DOM (squircle + tail + badge + flag) and dual-polyline routes; add day badge overlay. `map-layer.test.tsx` updated only where it asserts old DOM.
- [ ] **Step 4:** Full client suite → PASS. Commit `feat(redesign): anchored map markers, cased routes, day badge`.

### Task 11: Map overlay states (slides 03/06b) — empty, AI planning, drop-pin, route banners

**Files:** Modify `src/client/screens/TripEditor.tsx:98-120`, `src/client/editor/states.tsx`. Test: `test/client/states.test.tsx`, `test/client/trip-editor.test.tsx`.

**Spec:**
- EmptyTrip card: white `rgba(255,255,255,.95)`, BORDER, radius 11, `0 8px 28px rgba(22,33,31,.16)`, padding "12px 16px", centered; title Overpass 800 12.5→14 "No stops yet."; body 10.5→12 slate (keep current copy).
- AI planning card (replaces the white busy card): dark basalt card + `contour("85% -30%", 34)`, radius 14, `0 2px 6px rgba(22,33,31,.2), 0 28px 70px rgba(22,33,31,.45)`, width 330, padding "18px 20px"; spinner ring 18px (`border: 2.5px solid rgba(236,240,240,.2); borderTopColor: #8B77E0`) + "The AI is planning your trip…" Overpass 800 15 `#ECF0F0`; body 12 `#B9C6C3` (keep copy); progress row: 3px track `rgba(236,240,240,.14)` with `#8B77E0` bar `width: 26%` + mono 10 `#8FA3A0` `DAY {days.length || 1} / ?` → **omit the counter and render an indeterminate `.ai-skeleton` bar** (total days unknown mid-stream — deck's counter needs data we don't have; the bar + copy carry the state).
- Drop-pin banner: dark: `{ background:"rgba(22,33,31,.92)", color:"#ECF0F0", borderRadius:9, boxShadow:"0 4px 14px rgba(22,33,31,.3)", fontSize:10.5→12, fontWeight:600 }`, 11px white `MapPin`, Cancel chip `rgba(236,240,240,.16)` radius 5 9.5px 700 (keep copy "Click the map to place a stop" / "Cancel").
- states.tsx banners: RouteComputing → white card `{ display:"flex", gap:8, padding:"6px 10px", background:"#fff", border:BORDER, borderRadius:9 }` mono 10 slate uppercase `MEASURING THE DRIVE…` with 11px spinner; RouteFailed → brick tint `{ background:"rgba(178,58,46,.06)", border:"1px solid rgba(178,58,46,.25)", color:"#8C2D23" }` + white Retry chip (brick border/text 700); RouteStale → sulfur tint `{ background:"rgba(227,154,12,.09)", border:"1px solid rgba(227,154,12,.35)", color:"#8A5C00" }` + white Refresh chip. Keep copy + onRetry/onRefresh handlers.

- [ ] **Step 1:** Implement all four. Keep role="status" on AI card.
- [ ] **Step 2:** states + trip-editor tests → PASS. Commit `feat(redesign): map overlay states`.

### Task 12: Stop detail panel (slide 09)

**Files:** Modify `src/client/editor/DetailPanel.tsx`. Test: `test/client/detail-panel.test.tsx`.

**Spec:**
- Panel: width 382, `background: var(--panel)`, `borderLeft: BORDER`, keep shadow.
- Header: name input Overpass 800 19 (`className="ovp"`), dashed `1.5px dashed rgba(87,103,107,.45)`; type row 13 slate with 14px icon; **group chip in header** when `p.groupId`: `{ marginLeft:8, padding:"2px 8px", borderRadius:14, background:tint(hue,.1), border:\`1px solid ${tint(hue,.3)}\`, fontSize:10.5, fontWeight:700, color:hue }` + 7px square; X = `iconBtn(30)`.
- Section headers: use `sectionHead` from ui.ts (ruled). 16px between sections (already `gap: 16`).
- PLACE card: white, `rgba(30,42,44,.10)` border, radius 10, padding "11px 13px", `0 1px 2px rgba(22,33,31,.04)`; rating 700; address slate; Website/phone lupine 600 12.5; opening hours summary slate 600 12 with chevron; hours list mono 10.5 slate 2-col grid uppercase; Maps link = `dashedAction` "Open in Google Maps ↗".
- DAY: DayMenu trigger styled `field(34)`-like (white, FIELD_BORDER, radius 9, 12.5 600, chevron-down); "On route" checkbox: native input with accent-color (already global) 15px + 12.5 600 label.
- TYPE chips: `{ gap:5, padding:"4px 10px", borderRadius:20, fontSize:11 }` white/FIELD_BORDER 600, active = lupine fill + white 700 (as today, tweak radius/padding).
- GROUP chips: **active = own hue**: `border: 1px solid <hue>`, `background: tint(hue,.1)`, `color: hue`, 700 (No group active = lupine as today? deck shows "No group" plain white when inactive — make No-group-active use basalt fill? Slide 09 shows Dolomites active with tarn tint. **Rule: active group chip uses its hue; active "No group" uses lupine fill as today.**); each chip keeps 8px radius-2.5 hue square; "+ New group" = dashed pill.
- New-group form: wrap in white card `{ marginTop:10, padding:12, background:"#fff", border:"1px solid rgba(91,68,201,.3)", borderRadius:10 }`; swatches 24×24 radius 7, selected ring `boxShadow: "0 0 0 2px #fff, 0 0 0 4px #16211F"`; Create = basalt 700 white radius 8 h30; Cancel = `rgba(87,103,107,.10)` radius 8.
- BOOKING segmented: container FIELD_BORDER radius 9 white; segments 12.5 600 slate, `borderLeft: RULE` between; active = fill with status color (slate/sulfur/moss) white 700; **booked active shows 10px white check icon**.
- EST. COST: mono input `field(34)` width 100; basis select `field(34)`.
- NOTES textarea: white, `rgba(30,42,44,.12)` border, radius 9, 12.5 lh 1.55.
- LINKS: rows white FIELD-bordered radius 9; label lupine 500; remove X 18px `iconBtn`; "+ Add link" = `dashedAction`.
- Delete stop: `btnQuietDestructive` behind `borderTop: RULE` (keep window.confirm).

- [ ] **Step 1:** Implement. Preserve every handler, aria-label, and copy the tests assert.
- [ ] **Step 2:** detail-panel tests → PASS. Commit `feat(redesign): stop detail panel`.
- [ ] **Step 3 (VALIDATE):** dev server → compare vs slide 09.

### Task 13: AI chat panel (slide 06) + unread dot

**Files:** Modify `src/client/editor/ChatPanel.tsx`. Test: `test/client/chat-panel.test.tsx`.

**Spec:**
- Header: 28px sparkle chip (like NewTripModal, `Sparkles` 14 lupine on `rgba(91,68,201,.1)` radius 9) + "AI planner" Overpass 800 14.5 (`className="ovp"`) + clear/close as `iconBtn(28)` with 13px icons.
- Bubbles: user = lupine white, `borderRadius: "12px 12px 4px 12px"`; assistant = `#F1F4F2` ink, `borderRadius: "12px 12px 12px 4px"`; both fontSize 13 lh 1.5 padding "9px 12px" maxWidth 88/90%.
- Tool lines: mono 11 italic `#8FA3A0` `· {label}` (color change from slate).
- Working pill: keep, fontWeight 600, `borderRadius: 12`.
- Error line: replace bare red text with tinted banner above composer: busy-variant (message contains "already working") = sulfur tint `{ background:"rgba(227,154,12,.09)", border:"1px solid rgba(227,154,12,.35)", color:"#8A5C00" }`; other errors = brick tint (`rgba(178,58,46,.07)` / `.25` / `#8C2D23`); 13px `TriangleAlert` leading; radius 9, fontSize 12.5.
- Suggested replies: `{ padding:"5px 12px", borderRadius:16, border:"1px solid rgba(91,68,201,.35)", background:"rgba(91,68,201,.06)", color:"var(--lupine)", fontSize:12, fontWeight:600 }` (minor tweaks).
- Composer: textarea `field()`-based radius 10; Send `btnPrimary` radius 10.
- Collapsed pill: `Sparkles` 15 instead of MessageSquareText; `{ padding:"11px 16px", borderRadius:24, fontWeight:700, fontSize:13.5, boxShadow:"0 8px 26px rgba(91,68,201,.45), inset 0 1px 0 rgba(255,255,255,.2)" }`; **unread dot**: 8px sulfur circle `boxShadow: "0 0 0 2px rgba(255,255,255,.6)"` shown when the assistant finished a turn while collapsed; cleared on open.
- Header icon swap: `MessageSquareText` → `Sparkles` in expanded header chip too.

- [ ] **Step 1 (TDD unread):** chat-panel test: complete a streamed turn while `chatOpen === false` → collapsed button contains the unread dot (query by `data-testid="chat-unread"` or aria-label "Open AI chat — new reply"); opening clears it. Run → FAIL.
- [ ] **Step 2:** Implement: `const [unread, setUnread] = useState(false)`; in `runTurn`'s finally: `if (!chatOpenRef.current) setUnread(true)` (track chatOpen in a ref updated by effect); opening (`chatOpen` true effect) clears. Run → PASS.
- [ ] **Step 3:** Full reskin. chat-panel tests → PASS. Commit `feat(redesign): chat panel + unread indicator`.

### Task 14: Public share view (slide 10)

**Files:** Modify `src/client/share/ShareView.tsx`. Test: `test/client/share-view.test.tsx`.

**Spec:**
- Header: basalt + `contour("90% -60%", 36)`, `#ECF0F0`; row: 8px lupine square + NOMAD Overpass 800 `.12em` 11 + right "VIEW ONLY" pill `{ fontSize:9.5, fontWeight:700, padding:"3px 8px", borderRadius:12, background:"rgba(236,240,240,.14)", color:"#B9C6C3" }`; trip name Overpass 800 18; meta mono 10.5 `#8FA3A0` uppercase `12 JUL 2026 · 9 DAYS · 1 240 KM` (compose from existing fields; keep " · " separators).
- Map 40vh unchanged.
- Body `background: var(--glacier)`, padding "14px 16px"; day header row: 24×22 basalt badge (Overpass 800 11 radius 7) + title Overpass 800 13.5 + mono 9.5 slate stats uppercase; stops indented 33px: mono 10 `#8FA3A0` index `1.` + name 12 500 + status as **mono words color-coded**: `IDEA` `#8FA3A0`, `TO BOOK` `#B07708`, `BOOKED` `#2F7A55` (9px, uppercase — replace `STATUS_TAG` values with these); END tag pill as in day rail; ALSO THIS DAY section: rule + slate rows with same status words.

- [ ] **Step 1:** Implement (update share-view test if it asserts "Booked"/"To book" casing — change assertions to the mono-caps words).
- [ ] **Step 2:** share-view tests → PASS. Commit `feat(redesign): public share view`.

### Task 15: Kickoff polish (slide 06b) — pool empty hint + measuring state

**Files:** Modify `src/client/editor/Pool.tsx` (empty pool while aiBusy), `src/client/editor/DayRail.tsx` (routing spinner row). Test: `test/client/pool.test.tsx`.

**Spec:** while `aiBusy` and pool empty: "Nothing here yet — the plan goes straight into days." (11px `#8FA3A0`) instead of an empty list. Day rows whose route is being computed: deck shows `MEASURING THE DRIVE…` + spinner — client has no per-day computing signal today (`distText` is only null/value), so scope to: when `aiBusy` and a day has stops but no route yet, show mono `MEASURING THE DRIVE…` with an 12px spinner instead of `NO ROUTE YET`.

- [ ] **Step 1:** Implement both.
- [ ] **Step 2:** pool + day-rail tests → PASS. Commit `feat(redesign): AI kickoff states`.

### Task 16: Final validation sweep

- [ ] **Step 1:** `npm run typecheck` + `npm run test` (worker + client) → all green.
- [ ] **Step 2:** Dev server visual pass, slide by slide: 01 dashboard (+ empty state via a fresh account or temporarily filtering), 02 modal (default/busy/error), 03/11 full editor composition, 04 rail, 05 pool, 06 chat, 08 map, 09 detail, 10 dialogs/login/share. Screenshot each; fix drift against deck values.
- [ ] **Step 3:** Update memory (redesign landed); commit any fixes; summarize deviations from the deck (e.g., omitted DAY x/y progress counter) for the user.

## Explicitly out of scope
- Slide 06b's exact `DAY 2 / 9` planning progress counter (total unknown mid-stream; indeterminate bar + copy instead).
- Wiring RouteFailed/RouteStale banners to new server signals (restyle only — they're currently unused exports).
- Marker "pop-in pulse" animation on AI-added markers (AdvancedMarker mount animation; markers currently don't mount in dev at HEAD — pre-existing bug, not worth building against until fixed).
- Google font weight additions (Overpass 900 / Mono 700 appear only in deck hero art).
- MapLibre swap (separate existing plan `2026-07-08-maplibre-rendering-swap.md`).
