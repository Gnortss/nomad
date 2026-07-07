import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMoveStop, useUnassignStop } from "../lib/api";
import { routeStopsForDay } from "../lib/tripModel";
import type { TripDetail } from "../lib/types";

// Non-drag alternative to drag-and-drop assignment: a small popover listing days.
// Popover is position:fixed (anchored to the trigger) so it isn't clipped by the
// pool's overflow-y:auto scroll container.
export function DayMenu({ detail, pointId, triggerLabel, triggerStyle }: { detail: TripDetail; pointId: string; triggerLabel?: string; triggerStyle?: React.CSSProperties }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const moveStop = useMoveStop(detail.trip.id);
  const unassignStop = useUnassignStop(detail.trip.id);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fromDayId = detail.dayStops.find((s) => s.pointId === pointId)?.dayId ?? null;
  const fromDay = detail.days.find((d) => d.id === fromDayId);
  const days = [...detail.days].sort((a, b) => a.position - b.position);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setPos(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pos]);

  // Clamp into the viewport after render (menu height isn't known until then),
  // so opening near the bottom of the screen doesn't push the list off-screen.
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return;
    const maxTop = window.innerHeight - menuRef.current.offsetHeight - 8;
    if (pos.top > maxTop) setPos({ ...pos, top: Math.max(8, maxTop) });
  }, [pos]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // don't select the row underneath
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, r.right - 190), top: r.bottom + 4 });
  }

  function assign(dayId: string) {
    const fromPointIds = fromDayId ? routeStopsForDay(detail, fromDayId).map((p) => p.id).filter((id) => id !== pointId) : [];
    const toPointIds = [...routeStopsForDay(detail, dayId).map((p) => p.id).filter((id) => id !== pointId), pointId];
    moveStop.mutate({ fromDayId, fromPointIds, toDayId: dayId, toPointIds });
    setPos(null);
  }
  function unassign() {
    if (fromDayId) unassignStop.mutate({ dayId: fromDayId, pointId });
    setPos(null);
  }

  const label = triggerLabel ?? `${fromDay ? `Day ${fromDay.position + 1}${fromDay.title ? ` — ${fromDay.title}` : ""}` : "Unassigned"} ▾`;
  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Assign to day"
        style={triggerStyle ?? { height: 28, padding: "0 10px", background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
        {label}
      </button>
      {pos && (
        <div ref={menuRef} style={{ position: "fixed", left: pos.left, top: pos.top, width: 190, zIndex: 30, background: "#fff", border: "1px solid rgba(87,103,107,.2)", borderRadius: 7, boxShadow: "0 8px 28px rgba(30,42,44,.16)", maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}>
          {days.length === 0 && <div style={{ padding: "8px 11px", fontSize: 12.5, color: "var(--slate)" }}>No days yet</div>}
          {days.map((d) => (
            <button key={d.id} onClick={(e) => { e.stopPropagation(); assign(d.id); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", border: "none", background: "#fff", fontSize: 12.5, fontWeight: d.id === fromDayId ? 700 : 400, cursor: "pointer" }}>
              Day {d.position + 1}{d.title ? ` — ${d.title}` : ""}{d.id === fromDayId ? " ✓" : ""}
            </button>
          ))}
          {fromDayId && (
            <button onClick={(e) => { e.stopPropagation(); unassign(); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", border: "none", borderTop: "1px solid rgba(87,103,107,.16)", background: "#fff", fontSize: 12.5, color: "#a33", cursor: "pointer" }}>
              Remove from day
            </button>
          )}
        </div>
      )}
    </>
  );
}
