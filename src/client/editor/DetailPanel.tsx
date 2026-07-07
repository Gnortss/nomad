import { useState } from "react";
import { usePatchPoint, useDeletePoint } from "../lib/api";
import { useEditorStore } from "../state/editorStore";
import { TYPE_ICON } from "../lib/format";
import { groupColor } from "../lib/tripModel";
import { DayMenu } from "./DayMenu";
import type { TripDetail, Point } from "../lib/types";

const TYPE_LABEL: Record<string, string> = { camp: "Campsite", wildcamp: "Wild camp", hostel: "Hostel", hotel: "Hotel / apartment", poi: "Point of interest", fuel: "Fuel stop", food: "Food", viewpoint: "Viewpoint", activity: "Activity", other: "Other" };
const STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "idea", label: "Idea", color: "var(--slate)" },
  { key: "to_book", label: "To book", color: "var(--sulfur)" },
  { key: "booked", label: "Booked", color: "var(--moss)" },
];
const SECTION_HEAD: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--slate)", marginBottom: 7 };
const FIELD_BORDER = "1px solid rgba(87,103,107,.22)";

export function DetailPanel({ detail }: { detail: TripDetail }) {
  const { selectedPointId } = useEditorStore();
  const p = detail.points.find((x) => x.id === selectedPointId);
  if (!p) return null;
  // key resets all field drafts when the selection changes.
  return <PointEditor key={p.id} detail={detail} point={p} />;
}

