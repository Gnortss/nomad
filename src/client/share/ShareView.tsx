import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { DndContext, useSensors } from "@dnd-kit/core";
import { getShare } from "../lib/api";
import { formatDistance, formatDuration } from "../lib/format";
import { useIsMobile } from "../lib/useIsMobile";
import { BottomSheet } from "../components/BottomSheet";
import { MapCanvas } from "../map/MapCanvas";
import { MapCamera } from "../map/MapCamera";
import { MapLayer } from "../map/MapLayer";
import { DayRail } from "../editor/DayRail";
import { Pool } from "../editor/Pool";
import { EditorStoreProvider, useEditorStore } from "../state/editorStore";
import { daysWithStats } from "../lib/tripModel";
import { contour, BORDER } from "../styles/ui";
import { SharePointPanel } from "./SharePointPanel";
import { shareToTripDetail, type SharePayload } from "./shareModel";
import type { TripDetail } from "../lib/types";

export function ShareView() {
  const { token } = useParams();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { getShare(token!).then((p) => setPayload(p as SharePayload)).catch(() => setError(true)); }, [token]);
  // Memoized so MapLayer's polyline-redraw effect isn't retriggered by a fresh routes array every render.
  const detail = useMemo(() => (payload ? shareToTripDetail(payload) : null), [payload]);

  if (error) return <div style={{ padding: 24 }}>This link is no longer available.</div>;
  if (!detail) return <div className="mono" style={{ padding: 24 }}>Loading…</div>;

  return (
    <EditorStoreProvider readOnly>
      <ShareBody detail={detail} token={token!} />
    </EditorStoreProvider>
  );
}

// Same shell as the trip editor, minus every edit affordance: no drag & drop
// (DndContext gets zero sensors — the rail/pool rows' dnd hooks still need the
// context to exist), no AI chat, and the read-only stop panel instead of the editor.
function ShareBody({ detail, token }: { detail: TripDetail; token: string }) {
  const { selectedPointId, selectedDayId } = useEditorStore();
  const isMobile = useIsMobile();
  const sensors = useSensors();
  const routeDays = daysWithStats(detail);
  const stats = `${formatDistance(detail.stats.totalDistanceM)} · ${formatDuration(detail.stats.totalDurationS)}`;

  // Selected-day badge docked top-left on the map, as in the editor.
  const selDay = selectedDayId ? routeDays.find((d) => d.id === selectedDayId) : undefined;

  const mapMain = (
    <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
      <MapCanvas>
        <MapCamera detail={detail} />
        <MapLayer detail={detail} />
      </MapCanvas>
      {selDay && (
        <div style={{ position: "absolute", left: 14, top: 14, pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(255,255,255,.95)", border: BORDER, borderRadius: 10, boxShadow: "0 2px 8px rgba(22,33,31,.12)" }}>
            <span className="ovp" style={{ width: 20, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--lupine)", color: "#fff", borderRadius: 6, fontWeight: 800, fontSize: 11 }}>{selDay.position + 1}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink)", textTransform: "uppercase" }}>
              {selDay.title ?? `Day ${selDay.position + 1}`}{selDay.distanceM != null && ` · ${formatDistance(selDay.distanceM)} · ${formatDuration(selDay.durationS!)}`}
            </span>
          </div>
        </div>
      )}
    </main>
  );

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
        <header style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 13, padding: "0 16px", background: "var(--basalt)", color: "#ECF0F0", ...contour("90% -80%") }}>
          <span aria-hidden style={{ width: 10, height: 10, flex: "none", background: "var(--lupine)", borderRadius: 3 }} />
          <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 14 }}>NOMAD</span>
          <span style={{ opacity: 0.35 }}>›</span>
          <span style={{ fontWeight: 600, fontSize: 13.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.trip.name}</span>
          {!isMobile && <span className="mono" style={{ marginLeft: 10, fontSize: 11.5, color: "#8FA3A0", textTransform: "uppercase", whiteSpace: "nowrap" }}>{stats}</span>}
          <div style={{ flex: 1 }} />
          <span style={{ flex: "none", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 12, background: "rgba(236,240,240,.14)", color: "#B9C6C3" }}>VIEW ONLY</span>
        </header>
        <DndContext sensors={sensors}>
          {isMobile ? (
            <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
              {mapMain}
              <BottomSheet header={
                <div className="mono" style={{ textAlign: "center", fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", paddingTop: 5 }}>{stats}</div>
              }>
                <DayRail detail={detail} />
                <Pool detail={detail} />
              </BottomSheet>
              {selectedPointId && <SharePointPanel detail={detail} token={token} />}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
              <aside style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#F4F6F6", borderRight: "1px solid rgba(87,103,107,.18)" }}>
                <DayRail detail={detail} />
                <Pool detail={detail} />
              </aside>
              {mapMain}
              {selectedPointId && <SharePointPanel detail={detail} token={token} />}
            </div>
          )}
        </DndContext>
      </div>
    </APIProvider>
  );
}
