import { useEffect, useRef, useState } from "react";
import { useMoveStop, usePutStops } from "../lib/api";
import { stopsForDay } from "../lib/tripModel";
import type { TripDetail } from "../lib/types";

// Non-drag alternative to drag-and-drop assignment: a small popover listing days.
// Popover is position:fixed (anchored to the trigger) so it isn't clipped by the
// pool's overflow-y:auto scroll container.
export function DayMenu({ detail, pointId, triggerLabel, triggerStyle }: { detail: TripDetail; pointId: string; triggerLabel?: string; triggerStyle?: React.CSSProperties }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const moveStop = useMoveStop(detail.trip.id);
  const putStops = usePutStops(detail.trip.id);
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

  function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // don't select the row underneath
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, r.right - 190), top: r.bottom + 4 });
  }

  function fromPointIdsWithout() {
    return fromDayId ? stopsForDay(detail, fromDayId).map((p) => p.id).filter((id) => id !== pointId) : [];
  }
  function assign(dayId: string) {
    const toPointIds = [...stopsForDay(detail, dayId).map((p) => p.id).filter((id) => id !== pointId), pointId];
    moveStop.mutate({ fromDayId, fromPointIds: fromPointIdsWithout(), toDayId: dayId, toPointIds });
    setPos(null);
  }
  function unassign() {
    if (fromDayId) putStops.mutate({ dayId: fromDayId, pointIds: fromPointIdsWithout() });
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
        <div ref={menuRef} style={{ position: "fixed", left: pos.left, top: pos.top, width: 190, zIndex: 30, background: "#fff", border: "1px solid rgba(87,103,107,.2)", borderRadius: 7, boxShadow: "0 8px 28px rgba(30,42,44,.16)", overflow: "hidden" }}>
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
