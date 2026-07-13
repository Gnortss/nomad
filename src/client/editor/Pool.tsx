import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { MapPin, X } from "lucide-react";
import { pooledPoints, groupColor } from "../lib/tripModel";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { AddStop } from "./AddStop";
import { DayMenu } from "./DayMenu";
import { btnPrimary, btnSecondary, tint, E1 } from "../styles/ui";
import type { TripDetail, Point } from "../lib/types";

export function Pool({ detail }: { detail: TripDetail }) {
  const { selectPoint, startDropPin, droppingPin, aiBusy, readOnly } = useEditorStore();
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const pool = pooledPoints(detail);
  const filterName = filterGroup ? detail.groups.find((g) => g.id === filterGroup)?.name : null;
  if (readOnly && pool.length === 0) return null; // no rows and no add buttons — nothing to show

  return (
    <div style={{ flex: "none", maxHeight: 290, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(30,42,44,.12)", background: "var(--tray)", boxShadow: "inset 0 6px 12px -8px rgba(22,33,31,.12)" }}>
      <div style={{ padding: "10px 12px 8px" }}>
        <div className="ovp" style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".14em", color: "var(--slate)" }}>
          UNASSIGNED {pool.length > 0 && <span className="mono" style={{ fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>· {pool.length}</span>}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
            <AddStop tripId={detail.trip.id} />
            <button onClick={startDropPin}
              style={droppingPin
                ? { ...btnPrimary(30), padding: "0 12px", fontSize: 11.5, borderRadius: 8 }
                : { ...btnSecondary(30), padding: "0 12px", fontSize: 11.5, borderRadius: 8 }}>
              <MapPin size={12} aria-hidden /> Drop a pin
            </button>
          </div>
        )}
        {detail.groups.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {detail.groups.map((g) => {
              const hue = g.color ?? "var(--basalt)";
              const active = filterGroup === g.id;
              return (
                <button key={g.id} onClick={() => setFilterGroup(active ? null : g.id)} aria-label={`Filter by ${g.name}`} aria-pressed={active}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, fontFamily: "inherit", cursor: "pointer",
                    border: active ? `1.5px solid ${hue}` : "1.5px solid transparent",
                    background: active && g.color ? tint(g.color, 0.1) : "transparent",
                    boxShadow: active ? E1 : "none",
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2.5, background: hue }} />
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: hue }}>{g.name}</span>
                  {active && <X size={10} aria-hidden style={{ color: hue }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {pool.length === 0 && aiBusy && (
          <div style={{ fontSize: 11.5, color: "#8FA3A0", padding: "4px 2px 2px" }}>Nothing here yet — the plan goes straight into days.</div>
        )}
        {pool.map((p) => (
          <PoolRow key={p.id} point={p} detail={detail} dimmed={!!filterGroup && p.groupId !== filterGroup} onSelect={() => selectPoint(p.id)} />
        ))}
      </div>
      {filterName && (
        <div className="mono" style={{ flex: "none", padding: "0 12px 9px", fontSize: 9, color: "#8FA3A0", letterSpacing: ".06em", textTransform: "uppercase" }}>
          Filtered by “{filterName}” — others dim, not hidden
        </div>
      )}
    </div>
  );
}

// Visual body of a pool stop card — shared by PoolRow and the DragOverlay in TripEditor.
// `trailing` replaces the default DRAG → hint (PoolRow puts the day menu there);
// `overlay` lifts the card while it rides the pointer mid-drag.
export function StopCard({ point, detail, trailing, overlay }: { point: Point; detail: TripDetail; trailing?: React.ReactNode; overlay?: boolean }) {
  const hue = groupColor(detail, point.groupId);
  const chipBg = point.groupId ? tint(hue, 0.14) : "rgba(22,33,31,.08)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 10, background: "#fff", textAlign: "left",
      border: overlay ? "1px solid rgba(91,68,201,.5)" : "1px solid rgba(30,42,44,.10)",
      boxShadow: overlay ? "0 2px 6px rgba(22,33,31,.1), 0 22px 52px rgba(22,33,31,.28)" : E1,
      transform: overlay ? "rotate(-2deg)" : "none",
    }}>
      <span style={{ width: 26, height: 26, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, background: chipBg }}>
        <span style={{ display: "flex", color: hue }}><TypeIcon type={point.type} size={14} /></span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{point.name}</span>
        {point.groupId && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: hue }} />
            <span style={{ fontSize: 10.5, color: "var(--slate)" }}>{detail.groups.find((g) => g.id === point.groupId)?.name}</span>
          </span>
        )}
      </span>
      {trailing ?? (
        <span className="ovp" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--lupine)", background: "rgba(91,68,201,.1)", padding: "3px 7px", borderRadius: 5 }}>DRAG →</span>
      )}
    </div>
  );
}

function PoolRow({ point, detail, dimmed, onSelect }: { point: Point; detail: TripDetail; dimmed: boolean; onSelect: () => void }) {
  const { readOnly } = useEditorStore();
  // div (not button): dnd-kit attributes supply role="button"/tabIndex, and the day-menu button nests inside.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: point.id, data: { type: "poolPoint" } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onSelect} data-dimmed={dimmed || undefined}
      style={{ display: "flex", flexDirection: "column", cursor: readOnly ? "pointer" : "grab", opacity: isDragging ? 0.35 : dimmed ? 0.45 : 1, touchAction: "manipulation" }}>
      <StopCard point={point} detail={detail}
        trailing={readOnly ? <span /> : <DayMenu detail={detail} pointId={point.id} triggerLabel="＋ Day" triggerStyle={{ height: 24, padding: "0 9px", flex: "none", background: "var(--panel)", border: "1px solid rgba(30,42,44,.16)", borderRadius: 7, fontSize: 10.5, fontWeight: 700, color: "var(--slate)", fontFamily: "inherit", cursor: "pointer" }} />} />
    </div>
  );
}
