# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app works on phone-sized viewports (< 768px) with full editing parity, per `docs/superpowers/specs/2026-07-11-mobile-layout-design.md`.

**Architecture:** A reactive `useIsMobile()` hook (matchMedia, breakpoint 767px) drives conditional JSX in the layout components. Desktop (≥ 768px) renders exactly the JSX it renders today. The mobile editor is map-first: full-screen map, DayRail + Pool inside a new hand-rolled `BottomSheet` (peek/half/full detents), compact TopBar with a `⋮` overflow menu, DetailPanel and ChatPanel as full-screen overlays, dnd-kit `MouseSensor` + `TouchSensor` for touch drag.

**Tech Stack:** React 18 + Vite, inline styles (no CSS classes — follow this convention), @dnd-kit/core, vitest + @testing-library/react (jsdom, `npm run test:client`). No new dependencies.

## Global Constraints

- Desktop (≥ 768px) must render **exactly today's JSX** — every mobile change is behind `isMobile` except: dnd sensors (`PointerSensor` → `MouseSensor`+`TouchSensor`, mouse behavior identical), `touchAction: "manipulation"` on draggable rows (no visual change), and `#root { height: 100dvh }` (equals 100% on desktop).
- Breakpoint: `(max-width: 767px)`.
- No new npm dependencies.
- All styling inline (project convention); reuse `src/client/styles/ui.ts` helpers (`popover`, `btnGhostDark`, `iconBtn`, `contour`).
- Tests: client suite is jsdom via `npm run test:client`; full suite `npm test`.
- Known pre-existing issue (do NOT treat as a regression during verification): map AdvancedMarkers silently don't mount in dev at HEAD.

---

### Task 1: `useIsMobile` hook

**Files:**
- Create: `src/client/lib/useIsMobile.ts`
- Test: `test/client/useIsMobile.test.tsx`

**Interfaces:**
- Produces: `useIsMobile(): boolean` — true when viewport ≤ 767px, reactive to media-query changes.

- [ ] **Step 1: Write the failing test**

```tsx
// test/client/useIsMobile.test.tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useIsMobile } from "../../src/client/lib/useIsMobile";

// jsdom's matchMedia always reports matches:false and never fires change
// events, so stub it with a controllable fake.
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })));
  return (next: boolean) => { matches = next; listeners.forEach((cb) => cb()); };
}

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it("reflects the media query and reacts to changes", () => {
    const setMatches = stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    act(() => setMatches(false));
    expect(result.current).toBe(false);
  });

  it("is false on desktop viewports", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c vitest.client.ts test/client/useIsMobile.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/lib/useIsMobile`.

- [ ] **Step 3: Write the implementation**

```ts
// src/client/lib/useIsMobile.ts
import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

// True on phone-sized viewports. Components branch on this so the desktop
// (≥768px) JSX stays byte-identical to the pre-mobile layout.
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -c vitest.client.ts test/client/useIsMobile.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/useIsMobile.ts test/client/useIsMobile.test.tsx
git commit -m "feat: useIsMobile hook (767px breakpoint)"
```

---

### Task 2: `BottomSheet` component

**Files:**
- Create: `src/client/components/BottomSheet.tsx`
- Test: `test/client/bottom-sheet.test.tsx`

