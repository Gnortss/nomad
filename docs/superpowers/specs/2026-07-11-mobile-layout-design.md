# Mobile layout support — design

**Date:** 2026-07-11
**Goal:** The app works on phone-sized viewports (< 768px) with full editing parity. Desktop layout (≥ 768px) is untouched — when `isMobile` is false, every component renders exactly the JSX it renders today.

## Context

All styling is inline styles from `src/client/styles/ui.ts` + `tokens.css`; there are no CSS classes or media queries to hook into. At 390px wide the trip editor is unusable: the fixed 344px sidebar fills the screen, the map is invisible, the chat column is pushed offscreen, and the top-bar actions are cut off. The trip list, share view, and all dialogs (`dialogCard` has `maxWidth: 92vw`) already work at phone width.

## Mechanism

A `useIsMobile()` hook wrapping `window.matchMedia("(max-width: 767px)")`, reactive to changes (resize/rotation). Layout components branch on it in JSX. Rejected alternatives:

- **CSS media queries** — would require converting inline styles to classes, churning every desktop style. Against the no-desktop-changes constraint.
- **Separate mobile screens/routes** — duplicates data flow and editing logic.

## Trip editor (mobile)

The editor becomes map-first with a bottom sheet, the standard mobile-maps pattern:

### Compact top bar
- Keep: NOMAD mark, trip name (editable input, flexes to available width), AI-planning badge.
- Settings / Delete trip / Share trip collapse into a `⋮` overflow menu (same pattern as the existing `DayMenu`/`popover` style).
- The stats line (`distance · duration · fuel`) moves into the bottom sheet header.

### Map
Fills the viewport below the top bar. The selected-day badge and drop-pin banner keep their top-left dock (they fit at 390px). Drop-pin mode works via tap unchanged.

### Bottom sheet (new component, `src/client/components/BottomSheet.tsx`)
- Hosts the existing `DayRail` + `Pool` unchanged.
- Three detents: **peek** (drag handle + "DAYS · N" + stats, ~96px), **half** (~50% viewport), **full** (~90% viewport).
- Hand-rolled with pointer events + CSS transform (~100 lines). No new dependency.
- Drag handle has `touch-action: none`; sheet content scrolls internally when at half/full.

### DetailPanel and ChatPanel
- Both currently render as fixed-width side columns (`382px` / `344px`). On mobile each becomes a full-screen overlay (`position: fixed, inset: 0` below the top bar, `zIndex` above the sheet) with its existing close affordance.
- The chat's collapsed pill stays floating bottom-right, positioned above the sheet's peek height so it never overlaps the handle.

### Touch drag-and-drop
- Add dnd-kit `TouchSensor` with long-press activation (~250ms delay, small tolerance) alongside the existing `PointerSensor` (mouse keeps its 5px distance constraint), so scrolling the sheet doesn't start drags.
- Draggable stop rows get `touch-action: manipulation` (dnd-kit's recommendation for delay-activated touch sensors — allows scroll but suppresses double-tap zoom interfering with long-press).
- Dragging between days works inside the sheet exactly as in the desktop sidebar (same droppable structure).

## Global

- Replace viewport-height chains that break under mobile browser URL bars with `100dvh` where the layout is clipped (app root / editor shell). Desktop rendering is unaffected (`dvh` = `vh` there).
- Login screen: visual check at 390px; adjust only if broken.
- TripList, ShareView, all dialogs: already correct; no changes planned.

## Error handling

Nothing new — no new data flow, no new network calls. The sheet and overlays are pure presentation. `matchMedia` is available in all supported browsers; the hook defaults to desktop when unavailable (SSR-less Vite app, not a real concern).

## Testing / verification

- Existing unit tests must pass unchanged (`npm test`).
- Manual verification at 390×844 in Chrome:
  1. Trip list → open trip → map visible, sheet at half.
  2. Sheet drags between peek/half/full; list scrolls at full.
  3. Long-press-drag a stop to another day; order persists.
  4. Tap a stop → full-screen detail panel; edit a field; close.
  5. Chat pill → full-screen chat; send a message; close.
  6. Top-bar `⋮` menu → Share dialog opens and fits.
  7. Share view at 390px unchanged.
- Desktop regression check at ≥1280px: editor renders identically to `main` (no visual diff expected; `isMobile === false` takes today's code path).
