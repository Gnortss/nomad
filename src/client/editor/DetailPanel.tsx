import { usePatchPoint } from "../lib/api";
import { useEditorStore } from "../state/editorStore";
import { formatCost } from "../lib/format";
import { groupColor } from "../lib/tripModel";
import type { TripDetail } from "../lib/types";

const TYPE_LABEL: Record<string, string> = { camp: "Campsite", wildcamp: "Wild camp", hostel: "Hostel", hotel: "Hotel / apartment", poi: "Point of interest", fuel: "Fuel stop", food: "Food", viewpoint: "Viewpoint", activity: "Activity", other: "Other" };
const STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "idea", label: "Idea", color: "var(--slate)" },
  { key: "to_book", label: "To book", color: "var(--sulfur)" },
  { key: "booked", label: "Booked", color: "var(--moss)" },
];

export function DetailPanel({ detail }: { detail: TripDetail }) {
  const { selectedPointId, selectPoint } = useEditorStore();
  const patch = usePatchPoint(detail.trip.id);
  const p = detail.points.find((x) => x.id === selectedPointId);
  if (!p) return null;

  return (
    <aside style={{ width: 382, flex: "none", background: "#F4F6F6", borderLeft: "1px solid rgba(87,103,107,.18)", boxShadow: "-8px 0 28px rgba(30,42,44,.08)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 18px 16px", display: "flex", gap: 13, alignItems: "flex-start", borderBottom: "1px solid rgba(87,103,107,.16)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
          <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>{TYPE_LABEL[p.type] ?? p.type}</div>
        </div>
        <button onClick={() => selectPoint(null)} aria-label="Close details" style={{ width: 30, height: 30, flex: "none", border: "none", background: "rgba(87,103,107,.12)", borderRadius: 7, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>GROUP</div>
          {p.groupId ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 7, border: "1px solid rgba(87,103,107,.2)" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor(detail, p.groupId) }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{detail.groups.find((g) => g.id === p.groupId)?.name}</span>
            </div>
          ) : <span style={{ fontSize: 13, color: "var(--slate)" }}>No group</span>}
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>BOOKING</div>
          <div style={{ display: "flex", border: "1px solid rgba(87,103,107,.28)", borderRadius: 8, overflow: "hidden" }}>
            {STATUSES.map((s) => {
              const active = p.bookingStatus === s.key;
              return (
                <button key={s.key} onClick={() => patch.mutateAsync({ id: p.id, body: { bookingStatus: s.key } })}
                  style={{ flex: 1, padding: "7px 4px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", background: active ? s.color : "#fff", color: active ? "#fff" : "var(--slate)" }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>EST. COST</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{formatCost(p.estCost, p.costBasis, detail.trip.currency)}</div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>NOTES</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, background: "#fff", border: "1px solid rgba(87,103,107,.22)", borderRadius: 8, padding: "11px 12px", minHeight: 56 }}>{p.notes ?? "No notes yet."}</div>
        </div>
        <div>
          <div className="ovp" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 }}>LINKS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.links.map((lk, i) => (
              <a key={i} href={lk.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 11px", background: "#fff", border: "1px solid rgba(87,103,107,.22)", borderRadius: 7 }}>
                🔗 <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lk.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
