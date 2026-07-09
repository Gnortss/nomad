import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Sparkles, TriangleAlert } from "lucide-react";
import { daysWithStats, groupColor } from "../lib/tripModel";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { useCreateDay } from "../lib/api";
import { btnSecondary } from "../styles/ui";
import type { TripDetail, Point } from "../lib/types";

const STATUS_DOT: Record<string, string> = { booked: "var(--moss)", to_book: "var(--sulfur)", idea: "transparent" };

function StatusDot({ status }: { status: string }) {
  return <span style={{ width: 9, height: 9, flex: "none", borderRadius: "50%", background: STATUS_DOT[status], border: status === "idea" ? "1.5px dashed #8797a0" : "none" }} />;
}

function DayDropZone({ dayId, children }: { dayId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId, data: { type: "day" } });
  return <div ref={setNodeRef} style={{ marginBottom: 6, borderRadius: 10, outline: isOver ? "2px solid var(--lupine)" : "none", background: isOver ? "rgba(91,68,201,.07)" : "transparent" }}>{children}</div>;
}

function DayStopRow({ point: p, dayId, index, count, selected, onSelect }: { point: Point; dayId: string; index: number; count: number; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, active, over } = useSortable({ id: p.id, data: { type: "dayStop", dayId } });
  // Insertion bar for foreign drags only (pool→day, other-day→day); same-day reorders animate via the sortable transform instead.
  const showLine = over?.id === p.id && !!active && active.id !== p.id && active.data.current?.dayId !== dayId;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onSelect}
      style={{ position: "relative", transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, display: "flex", alignItems: "center", gap: 9, padding: "5px 7px", borderRadius: 8, background: selected ? "var(--lupine-tint)" : "transparent", textAlign: "left", cursor: "grab" }}>
      {showLine && (
        <span aria-hidden>
          <span style={{ position: "absolute", left: 2, right: 8, top: -2, height: 3, borderRadius: 2, background: "var(--lupine)" }} />
          <span style={{ position: "absolute", left: -4, top: -5, width: 9, height: 9, borderRadius: "50%", background: "var(--lupine)" }} />
        </span>
      )}
      <span style={{ flex: "none", display: "flex", color: selected ? "var(--lupine)" : "var(--slate)" }}><TypeIcon type={p.type} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: selected ? 600 : 500, color: selected ? "var(--lupine)" : "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      {endpointLabel(index, count) && <span className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", background: "rgba(87,103,107,.12)", padding: "2px 5px", borderRadius: 4 }}>{endpointLabel(index, count)}</span>}
      <StatusDot status={p.bookingStatus} />
    </div>
  );
}

function AttachedStopRow({ point: p, onSelect }: { point: Point; onSelect: () => void }) {
  return (
    <div onClick={onSelect} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 7px", borderRadius: 8, cursor: "pointer" }}>
      <span style={{ flex: "none", display: "flex", color: "#8FA3A0" }}><TypeIcon type={p.type} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: "var(--slate)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      <StatusDot status={p.bookingStatus} />
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
    <div style={{ margin: "4px 8px 6px 44px", borderTop: "1px dashed rgba(30,42,44,.10)" }}>
      <div className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "#8FA3A0", padding: "7px 7px 2px" }}>ALSO THIS DAY</div>
      {plain.map((p) => <AttachedStopRow key={p.id} point={p} onSelect={() => onSelect(p.id)} />)}
      {dayGroups.map((g) => {
        const members = attached.filter((p) => p.groupId === g.id);
        if (members.length === 0) return null;
        const hue = groupColor(detail, g.id);
        return (
          <div key={g.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 7px 2px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2.5, background: hue }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: hue }}>{g.name}</span>
            </div>
            {members.map((p) => <AttachedStopRow key={p.id} point={p} onSelect={() => onSelect(p.id)} />)}
          </div>
        );
      })}
    </div>
  );
}

