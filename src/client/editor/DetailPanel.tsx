import { useState } from "react";
import { Check, Link as LinkIcon, X } from "lucide-react";
import { usePatchPoint, useDeletePoint, useToggleStopRoute, useCreateGroup, usePlaceInfo } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { useEditorStore } from "../state/editorStore";
import { TypeIcon, TYPE_LABEL } from "../components/TypeIcon";
import { PlaceSection } from "../components/PlaceSection";
import { groupColor } from "../lib/tripModel";
import { DayMenu } from "./DayMenu";
import { sectionHead, dashedAction, iconBtn, tint, FIELD_BORDER, RULE, GROUP_HUES, btnQuietDestructive } from "../styles/ui";
import type { TripDetail, Point } from "../lib/types";

const STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "idea", label: "Idea", color: "var(--slate)" },
  { key: "to_book", label: "To book", color: "var(--sulfur)" },
  { key: "booked", label: "Booked", color: "var(--moss)" },
];

export function DetailPanel({ detail }: { detail: TripDetail }) {
  const { selectedPointId } = useEditorStore();
  const p = detail.points.find((x) => x.id === selectedPointId);
  if (!p) return null;
  // key resets all field drafts when the selection changes.
  return <PointEditor key={p.id} detail={detail} point={p} />;
}

