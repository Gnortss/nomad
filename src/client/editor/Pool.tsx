import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { pooledPoints, groupColor } from "../lib/tripModel";
import { useEditorStore } from "../state/editorStore";
import { AddStop } from "./AddStop";
import type { TripDetail, Point } from "../lib/types";

export function Pool({ detail }: { detail: TripDetail }) {
  const { selectPoint, startDropPin, droppingPin } = useEditorStore();
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  let pool = pooledPoints(detail);
  if (filterGroup) pool = pool.filter((p) => p.groupId === filterGroup);

  return (
    <div style={{ flex: "none", maxHeight: 270, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(87,103,107,.18)", background: "#EDF1F0" }}>
      <div style={{ padding: "12px 16px 8px" }}>
        <div className="ovp" style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".14em", color: "var(--slate)" }}>UNASSIGNED</div>
        <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
          <AddStop tripId={detail.trip.id} />
          <button onClick={startDropPin} style={{ height: 32, padding: "0 12px", background: droppingPin ? "var(--lupine)" : "#fff", color: droppingPin ? "#fff" : "inherit", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>📍 Drop a pin</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {detail.groups.map((g) => (
            <button key={g.id} onClick={() => setFilterGroup(filterGroup === g.id ? null : g.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 20, border: `1px solid ${filterGroup === g.id ? "var(--lupine)" : "transparent"}`, background: "transparent", cursor: "pointer" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color ?? "var(--basalt)" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: g.color ?? "var(--basalt)" }}>{g.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {pool.map((p) => (
          <PoolRow key={p.id} point={p} detail={detail} onSelect={() => selectPoint(p.id)} />
        ))}
      </div>
    </div>
  );
}

function PoolRow({ point, detail, onSelect }: { point: Point; detail: TripDetail; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: point.id });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={onSelect}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", border: "1px solid rgba(87,103,107,.2)", borderRadius: 9, background: "#F8FAFA", textAlign: "left", cursor: "grab" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{point.name}</span>
        {point.groupId && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: groupColor(detail, point.groupId) }} />
            <span style={{ fontSize: 10.5, color: "var(--slate)" }}>{detail.groups.find((g) => g.id === point.groupId)?.name}</span>
          </span>
        )}
      </span>
      <span className="ovp" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--slate)", opacity: .8 }}>DRAG →</span>
    </button>
  );
}