// Shimmering placeholder rows while the AI plans an empty trip: the rail itself
// signals that days are on their way.
function DaySkeleton({ n }: { n: number }) {
  return (
    <div className="ai-skeleton" aria-hidden style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", marginBottom: 5, borderRadius: 10, animationDelay: `${n * 0.2}s` }}>
      <span style={{ width: 31, height: 28, flex: "none", background: "rgba(87,103,107,.18)", borderRadius: 8 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", width: "68%", height: 9, background: "rgba(87,103,107,.18)", borderRadius: 5 }} />
        <span style={{ display: "block", width: "42%", height: 7, background: "rgba(87,103,107,.12)", borderRadius: 5, marginTop: 6 }} />
      </span>
    </div>
  );
}

export function DayRail({ detail }: { detail: TripDetail }) {
  const { selectedDayId, selectDay, expandedDayIds, toggleDayExpanded, selectPoint, selectedPointId, openChat, aiBusy } = useEditorStore();
  const createDay = useCreateDay(detail.trip.id);
  const days = daysWithStats(detail);
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 9px" }}>
        <span className="ovp" style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".14em", color: "var(--slate)" }}>
          DAYS {days.length > 0 && <span className="mono" style={{ fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>· {days.length}</span>}
        </span>
        <button onClick={() => createDay.mutate({})} disabled={createDay.isPending}
          style={{ ...btnSecondary(24), padding: "0 9px", fontSize: 11, borderRadius: 7 }}>+ Add day</button>
      </div>
      {days.length === 0 && (aiBusy ? (
        <>
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--lupine)", fontWeight: 600, padding: "0 4px 9px" }}>
            <span className="ai-dots" style={{ display: "flex", gap: 3, flex: "none" }} aria-hidden><span /><span /><span /></span>
            The AI is planning — days appear here as they're written.
          </div>
          <DaySkeleton n={0} /><DaySkeleton n={1} /><DaySkeleton n={2} />
        </>
      ) : (
        <div style={{ margin: "4px 2px 10px", padding: "14px 12px", border: "1.5px dashed rgba(87,103,107,.35)", borderRadius: 11, fontSize: 12.5, color: "var(--slate)", textAlign: "center", lineHeight: 1.5 }}>
          No days yet.<br /><span style={{ fontSize: 12, color: "#8FA3A0" }}>Add a day, then drag stops onto it.</span>
        </div>
      ))}
      {days.map((d) => {
        const selected = selectedDayId === d.id;
        const expanded = expandedDayIds.has(d.id);
        const routing = aiBusy && d.stops.length > 0 && d.distanceM == null;
        return (
          <DayDropZone key={d.id} dayId={d.id}>
            <div style={{
              background: selected ? "#fff" : "transparent",
              border: `1px solid ${selected ? "rgba(91,68,201,.4)" : "transparent"}`,
              borderLeft: selected ? "4px solid var(--lupine)" : "4px solid transparent",
              borderRadius: 10,
              boxShadow: selected ? "0 1px 2px rgba(22,33,31,.06), 0 8px 22px rgba(22,33,31,.08)" : "none",
              paddingBottom: expanded ? 5 : 0,
            }}>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <button onClick={() => selectDay(selected ? null : d.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: selected ? "7px 9px 5px 6px" : "7px 9px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  <span className="ovp" style={{
                    width: 31, height: 28, flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
                    background: d.warnLongDay ? "#fff" : selected ? "var(--lupine)" : "var(--basalt)",
                    color: d.warnLongDay ? "var(--basalt)" : "#fff",
                    border: d.warnLongDay ? "2px solid var(--sulfur)" : "none",
                    borderRadius: 8, fontWeight: 800, fontSize: 13,
                  }}>{d.position + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ovp" style={{ display: "block", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title ?? `Day ${d.position + 1}`}</span>
                    <span className="mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: d.distanceM != null ? "var(--slate)" : "#8FA3A0", marginTop: 1, textTransform: "uppercase" }}>
                      {routing ? (
                        <>Measuring the drive… <span className="ai-spinner" aria-hidden style={{ width: 10, height: 10, flex: "none", border: "2px solid rgba(87,103,107,.25)", borderTopColor: "var(--slate)", borderRadius: "50%" }} /></>
                      ) : (
                        <span>{d.distanceM != null ? `${formatDistance(d.distanceM)} · ${formatDuration(d.durationS!)}` : "No route yet"}</span>
                      )}
                      {d.warnLongDay && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", background: "rgba(227,154,12,.16)", color: "#8A5C00", borderRadius: 20, fontWeight: 700, fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: 0, textTransform: "none" }}><TriangleAlert size={9} aria-hidden /> Long day</span>}
                    </span>
                  </span>
                </button>
                <button onClick={() => openChat(`Refine day ${d.position + 1}: `)} aria-label={`Refine day ${d.position + 1} with AI`} title="Refine with AI"
                  style={{ flex: "none", width: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: selected ? "var(--lupine)" : "var(--slate)", cursor: "pointer" }}><Sparkles size={13} aria-hidden /></button>
                <button onClick={() => toggleDayExpanded(d.id)} aria-label="Toggle stops" aria-expanded={expanded}
                  style={{ flex: "none", width: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: expanded ? "var(--slate)" : "#8FA3A0", cursor: "pointer" }}>{expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</button>
              </div>
              {expanded && (
                <>
                  <SortableContext items={d.stops.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ margin: "0 8px 0 44px", display: "flex", flexDirection: "column", gap: 1 }}>
                      {d.stops.map((p, i) => (
                        <DayStopRow key={p.id} point={p} dayId={d.id} index={i} count={d.stops.length} selected={selectedPointId === p.id} onSelect={() => selectPoint(p.id)} />
                      ))}
                    </div>
                  </SortableContext>
                  {d.attached.length > 0 && (
                    <AttachedSection detail={detail} dayId={d.id} attached={d.attached} onSelect={selectPoint} />
                  )}
                </>
              )}
            </div>
          </DayDropZone>
        );
      })}
    </div>
  );
}
