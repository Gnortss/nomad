import { useEffect, useRef } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { daysWithStats, groupColor } from "../lib/tripModel";
import { markerStyle } from "../editor/markers";
import { TypeIcon } from "../components/TypeIcon";
import { useEditorStore } from "../state/editorStore";
import { decodePolyline } from "./polyline";
import type { TripDetail } from "../lib/types";

export function MapLayer({ detail }: { detail: TripDetail }) {
  const map = useMap();
  const { selectedDayId, selectDay, selectPoint } = useEditorStore();
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const days = daysWithStats(detail);
  const dayOfPoint = new Map<string, string>();
  for (const d of days) for (const p of [...d.stops, ...d.attached]) dayOfPoint.set(p.id, d.id);

  // draw/redraw polylines imperatively (polylines aren't declarative in the wrapper)
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    for (const d of days) {
      const route = detail.routes.find((r) => r.dayId === d.id);
      if (!route) continue;
      const selected = selectedDayId === d.id;
      const line = new google.maps.Polyline({
        path: decodePolyline(route.polyline),
        strokeColor: "#5B44C9",
        strokeOpacity: selectedDayId && !selected ? 0.22 : 0.62,
        strokeWeight: selected ? 5.5 : 3.4,
        map,
      });
      linesRef.current.push(line);
    }
    return () => { linesRef.current.forEach((l) => l.setMap(null)); linesRef.current = []; };
  }, [map, detail.routes, selectedDayId, days]);

  return (
    <>
      {detail.points.map((p) => {
        const dayId = dayOfPoint.get(p.id) ?? null;
        const dimmed = !!selectedDayId && dayId !== selectedDayId;
        const focused = !!selectedDayId && dayId === selectedDayId;
        const st = markerStyle({ groupColor: groupColor(detail, p.groupId), bookingStatus: p.bookingStatus, focused, dimmed });
        return (
          <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name}
            onClick={() => { if (dayId) selectDay(dayId); selectPoint(p.id); }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: st.fill, border: `${st.ringWidth}px ${st.ringStyle} rgba(255,255,255,.95)`, opacity: st.opacity, transform: `scale(${st.scale})`, filter: st.grayscale ? `grayscale(${st.grayscale})` : "none", display: "flex", alignItems: "center", justifyContent: "center" }}><TypeIcon type={p.type} size={16} color="#fff" /></div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}