**Interfaces:**
- Produces:
  - `BottomSheet({ header?: React.ReactNode; children: React.ReactNode })` — absolutely positioned inside a `position: relative` parent; drag handle snaps between detents.
  - `PEEK_PX = 96` (exported; ChatPanel's pill offset uses it).
  - `detentHeight(detent: Detent, containerH: number): number` and `closestDetent(visibleH: number, containerH: number): Detent` (exported for tests), `type Detent = "peek" | "half" | "full"`.

- [ ] **Step 1: Write the failing test**

```tsx
// test/client/bottom-sheet.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BottomSheet, detentHeight, closestDetent, PEEK_PX } from "../../src/client/components/BottomSheet";

describe("detent math", () => {
  it("computes detent heights from the container height", () => {
    expect(detentHeight("peek", 800)).toBe(PEEK_PX);
    expect(detentHeight("half", 800)).toBe(400);
    expect(detentHeight("full", 800)).toBe(720);
  });

  it("snaps to the nearest detent", () => {
    expect(closestDetent(100, 800)).toBe("peek");
    expect(closestDetent(390, 800)).toBe("half");
    expect(closestDetent(700, 800)).toBe("full");
    // exactly between half (400) and full (720) → half wins (checked first)
    expect(closestDetent(560, 800)).toBe("half");
  });
});

describe("BottomSheet", () => {
  it("renders header and children with a drag handle, starting at half", () => {
    render(<BottomSheet header={<span>214 km</span>}><div data-testid="content" /></BottomSheet>);
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.getByText("214 km")).toBeTruthy();
    const handle = screen.getByLabelText("Resize day list");
    // jsdom: clientHeight is 0, so the container falls back to window.innerHeight (768)
    expect(handle.parentElement!.style.height).toBe(`${detentHeight("half", 768)}px`);
  });

  it("snaps to full after dragging the handle up", () => {
    render(<BottomSheet><div /></BottomSheet>);
    const handle = screen.getByLabelText("Resize day list");
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 200, pointerId: 1 }); // up 300px from half(384) → 684
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(handle.parentElement!.style.height).toBe(`${detentHeight("full", 768)}px`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c vitest.client.ts test/client/bottom-sheet.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/BottomSheet`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/client/components/BottomSheet.tsx
import { useRef, useState } from "react";

export type Detent = "peek" | "half" | "full";
export const PEEK_PX = 96;

// Visible sheet height (px) at a detent, for a given container height.
export function detentHeight(detent: Detent, containerH: number): number {
  if (detent === "peek") return PEEK_PX;
  return Math.round(containerH * (detent === "half" ? 0.5 : 0.9));
}

// Nearest detent to a dragged visible height; ties resolve to the earlier
// (smaller) detent, which is the less intrusive choice.
export function closestDetent(visibleH: number, containerH: number): Detent {
  let best: Detent = "peek";
  let bestDist = Infinity;
  for (const d of ["peek", "half", "full"] as const) {
    const dist = Math.abs(detentHeight(d, containerH) - visibleH);
    if (dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

// Mobile bottom sheet: absolutely positioned over the map inside a
// position:relative parent. Only the handle area is draggable — the content
// keeps its own internal scrolling (DayRail is overflow-y:auto).
export function BottomSheet({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  const [detent, setDetent] = useState<Detent>("half");
  const [dragH, setDragH] = useState<number | null>(null); // visible height mid-drag
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  // jsdom and first render report clientHeight 0 — fall back to the window.
  const containerH = () => rootRef.current?.parentElement?.clientHeight || window.innerHeight;
  const visible = dragH ?? detentHeight(detent, containerH());

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startY: e.clientY, startH: visible };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId); // jsdom lacks pointer capture
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const h = drag.current.startH + (drag.current.startY - e.clientY);
    setDragH(Math.max(PEEK_PX, Math.min(detentHeight("full", containerH()), h)));
  }
  function onPointerUp() {
    if (!drag.current) return;
    if (dragH != null) setDetent(closestDetent(dragH, containerH()));
    drag.current = null;
    setDragH(null);
  }

  return (
    <div ref={rootRef} style={{
      position: "absolute", left: 0, right: 0, bottom: 0, height: visible, zIndex: 25,
      display: "flex", flexDirection: "column", background: "#F4F6F6",
      borderRadius: "16px 16px 0 0", boxShadow: "0 -6px 28px rgba(22,33,31,.18)",
      transition: dragH == null ? "height .22s ease" : "none",
    }}>
      <div aria-label="Resize day list" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{ flex: "none", cursor: "grab", padding: "8px 14px 4px", touchAction: "none" }}>
        <div aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(87,103,107,.35)", margin: "0 auto" }} />
        {header}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -c vitest.client.ts test/client/bottom-sheet.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/components/BottomSheet.tsx test/client/bottom-sheet.test.tsx
git commit -m "feat: BottomSheet with peek/half/full detents"
```

---

### Task 3: `EditorStoreProvider` accepts `initialChatOpen`

The chat currently initializes open (`chatOpen: true`) — on mobile that would cover the whole screen on load, so the editor must be able to start it closed.

**Files:**
- Modify: `src/client/state/editorStore.tsx:49-50`
- Test: `test/client/editorStore.test.tsx` (append a test)

**Interfaces:**
- Produces: `EditorStoreProvider({ children, initialChatOpen = true })` — Task 6 passes `initialChatOpen={!isMobile}`. Default `true` keeps desktop and ShareView behavior unchanged.

- [ ] **Step 1: Write the failing test** — append to `test/client/editorStore.test.tsx` (match the file's existing render/hook style when appending; the assertion is):

```tsx
it("starts with the chat closed when initialChatOpen is false", () => {
  const { result } = renderHook(() => useEditorStore(), {
    wrapper: ({ children }) => <EditorStoreProvider initialChatOpen={false}>{children}</EditorStoreProvider>,
  });
  expect(result.current.chatOpen).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c vitest.client.ts test/client/editorStore.test.tsx`
Expected: FAIL — `chatOpen` is `true` (prop ignored / TS error on unknown prop).

- [ ] **Step 3: Implement** — in `src/client/state/editorStore.tsx` change the provider signature and initial state:

```tsx
export function EditorStoreProvider({ children, initialChatOpen = true }: { children: React.ReactNode; initialChatOpen?: boolean }) {
  const [state, dispatch] = useReducer(reducer, { selectedDayId: null, expandedDayIds: new Set<string>(), selectedPointId: null, droppingPin: false, chatOpen: initialChatOpen, chatPrefill: null, aiBusy: false });
```

(Only these two lines change; the rest of the file is untouched.)

- [ ] **Step 4: Run the client suite** (the store is widely used — check nothing else broke)

Run: `npm run test:client`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add src/client/state/editorStore.tsx test/client/editorStore.test.tsx
git commit -m "feat: editor store accepts initialChatOpen"
```

---

### Task 4: Compact mobile TopBar with `⋮` overflow menu

**Files:**
- Modify: `src/client/editor/TopBar.tsx`
- Test: `test/client/top-bar.test.tsx` (append mobile cases)

**Interfaces:**
- Consumes: `useIsMobile()` from Task 1.
- Produces: same external props (`{ trip, stats, onShare, aiBusy }`) — no caller changes. On mobile the stats span and the three action buttons are replaced by a `⋮` button (aria-label "Trip menu") opening a popover with Share trip / Settings / Delete trip.

- [ ] **Step 1: Write the failing tests** — append to `test/client/top-bar.test.tsx`. Mock the hook per-test-file is not possible (desktop cases need false), so mock with a mutable flag:

```tsx
// At top of file, after existing mocks:
let isMobile = false;
vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => isMobile }));
```

(Existing desktop tests keep passing because `isMobile` defaults to `false`. If the file's existing render helper differs, reuse it; assertions are what matter.)

```tsx
describe("TopBar mobile", () => {
  it("collapses actions into a trip menu", async () => {
    isMobile = true;
    render(/* same wrapper as existing tests */);
    expect(screen.queryByText("Delete trip")).toBeNull();
    expect(screen.queryByText(/214 km/)).toBeNull(); // stats live in the bottom sheet on mobile
    fireEvent.click(screen.getByLabelText("Trip menu"));
    expect(screen.getByText("Share trip")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Delete trip")).toBeTruthy();
    isMobile = false;
  });

  it("menu Share trip invokes onShare", () => {
    isMobile = true;
    const onShare = vi.fn();
    render(/* wrapper with onShare */);
    fireEvent.click(screen.getByLabelText("Trip menu"));
    fireEvent.click(screen.getByText("Share trip"));
    expect(onShare).toHaveBeenCalled();
    isMobile = false;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c vitest.client.ts test/client/top-bar.test.tsx`
Expected: existing tests PASS, new mobile tests FAIL (no "Trip menu" element).

- [ ] **Step 3: Implement.** In `TopBar.tsx`: import `useEffect`, `useRef`, `MoreVertical` from lucide-react, `popover` from `../styles/ui`, and `useIsMobile`. Keep the existing desktop `return` byte-identical inside `if (!isMobile)`. Mobile branch:

```tsx
export function TopBar({ trip, stats, onShare, aiBusy = false }: { trip: Trip; stats: string; onShare: () => void; aiBusy?: boolean }) {
  const tripId = trip.id, tripName = trip.name;
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const del = useDeleteTrip();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Dialogs render in both variants.
  const dialogs = (
    <>
      {confirming && (
        <ConfirmDialog title={`Delete "${tripName}"?`} body="This removes the trip and all of its stops, days and routes."
          confirmLabel="Delete trip" onConfirm={() => del.mutate(tripId, { onSuccess: () => navigate("/trips") })} onCancel={() => setConfirming(false)} />
      )}
      {settingsOpen && <TripSettingsDialog trip={trip} onClose={() => setSettingsOpen(false)} />}
    </>
  );

  if (isMobile) {
    return (
      <header style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: "var(--basalt)", color: "#ECF0F0", ...contour("90% -80%") }}>
        <span aria-hidden style={{ width: 10, height: 10, flex: "none", background: "var(--lupine)", borderRadius: 3 }} />
        <Link to="/trips" className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 14, color: "inherit", textDecoration: "none" }}>NOMAD</Link>
        <span style={{ opacity: 0.35 }}>›</span>
        <TripName key={tripName} tripId={tripId} tripName={tripName} />
        {aiBusy && (
          <span role="status" aria-label="AI planning" style={{ display: "inline-flex", flex: "none", padding: "3px 6px", borderRadius: 14, background: "rgba(91,68,201,.28)", border: "1px solid rgba(122,99,232,.5)", color: "#CFC5F5" }}>
            <Sparkles size={10} aria-hidden />
          </span>
        )}
        <div style={{ flex: 1 }} />
        <TripMenu onShare={onShare} onSettings={() => setSettingsOpen(true)} onDelete={() => setConfirming(true)} aiBusy={aiBusy} />
        {dialogs}
      </header>
    );
  }

  return (
    /* ... today's desktop <header> exactly as-is, with the two dialog
       conditionals replaced by {dialogs} (identical rendered output) ... */
  );
}
```

And the menu (same dismiss pattern as `DayMenu`):

```tsx
function TripMenu({ onShare, onSettings, onDelete, aiBusy }: { onShare: () => void; onSettings: () => void; onDelete: () => void; aiBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const item = (label: string, onClick: () => void, opts?: { destructive?: boolean; dimmed?: boolean }): React.ReactNode => (
    <button onClick={() => { setOpen(false); onClick(); }}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", fontFamily: "inherit", background: "#fff", fontSize: 13, fontWeight: 600, color: opts?.destructive ? "var(--brick)" : "var(--ink)", opacity: opts?.dimmed ? 0.5 : 1, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} aria-label="Trip menu" aria-expanded={open} style={btnGhostDark(31)}>
        <MoreVertical size={15} aria-hidden />
      </button>
      {open && (
        <div ref={menuRef} style={{ ...popover, position: "fixed", right: 8, top: 54, width: 180, zIndex: 40, color: "var(--ink)" }}>
          {item("Share trip", onShare, { dimmed: aiBusy })}
          {item("Settings", onSettings, { dimmed: aiBusy })}
          <div style={{ borderTop: "1px solid rgba(30,42,44,.10)" }} />
          {item("Delete trip", onDelete, { destructive: true })}
        </div>
      )}
    </>
  );
}
```

(Desktop parity note: on desktop, aiBusy only dims Settings/Share without disabling — mirror that with `dimmed`, still clickable.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -c vitest.client.ts test/client/top-bar.test.tsx`
Expected: PASS, including pre-existing desktop cases.

- [ ] **Step 5: Commit**

```bash
git add src/client/editor/TopBar.tsx test/client/top-bar.test.tsx
git commit -m "feat: compact mobile top bar with overflow trip menu"
```

---

### Task 5: DetailPanel and ChatPanel as full-screen mobile overlays

**Files:**
- Modify: `src/client/editor/DetailPanel.tsx:133` (the `<aside>` style)
- Modify: `src/client/editor/ChatPanel.tsx:130,140` (pill position; expanded `<aside>` style)
- Test: `test/client/detail-panel.test.tsx`, `test/client/chat-panel.test.tsx` (append mobile cases)

**Interfaces:**
- Consumes: `useIsMobile()` (Task 1), `PEEK_PX` from `BottomSheet` (Task 2).
- Produces: no prop changes. z-order contract: sheet 25, chat pill 20 (desktop) / 30 (mobile, above sheet), detail overlay 50, chat overlay 55, dialogs 60.

- [ ] **Step 1: Write the failing tests.** Both test files get the same mutable-flag mock as Task 4 (`let isMobile = false; vi.mock("../../src/client/lib/useIsMobile", ...)`). Append:

```tsx
// detail-panel.test.tsx
it("renders as a full-screen overlay on mobile", () => {
  isMobile = true;
  render(/* existing wrapper with a selected point */);
  const aside = screen.getByLabelText("Stop name").closest("aside")!;
  expect(aside.style.position).toBe("fixed");
  expect(aside.style.width).toBe("");
  isMobile = false;
});

// chat-panel.test.tsx
it("expands to a full-screen overlay on mobile", () => {
  isMobile = true;
  render(/* existing wrapper with chatOpen true */);
  const aside = screen.getByLabelText("AI chat");
  expect(aside.style.position).toBe("fixed");
  isMobile = false;
});
it("floats the collapsed pill above the sheet peek on mobile", () => {
  isMobile = true;
  render(/* existing wrapper with chatOpen false */);
  const pill = screen.getByLabelText("Open AI chat");
  expect(pill.style.bottom).toBe("108px"); // PEEK_PX + 12
  isMobile = false;
});
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run: `npx vitest run -c vitest.client.ts test/client/detail-panel.test.tsx test/client/chat-panel.test.tsx`
Expected: existing cases PASS, new cases FAIL.

- [ ] **Step 3: Implement.**

`DetailPanel.tsx` — in `PointEditor`, add `const isMobile = useIsMobile();` and replace the aside style (line 133):

```tsx
<aside style={isMobile
  ? { position: "fixed", inset: 0, zIndex: 50, background: "var(--panel)", display: "flex", flexDirection: "column", overflowY: "auto" }
  : { width: 382, flex: "none", background: "var(--panel)", borderLeft: "1px solid rgba(30,42,44,.12)", boxShadow: "-8px 0 28px rgba(22,33,31,.08)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
```

`ChatPanel.tsx` — add `const isMobile = useIsMobile();` in `ChatPanel`, import `PEEK_PX` from `../components/BottomSheet`. Pill (line 130): change `bottom: 16` → `bottom: isMobile ? PEEK_PX + 12 : 16` and `zIndex: 20` → `zIndex: isMobile ? 30 : 20`. Expanded aside (line 140):

```tsx
<aside aria-label="AI chat" style={isMobile
  ? { position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", background: "#fff" }
  : { width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid rgba(30,42,44,.12)" }}>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c vitest.client.ts test/client/detail-panel.test.tsx test/client/chat-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/editor/DetailPanel.tsx src/client/editor/ChatPanel.tsx test/client/detail-panel.test.tsx test/client/chat-panel.test.tsx
git commit -m "feat: detail and chat panels go full-screen on mobile"
```

---

### Task 6: TripEditor mobile layout + touch drag sensors + dvh

**Files:**
- Modify: `src/client/screens/TripEditor.tsx`
- Modify: `src/client/editor/DayRail.tsx:30` (add `touchAction`)
- Modify: `src/client/editor/Pool.tsx:109` (add `touchAction`)
- Modify: `src/client/styles/tokens.css:24-29` (`#root` dvh)
- Test: `test/client/trip-editor.test.tsx` (append mobile case)

**Interfaces:**
- Consumes: `useIsMobile()`, `BottomSheet`, `EditorStoreProvider initialChatOpen` (Tasks 1–3).
- Produces: the finished mobile editor. No new exports.

- [ ] **Step 1: Write the failing test** — append to `test/client/trip-editor.test.tsx`, with the same mutable-flag mock for `useIsMobile` as Tasks 4–5:

```tsx
it("renders the mobile layout: map + bottom sheet with rail, pool and stats", () => {
  isMobile = true;
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><TripEditorScreen /></MemoryRouter></QueryClientProvider>);
  expect(screen.getAllByTestId("map")).toHaveLength(1);
  expect(screen.getByLabelText("Resize day list")).toBeTruthy(); // BottomSheet handle
  expect(screen.getByTestId("rail")).toBeTruthy();
  expect(screen.getByTestId("pool")).toBeTruthy();
  expect(screen.getByText(/214 km/)).toBeTruthy(); // stats in the sheet header
  isMobile = false;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c vitest.client.ts test/client/trip-editor.test.tsx`
Expected: desktop case PASS, mobile case FAIL (no "Resize day list").

- [ ] **Step 3: Implement `TripEditor.tsx`.**

Imports: replace `PointerSensor` with `MouseSensor, TouchSensor` in the dnd-kit import; add `useIsMobile`, `BottomSheet`.

Sensors (in `EditorBody`) — replace the `useSensors` line:

```tsx
// MouseSensor keeps the desktop click-vs-drag distance rule; TouchSensor
// activates on long-press so touch scrolling in the sheet never starts a drag.
// (PointerSensor treated touch like mouse and hijacked scroll gestures.)
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
);
```

Layout — inside `EditorBody`, add `const isMobile = useIsMobile();`. Extract the current `<main>…</main>` subtree (map + empty-state + top-left dock, `TripEditor.tsx:105-148`) into a local `const mapMain = (<main …>…</main>);` **unchanged**, so both branches share it. Then replace the flex row (lines 100–151) with:

```tsx
{isMobile ? (
  <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
    {mapMain}
    <BottomSheet header={
      <div className="mono" style={{ textAlign: "center", fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", paddingTop: 5 }}>{stats}</div>
    }>
      <DayRail detail={detail} />
      <Pool detail={detail} />
    </BottomSheet>
    {selectedPointId && <DetailPanel detail={detail} />}
    <ChatPanel tripId={detail.trip.id} />
  </div>
) : (
  <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
    <aside style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#F4F6F6", borderRight: "1px solid rgba(87,103,107,.18)" }}>
      <DayRail detail={detail} />
      <Pool detail={detail} />
    </aside>
    {mapMain}
    {selectedPointId && <DetailPanel detail={detail} />}
    <ChatPanel tripId={detail.trip.id} />
  </div>
)}
```

Note: on mobile, `mapMain`'s `<main style={{ flex: 1 … }}>` is the only flex child so it fills the row — the sheet overlays it (absolute). Desktop output is unchanged.

`TripEditorScreen` — start the chat closed on mobile:

```tsx
export function TripEditorScreen() {
  const { id } = useParams();
  const { data, isPending } = useTrip(id!);
  const isMobile = useIsMobile();
  if (isPending || !data) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return <EditorStoreProvider initialChatOpen={!isMobile}><EditorBody detail={data} /></EditorStoreProvider>;
}
```

`DayRail.tsx:30` (`DayStopRow` root style) and `Pool.tsx:109` (`PoolRow` root style): add `touchAction: "manipulation"` to the style object (dnd-kit's recommendation for delay-activated touch sensors; no visual change).

`tokens.css` — after the `html, body, #root { … height: 100% }` block add:

```css
#root {
  height: 100dvh; /* mobile URL bar; == 100% on desktop */
}
```

- [ ] **Step 4: Run the full client suite**

Run: `npm run test:client`
Expected: PASS, all files (the trip-editor desktop case guards the no-desktop-change constraint).

- [ ] **Step 5: Commit**

```bash
git add src/client/screens/TripEditor.tsx src/client/editor/DayRail.tsx src/client/editor/Pool.tsx src/client/styles/tokens.css test/client/trip-editor.test.tsx
git commit -m "feat: mobile trip editor - full-screen map with bottom sheet"
```

---

### Task 7: End-to-end verification

**Files:** none created — this is the verification gate.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: worker + client suites PASS.

- [ ] **Step 2: Mobile walkthrough in Chrome at 390×844** (dev server: `npm run dev`, app at `http://localhost:5173`; the project `verify` skill documents launch/drive if needed). Known pre-existing dev issue: map AdvancedMarkers may not mount — not a regression. Check:

1. `/trips` → open a trip → map area visible, sheet at half with stats in header.
2. Drag the sheet handle to peek and full; day list scrolls at full; map is tappable at peek.
3. Long-press-drag a stop from one day to another (and pool → day); order persists after refetch.
4. Tap a stop → full-screen detail panel; edit the name; close via X.
5. Chat pill sits above the sheet peek; tapping it opens full-screen chat; close collapses back to pill.
6. Top bar `⋮` → Share trip → dialog fits the viewport; Settings and Delete trip reachable.
7. Share view (`/s/<token>`) at 390px renders as before.

- [ ] **Step 3: Desktop regression at ≥1280px** — resize the same tab to 1280×800: editor shows sidebar + map + chat column exactly as on `main`; trip list and dialogs unchanged.

- [ ] **Step 4: Login screen check at 390px** — visual only; fix only if actually broken (out of scope otherwise).

- [ ] **Step 5: Commit any verification fixes** (each with its own failing-test-first cycle where code changed).
