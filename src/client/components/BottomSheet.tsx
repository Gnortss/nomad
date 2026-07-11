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