function PointEditor({ detail, point: p }: { detail: TripDetail; point: Point }) {
  const { selectPoint } = useEditorStore();
  const patch = usePatchPoint(detail.trip.id);
  const del = useDeletePoint(detail.trip.id);
  // Local drafts: every PATCH invalidates the trip query, and the refetch would
  // clobber controlled inputs mid-edit without them.
  const [name, setName] = useState(p.name);
  const [notes, setNotes] = useState(p.notes ?? "");
  const [cost, setCost] = useState(p.estCost != null ? String(p.estCost) : "");
  const [addingLink, setAddingLink] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  function commitName() {
    const v = name.trim();
    if (v && v !== p.name) patch.mutate({ id: p.id, body: { name: v } });
    else setName(p.name);
  }
  function commitNotes() {
    if (notes !== (p.notes ?? "")) patch.mutate({ id: p.id, body: { notes: notes || null } });
  }
  function commitCost(basis: string | null) {
    const estCost = cost.trim() === "" ? null : Number(cost);
    if (estCost != null && Number.isNaN(estCost)) { setCost(p.estCost != null ? String(p.estCost) : ""); return; }
    if (estCost !== p.estCost || basis !== p.costBasis) patch.mutate({ id: p.id, body: { estCost, costBasis: basis } });
  }
  function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    patch.mutate({ id: p.id, body: { links: [...p.links, { label: linkLabel.trim() || url, url }] } });
    setAddingLink(false); setLinkLabel(""); setLinkUrl("");
  }
  function removeLink(i: number) {
    patch.mutate({ id: p.id, body: { links: p.links.filter((_, idx) => idx !== i) } });
  }
  async function onDelete() {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    await del.mutateAsync(p.id);
    selectPoint(null);
  }

  return (
    <aside style={{ width: 382, flex: "none", background: "#F4F6F6", borderLeft: "1px solid rgba(87,103,107,.18)", boxShadow: "-8px 0 28px rgba(30,42,44,.08)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 16px", display: "flex", gap: 13, alignItems: "flex-start", borderBottom: "1px solid rgba(87,103,107,.16)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="Stop name"
            style={{ width: "100%", margin: 0, padding: 0, fontSize: 18, fontWeight: 700, fontFamily: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed rgba(87,103,107,.35)", outline: "none" }} />
          <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>{TYPE_ICON[p.type] ?? ""} {TYPE_LABEL[p.type] ?? p.type}</div>
        </div>
        <button onClick={() => selectPoint(null)} aria-label="Close details" style={{ width: 30, height: 30, flex: "none", border: "none", background: "rgba(87,103,107,.12)", borderRadius: 7, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="ovp" style={SECTION_HEAD}>DAY</div>
          <DayMenu detail={detail} pointId={p.id} />
        </div>
        <div>
          <div className="ovp" style={SECTION_HEAD}>TYPE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.keys(TYPE_LABEL).map((t) => {
              const active = p.type === t;
              return (
                <button key={t} onClick={() => !active && patch.mutate({ id: p.id, body: { type: t } })}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 20, border: `1px solid ${active ? "var(--lupine)" : "rgba(87,103,107,.28)"}`, background: active ? "var(--lupine)" : "#fff", color: active ? "#fff" : "var(--basalt)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  <span>{TYPE_ICON[t]}</span>{TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="ovp" style={SECTION_HEAD}>GROUP</div>
          {p.groupId ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 7, border: "1px solid rgba(87,103,107,.2)" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor(detail, p.groupId) }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{detail.groups.find((g) => g.id === p.groupId)?.name}</span>
            </div>
          ) : <span style={{ fontSize: 13, color: "var(--slate)" }}>No group</span>}
        </div>
        <div>
          <div className="ovp" style={SECTION_HEAD}>BOOKING</div>
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
          <div className="ovp" style={SECTION_HEAD}>EST. COST</div>
          <div style={{ display: "flex", gap: 7 }}>
            <input className="mono" type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} onBlur={() => commitCost(p.costBasis)}
              placeholder="—" aria-label="Estimated cost"
              style={{ width: 110, height: 34, padding: "0 10px", fontSize: 14, fontWeight: 600, background: "#fff", border: FIELD_BORDER, borderRadius: 7 }} />
            <select value={p.costBasis ?? ""} onChange={(e) => commitCost(e.target.value || null)} aria-label="Cost basis"
              style={{ flex: 1, height: 34, padding: "0 8px", fontSize: 12.5, background: "#fff", border: FIELD_BORDER, borderRadius: 7 }}>
              <option value="">total</option>
              <option value="per_night">per night</option>
              <option value="per_person">per person</option>
            </select>
          </div>
        </div>
        <div>
          <div className="ovp" style={SECTION_HEAD}>NOTES</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} placeholder="No notes yet." aria-label="Notes"
            style={{ width: "100%", fontSize: 13, lineHeight: 1.55, fontFamily: "inherit", background: "#fff", border: FIELD_BORDER, borderRadius: 8, padding: "11px 12px", minHeight: 56, resize: "vertical" }} />
        </div>
        <div>
          <div className="ovp" style={SECTION_HEAD}>LINKS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.links.map((lk, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: "#fff", border: FIELD_BORDER, borderRadius: 7 }}>
                <a href={lk.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  🔗 <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lk.label}</span>
                </a>
                <button onClick={() => removeLink(i)} aria-label={`Remove link ${lk.label}`} style={{ flex: "none", width: 20, height: 20, border: "none", background: "rgba(87,103,107,.12)", borderRadius: 5, fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {addingLink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label" aria-label="Link label"
                  style={{ height: 30, padding: "0 10px", fontSize: 12.5, background: "#fff", border: FIELD_BORDER, borderRadius: 7 }} />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" aria-label="Link URL"
                  style={{ height: 30, padding: "0 10px", fontSize: 12.5, background: "#fff", border: FIELD_BORDER, borderRadius: 7 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addLink} style={{ height: 28, padding: "0 12px", background: "var(--basalt)", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setAddingLink(false); setLinkLabel(""); setLinkUrl(""); }} style={{ height: 28, padding: "0 12px", background: "rgba(87,103,107,.12)", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingLink(true)} style={{ alignSelf: "flex-start", padding: "5px 10px", background: "transparent", border: "1px dashed rgba(87,103,107,.35)", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "var(--slate)", cursor: "pointer" }}>+ Add link</button>
            )}
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(87,103,107,.16)", paddingTop: 12 }}>
          <button onClick={onDelete} style={{ padding: "6px 0", background: "transparent", border: "none", fontSize: 12.5, fontWeight: 600, color: "#a33", cursor: "pointer" }}>Delete stop</button>
        </div>
      </div>
    </aside>
  );
}
