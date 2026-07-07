import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { daysWithStats } from "../lib/tripModel";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { useCreateDay } from "../lib/api";
import type { TripDetail, Point } from "../lib/types";

const STATUS_DOT: Record<string, string> = { booked: "var(--moss)", to_book: "var(--sulfur)", idea: "transparent" };

function DayDropZone({ dayId, children }: { dayId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId, data: { type: "day" } });
  return <div ref={setNodeRef} style={{ marginBottom: 8, borderRadius: 9, outline: isOver ? "2px solid var(--lupine)" : "none", background: isOver ? "rgba(91,68,201,.08)" : "transparent" }}>{children}</div>;
}

function DayStopRow({ point: p, dayId, index, count, onSelect }: { point: Point; dayId: string; index: number; count: number; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, active, over } = useSortable({ id: p.id, data: { type: "dayStop", dayId } });
  // Insertion line for foreign drags only (pool→day, other-day→day); same-day reorders animate via the sortable transform instead.
  const showLine = over?.id === p.id && !!active && active.id !== p.id && active.data.current?.dayId !== dayId;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onSelect}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, boxShadow: showLine ? "0 -2px 0 var(--lupine)" : "none", display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 7, background: "transparent", textAlign: "left", cursor: "grab" }}>
      <span style={{ flex: "none", display: "flex", color: "var(--slate)" }}><TypeIcon type={p.type} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      {endpointLabel(index, count) && <span className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", background: "rgba(87,103,107,.12)", padding: "2px 5px", borderRadius: 4 }}>{endpointLabel(index, count)}</span>}
      <span style={{ width: 9, height: 9, flex: "none", borderRadius: "50%", background: STATUS_DOT[p.bookingStatus], border: p.bookingStatus === "idea" ? "1.5px dashed #8797a0" : "none" }} />
    </div>
  );
}

function AttachedStopRow({ point: p, onSelect }: { point: Point; onSelect: () => void }) {
  return (
    <div onClick={onSelect} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 8px", borderRadius: 7, cursor: "pointer" }}>
      <span style={{ flex: "none", display: "flex", color: "var(--slate)" }}><TypeIcon type={p.type} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: "var(--slate)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      <span style={{ width: 9, height: 9, flex: "none", borderRadius: "50%", background: STATUS_DOT[p.bookingStatus], border: p.bookingStatus === "idea" ? "1.5px dashed #8797a0" : "none" }} />
    </div>
  );
}

// Attached stops clustered under this day's groups; stops without a day-scoped
// group render first, plain.
function AttachedSection({ detail, dayId, attached, onSelect }: { detail: TripDetail; dayId: string; attached: Point[]; onSelect: (id: string) => void }) {
  const dayGroups = detail.groups.filter((g) => g.dayId === dayId);
  const grouped = new Set(dayGroups.map((g) => g.id));
  const plain = attached.filter((p) => !p.groupId || !grouped.has(p.groupId));
  return (
    <div style={{ margin: "0 0 6px 44px" }}>
      <div className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", padding: "6px 8px 2px" }}>ALSO THIS DAY</div>
      {plain.map((p) => <AttachedStopRow key={p.id} point={p} onSelect={() => onSelect(p.id)} />)}
      {dayGroups.map((g) => {
        const members = attached.filter((p) => p.groupId === g.id);
        if (members.length === 0) return null;
        return (
          <div key={g.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 1px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color ?? "var(--basalt)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--slate)" }}>{g.name}</span>
            </div>
            {members.map((p) => <AttachedStopRow key={p.id} point={p} onSelect={() => onSelect(p.id)} />)}
          </div>
        );
      })}
    </div>
  );
}

export function DayRail({ detail }: { detail: TripDetail }) {
  const { selectedDayId, selectDay, expandedDayIds, toggleDayExpanded, selectPoint } = useEditorStore();
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
        const selected = selectedDayId === d.id;
        const expanded = expandedDayIds.has(d.id);
        const distText = d.distanceM != null ? `${formatDistance(d.distanceM)} · ${formatDuration(d.durationS!)}` : "No route yet";
        return (
          <DayDropZone key={d.id} dayId={d.id}>
            <div style={{ display: "flex", alignItems: "stretch", background: selected ? "#fff" : "transparent", border: `1px solid ${selected ? "rgba(91,68,201,.5)" : "transparent"}`, borderLeft: `3px solid ${selected ? "var(--lupine)" : "transparent"}`, borderRadius: 9 }}>
              <button onClick={() => selectDay(selected ? null : d.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}>
                <span className="ovp" style={{ width: 34, height: 30, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: d.warnLongDay ? "#fff" : "var(--basalt)", color: d.warnLongDay ? "var(--basalt)" : "#fff", border: `2px solid ${d.warnLongDay ? "var(--sulfur)" : "var(--basalt)"}`, borderRadius: 8, fontWeight: 800, fontSize: 15 }}>{d.position + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title ?? `Day ${d.position + 1}`}</span>
                  <span className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--slate)", marginTop: 2 }}>
                    <span>{distText}</span>
                    {d.warnLongDay && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", background: "rgba(227,154,12,.16)", color: "#8a5c00", borderRadius: 20, fontWeight: 600 }}><TriangleAlert size={10} aria-hidden /> Long day</span>}
                  </span>
                </span>
              </button>
              <button onClick={() => toggleDayExpanded(d.id)} aria-label="Toggle stops" aria-expanded={expanded}
                style={{ flex: "none", width: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "var(--slate)", cursor: "pointer" }}>{expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</button>
            </div>
            {expanded && (
              <>
                <SortableContext items={d.stops.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ margin: "2px 0 4px 44px", display: "flex", flexDirection: "column", gap: 1 }}>
                    {d.stops.map((p, i) => (
                      <DayStopRow key={p.id} point={p} dayId={d.id} index={i} count={d.stops.length} onSelect={() => selectPoint(p.id)} />
                    ))}
                  </div>
                </SortableContext>
                {d.attached.length > 0 && (
                  <AttachedSection detail={detail} dayId={d.id} attached={d.attached} onSelect={selectPoint} />
                )}
              </>
            )}
          </DayDropZone>
        );
      })}
    </div>
  );
}
