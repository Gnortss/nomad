import { Link as LinkIcon, X } from "lucide-react";
import { useSharePlaceInfo } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { useEditorStore } from "../state/editorStore";
import { TypeIcon, TYPE_LABEL } from "../components/TypeIcon";
import { PlaceSection } from "../components/PlaceSection";
import { groupColor } from "../lib/tripModel";
import { sectionHead, iconBtn, tint, RULE } from "../styles/ui";
import type { TripDetail, Point } from "../lib/types";

const STATUS_WORD: Record<string, { label: string; color: string }> = {
  idea: { label: "Idea", color: "var(--slate)" },
  to_book: { label: "To book", color: "var(--sulfur)" },
  booked: { label: "Booked", color: "var(--moss)" },
};

// Read-only counterpart of DetailPanel for the public share page: same container
// and section rhythm, but every edit control renders as plain text.
export function SharePointPanel({ detail, token }: { detail: TripDetail; token: string }) {
  const { selectedPointId } = useEditorStore();
  const p = detail.points.find((x) => x.id === selectedPointId);
  if (!p) return null;
  return <PanelBody detail={detail} point={p} token={token} />;
}

function PanelBody({ detail, point: p, token }: { detail: TripDetail; point: Point; token: string }) {
  const { selectPoint } = useEditorStore();
  const isMobile = useIsMobile();
  const placeInfo = useSharePlaceInfo(token, p.id, !!p.googlePlaceId).data;
  const stopRow = detail.dayStops.find((s) => s.pointId === p.id);
  const day = stopRow ? detail.days.find((d) => d.id === stopRow.dayId) : undefined;
  const ownGroup = p.groupId ? detail.groups.find((g) => g.id === p.groupId) : null;
  const ownHue = groupColor(detail, p.groupId);
  const status = STATUS_WORD[p.bookingStatus];

  return (
    <aside style={isMobile
      ? { position: "fixed", inset: 0, zIndex: 50, background: "var(--panel)", display: "flex", flexDirection: "column", overflowY: "auto" }
      : { width: 382, flex: "none", background: "var(--panel)", borderLeft: "1px solid rgba(30,42,44,.12)", boxShadow: "-8px 0 28px rgba(22,33,31,.08)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 14px", display: "flex", gap: 12, alignItems: "flex-start", borderBottom: RULE }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ovp" style={{ fontSize: 19, fontWeight: 800, fontFamily: "var(--font-display)" }}>{p.name}</div>
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
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
            {day ? `Day ${day.position + 1}${day.title ? ` — ${day.title}` : ""}` : "Unassigned"}
            {stopRow && !stopRow.inRoute && <span style={{ color: "var(--slate)", fontWeight: 500 }}> · off route</span>}
          </div>
        </div>
        <div>
          <div style={sectionHead}>BOOKING</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: status?.color ?? "var(--slate)" }}>{status?.label ?? p.bookingStatus}</div>
        </div>
        {p.links.length > 0 && (
          <div>
            <div style={sectionHead}>LINKS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {p.links.map((lk, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", background: "#fff", border: "1px solid rgba(30,42,44,.12)", borderRadius: 9 }}>
                  <a href={lk.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                    <LinkIcon size={13} aria-hidden style={{ flex: "none", color: "var(--slate)" }} /> <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lk.label}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
