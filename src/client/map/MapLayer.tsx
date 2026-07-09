import { useEffect, useRef } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Check } from "lucide-react";
import { daysWithStats, groupColor } from "../lib/tripModel";
import { markerStyle } from "../editor/markers";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { decodePolyline } from "./polyline";
import type { TripDetail } from "../lib/types";

const FLAG_STATUS: Record<string, { word: string; color: string }> = {
  to_book: { word: "TO BOOK", color: "#F0BF6A" },
  booked: { word: "BOOKED", color: "#7FD3A8" },
  idea: { word: "IDEA", color: "#B9C6C3" },
};

export function MapLayer({ detail }: { detail: TripDetail }) {
  const map = useMap();
  const { selectedDayId, selectDay, selectPoint, selectedPointId } = useEditorStore();
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const days = daysWithStats(detail);
  const dayOfPoint = new Map<string, string>();
  for (const d of days) for (const p of [...d.stops, ...d.attached]) dayOfPoint.set(p.id, d.id);

  // draw/redraw polylines imperatively (polylines aren't declarative in the wrapper).
  // Selected day = lupine over a white casing (Google-style); others thin out.
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    for (const d of days) {
      const route = detail.routes.find((r) => r.dayId === d.id);
      if (!route) continue;
      const selected = selectedDayId === d.id;
      const path = decodePolyline(route.polyline);
      if (selected) {
        linesRef.current.push(new google.maps.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: 0.95, strokeWeight: 9, zIndex: 1, map }));
        linesRef.current.push(new google.maps.Polyline({ path, strokeColor: "#5B44C9", strokeOpacity: 1, strokeWeight: 5, zIndex: 2, map }));
      } else {
        linesRef.current.push(new google.maps.Polyline({ path, strokeColor: "#5B44C9", strokeOpacity: selectedDayId ? 0.22 : 0.62, strokeWeight: 3.5, map }));
      }
    }
    return () => { linesRef.current.forEach((l) => l.setMap(null)); linesRef.current = []; };
  }, [map, detail.routes, selectedDayId, days]);

  return (
    <>
      {detail.points.map((p) => {
        const dayId = dayOfPoint.get(p.id) ?? null;
        const dimmed = !!selectedDayId && dayId !== selectedDayId;
        const focused = !!selectedDayId && dayId === selectedDayId;
        const selected = selectedPointId === p.id;
        const st = markerStyle({ groupColor: groupColor(detail, p.groupId), bookingStatus: p.bookingStatus, focused, dimmed, selected });
        const flag = FLAG_STATUS[p.bookingStatus];
        return (
          <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name} zIndex={st.zIndex}
            onClick={() => { if (dayId) selectDay(dayId); selectPoint(p.id); }}>
            {/* wrapper is sized so the tail tip sits at the marker's anchor (bottom-center) */}
            <div style={{ position: "relative", width: st.size, height: st.size + 8, opacity: st.opacity, filter: st.grayscale ? `grayscale(${st.grayscale})` : "none" }}>
              <div style={{
                position: "absolute", inset: `0 0 8px 0`, borderRadius: st.radius, background: st.fill,
                border: `${st.casingWidth}px ${st.casingStyle} #fff`,
                boxShadow: st.halo
                  ? "0 0 0 3px rgba(91,68,201,.5), 0 4px 10px rgba(22,33,31,.4)"
                  : "0 3px 8px rgba(22,33,31,.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <TypeIcon type={p.type} size={st.iconSize} color="#fff" />
                {st.badge === "toBook" && (
                  <span aria-hidden style={{ position: "absolute", top: -6, right: -6, width: 13, height: 13, borderRadius: "50%", background: "var(--sulfur)", border: "2px solid #fff" }} />
                )}
                {st.badge === "booked" && (
                  <span aria-hidden style={{ position: "absolute", top: -7, right: -7, width: 15, height: 15, borderRadius: "50%", background: "var(--moss)", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={8} color="#fff" strokeWidth={3.5} aria-hidden />
                  </span>
                )}
              </div>
              {/* tail: rotated square with the same fill, white-cased on the outer edges */}
              <span aria-hidden style={{
                position: "absolute", left: "50%", bottom: 4, width: 9, height: 9, marginLeft: -4.5,
                background: st.fill, borderRight: "2px solid #fff", borderBottom: "2px solid #fff",
                transform: "rotate(45deg)", boxShadow: "2px 2px 5px rgba(22,33,31,.2)",
              }} />
              {selected && flag && (
                <span style={{ position: "absolute", left: "50%", top: st.size + 12, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, padding: "4px 9px", background: "rgba(22,33,31,.88)", color: "#ECF0F0", borderRadius: 7, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {p.name}
                  <span className="mono" style={{ fontSize: 9, color: flag.color }}>{flag.word}</span>
                </span>
              )}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}