function PointEditor({ detail, point: p }: { detail: TripDetail; point: Point }) {
  const { selectPoint } = useEditorStore();
  const placeInfo = usePlaceInfo(p.id, !!p.googlePlaceId).data;
  const isMobile = useIsMobile();
  const patch = usePatchPoint(detail.trip.id);
  const del = useDeletePoint(detail.trip.id);
  const toggleRoute = useToggleStopRoute(detail.trip.id);
  const createGroup = useCreateGroup(detail.trip.id);
  const stopRow = detail.dayStops.find((s) => s.pointId === p.id);
  // Local drafts: every PATCH invalidates the trip query, and the refetch would
  // clobber controlled inputs mid-edit without them.
  const [name, setName] = useState(p.name);
  const [notes, setNotes] = useState(p.notes ?? "");
  const [cost, setCost] = useState(p.estCost != null ? String(p.estCost) : "");
  const [addingLink, setAddingLink] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupHue, setGroupHue] = useState(GROUP_HUES[0]);
  const [groupScope, setGroupScope] = useState(""); // "" = trip-wide, else dayId

  const ownGroup = p.groupId ? detail.groups.find((g) => g.id === p.groupId) : null;
  const ownHue = groupColor(detail, p.groupId);

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
  async function createNewGroup() {
    const name = groupName.trim();
    if (!name) return;
    const g = await createGroup.mutateAsync({ name, color: groupHue, dayId: groupScope || null });
    patch.mutate({ id: p.id, body: { groupId: g.id } });
    setAddingGroup(false); setGroupName(""); setGroupScope("");
  }
  async function onDelete() {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    await del.mutateAsync(p.id);
    selectPoint(null);
  }

  const fieldStyle: React.CSSProperties = { background: "#fff", border: FIELD_BORDER, borderRadius: 9, fontSize: 12.5, fontFamily: "inherit", boxShadow: "inset 0 1px 2px rgba(22,33,31,.04)" };

  return (
    <aside style={isMobile
      ? { position: "fixed", inset: 0, zIndex: 50, background: "var(--panel)", display: "flex", flexDirection: "column", overflowY: "auto" }
      : { width: 382, flex: "none", background: "var(--panel)", borderLeft: "1px solid rgba(30,42,44,.12)", boxShadow: "-8px 0 28px rgba(22,33,31,.08)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 14px", display: "flex", gap: 12, alignItems: "flex-start", borderBottom: RULE }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="Stop name" className="ovp"
            style={{ width: "100%", margin: 0, padding: "0 0 1px", fontSize: 19, fontWeight: 800, fontFamily: "var(--font-display)", color: "inherit", background: "transparent", border: "none", borderBottom: "1.5px dashed rgba(87,103,107,.45)", outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--slate)", marginTop: 6 }}>
            <TypeIcon type={p.type} size={14} /> {TYPE_LABEL[p.type] ?? p.type}
            {ownGroup && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 8, padding: "2px 8px", borderRadius: 14, background: ownGroup.color ? tint(ownGroup.color, 0.1) : "rgba(22,33,31,.08)", border: `1px solid ${ownGroup.color ? tint(ownGroup.color, 0.3) : "rgba(22,33,31,.2)"}`, fontSize: 10.5, fontWeight: 700, color: ownHue }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: ownHue }} />
                {ownGroup.name}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => selectPoint(null)} aria-label="Close details" style={{ ...iconBtn(30), borderRadius: 9 }}><X size={14} aria-hidden /></button>
      </div>
      <div style={{ padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <PlaceSection point={p} info={placeInfo} />
        <div>
          <div style={sectionHead}>DAY</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <DayMenu detail={detail} pointId={p.id} />
            {stopRow && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={stopRow.inRoute} style={{ width: 15, height: 15 }}
                  onChange={(e) => toggleRoute.mutate({ dayId: stopRow.dayId, pointId: p.id, inRoute: e.target.checked })} />
                On route
              </label>
            )}
          </div>
        </div>
        <div>
          <div style={sectionHead}>TYPE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.keys(TYPE_LABEL).map((t) => {
              const active = p.type === t;
              return (
                <button key={t} onClick={() => !active && patch.mutate({ id: p.id, body: { type: t } })}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontFamily: "inherit", border: `1px solid ${active ? "var(--lupine)" : "rgba(30,42,44,.16)"}`, background: active ? "var(--lupine)" : "#fff", color: active ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: active ? 700 : 600, cursor: "pointer" }}>
                  <TypeIcon type={t} size={11} />{TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={sectionHead}>GROUP</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button onClick={() => p.groupId && patch.mutate({ id: p.id, body: { groupId: null } })}
              style={{ padding: "4px 10px", borderRadius: 20, fontFamily: "inherit", border: `1px solid ${!p.groupId ? "var(--lupine)" : "rgba(30,42,44,.16)"}`, background: !p.groupId ? "var(--lupine)" : "#fff", color: !p.groupId ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: !p.groupId ? 700 : 600, cursor: "pointer" }}>
              No group
            </button>
            {detail.groups.map((g) => {
              const active = p.groupId === g.id;
              const hue = g.color ?? "var(--basalt)";
              const day = g.dayId ? detail.days.find((d) => d.id === g.dayId) : null;
              return (
                <button key={g.id} onClick={() => !active && patch.mutate({ id: p.id, body: { groupId: g.id } })}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontFamily: "inherit", fontSize: 11, cursor: "pointer",
                    border: `1px solid ${active ? hue : "rgba(30,42,44,.16)"}`,
                    background: active && g.color ? tint(g.color, 0.1) : "#fff",
                    color: active ? hue : "var(--ink)",
                    fontWeight: active ? 700 : 600,
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2.5, background: hue }} />
                  {g.name}{day ? ` · Day ${day.position + 1}` : ""}
                </button>
              );
            })}
            <button onClick={() => setAddingGroup(true)} style={{ ...dashedAction, padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>
              + New group
            </button>
          </div>
          {addingGroup && (
            <div style={{ marginTop: 10, padding: 12, background: "#fff", border: "1px solid rgba(91,68,201,.3)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" aria-label="Group name"
                style={{ ...fieldStyle, height: 32, padding: "0 11px" }} />
              <div style={{ display: "flex", gap: 7 }}>
                {GROUP_HUES.map((c) => (
                  <button key={c} aria-label={`Color ${c}`} onClick={() => setGroupHue(c)}
                    style={{ width: 24, height: 24, borderRadius: 7, background: c, border: "none", cursor: "pointer", boxShadow: groupHue === c ? "0 0 0 2px #fff, 0 0 0 4px var(--basalt)" : "none" }} />
                ))}
              </div>
              <select value={groupScope} onChange={(e) => setGroupScope(e.target.value)} aria-label="Group scope"
                style={{ ...fieldStyle, height: 32, padding: "0 9px" }}>
                <option value="">Trip-wide</option>
                {[...detail.days].sort((a, b) => a.position - b.position).map((d) => (
                  <option key={d.id} value={d.id}>Day {d.position + 1}{d.title ? ` — ${d.title}` : ""}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={createNewGroup} style={{ height: 30, padding: "0 14px", background: "var(--basalt)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>Create</button>
                <button onClick={() => { setAddingGroup(false); setGroupName(""); setGroupScope(""); }} style={{ height: 30, padding: "0 14px", background: "rgba(87,103,107,.10)", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={sectionHead}>BOOKING</div>
          <div style={{ display: "flex", border: FIELD_BORDER, borderRadius: 9, overflow: "hidden", background: "#fff" }}>
            {STATUSES.map((s, i) => {
              const active = p.bookingStatus === s.key;
              return (
                <button key={s.key} onClick={() => patch.mutateAsync({ id: p.id, body: { bookingStatus: s.key } })}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 4px", fontSize: 12.5, fontFamily: "inherit", border: "none", borderLeft: i > 0 && !active ? RULE : "none", cursor: "pointer", background: active ? s.color : "#fff", color: active ? "#fff" : "var(--slate)", fontWeight: active ? 700 : 600 }}>
                  {active && s.key === "booked" && <Check size={10} strokeWidth={3.5} aria-hidden />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={sectionHead}>EST. COST</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="mono" type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} onBlur={() => commitCost(p.costBasis)}
              placeholder="—" aria-label="Estimated cost"
              style={{ ...fieldStyle, width: 100, height: 34, padding: "0 11px", fontSize: 14, fontWeight: 600 }} />
            <select value={p.costBasis ?? ""} onChange={(e) => commitCost(e.target.value || null)} aria-label="Cost basis"
              style={{ ...fieldStyle, flex: 1, height: 34, padding: "0 9px" }}>
              <option value="">total</option>
              <option value="per_night">per night</option>
              <option value="per_person">per person</option>
            </select>
          </div>
        </div>
        <div>
          <div style={sectionHead}>NOTES</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} placeholder="No notes yet." aria-label="Notes"
            style={{ ...fieldStyle, width: "100%", fontSize: 12.5, lineHeight: 1.55, padding: "11px 12px", minHeight: 56, resize: "vertical", boxShadow: "none", border: "1px solid rgba(30,42,44,.12)" }} />
        </div>
        <div>
          <div style={sectionHead}>LINKS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.links.map((lk, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", background: "#fff", border: "1px solid rgba(30,42,44,.12)", borderRadius: 9 }}>
                <a href={lk.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                  <LinkIcon size={13} aria-hidden style={{ flex: "none", color: "var(--slate)" }} /> <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lk.label}</span>
                </a>
                <button onClick={() => removeLink(i)} aria-label={`Remove link ${lk.label}`} style={{ ...iconBtn(18), borderRadius: 5 }}><X size={9} aria-hidden /></button>
              </div>
            ))}
            {addingLink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label" aria-label="Link label"
                  style={{ ...fieldStyle, height: 32, padding: "0 11px" }} />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" aria-label="Link URL"
                  style={{ ...fieldStyle, height: 32, padding: "0 11px" }} />
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={addLink} style={{ height: 30, padding: "0 14px", background: "var(--basalt)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setAddingLink(false); setLinkLabel(""); setLinkUrl(""); }} style={{ height: 30, padding: "0 14px", background: "rgba(87,103,107,.10)", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: "var(--ink)", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingLink(true)} style={{ ...dashedAction, alignSelf: "flex-start" }}>+ Add link</button>
            )}
          </div>
        </div>
        <div style={{ borderTop: RULE, paddingTop: 11 }}>
          <button onClick={onDelete} style={{ ...btnQuietDestructive, fontSize: 12.5 }}>Delete stop</button>
        </div>
      </div>
    </aside>
  );
}
