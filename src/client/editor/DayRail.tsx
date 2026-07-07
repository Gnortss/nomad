import { useDroppable } from "@dnd-kit/core";
import { daysWithStats } from "../lib/tripModel";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { useEditorStore } from "../state/editorStore";
import { useCreateDay } from "../lib/api";
import type { TripDetail } from "../lib/types";

const STATUS_DOT: Record<string, string> = { booked: "var(--moss)", to_book: "var(--sulfur)", idea: "transparent" };

function DayDropZone({ dayId, children }: { dayId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId });
  return <div ref={setNodeRef} style={{ marginBottom: 8, borderRadius: 9, outline: isOver ? "2px solid var(--lupine)" : "none" }}>{children}</div>;
}

export function DayRail({ detail }: { detail: TripDetail }) {
  const { focusedDayId, focusDay, selectPoint } = useEditorStore();
  const createDay = useCreateDay(detail.trip.id);
  const days = daysWithStats(detail);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 10px" }}>
        <span className="ovp" style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".14em", color: "var(--slate)" }}>DAYS</span>
        <button onClick={() => createDay.mutate({})} disabled={createDay.isPending}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 24, padding: "0 9px", background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: "var(--basalt)", cursor: "pointer" }}>+ Add day</button>
      </div>
      {days.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--slate)", padding: "4px 6px 10px" }}>No days yet. Add a day, then drag stops onto it.</div>
      )}
      {days.map((d) => {
        const focused = focusedDayId === d.id;
        const distText = d.distanceM != null ? `${formatDistance(d.distanceM)} · ${formatDuration(d.durationS!)}` : "No route yet";
        return (
          <DayDropZone key={d.id} dayId={d.id}>
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
          </DayDropZone>
        );
      })}
    </div>
  );
}
