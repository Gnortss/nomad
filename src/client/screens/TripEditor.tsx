import { useParams } from "react-router-dom";
import { useTrip } from "../lib/api";
import { EditorStoreProvider, useEditorStore } from "../state/editorStore";
import { MapCanvas } from "../map/MapCanvas";
import { MapLayer } from "../map/MapLayer";
import { DayRail } from "../editor/DayRail";
import { Pool } from "../editor/Pool";
import { DetailPanel } from "../editor/DetailPanel";
import { TopBar } from "../editor/TopBar";
import { formatDistance, formatDuration } from "../lib/format";
import type { TripDetail } from "../lib/types";

function EditorBody({ detail }: { detail: TripDetail }) {
  const { selectedPointId } = useEditorStore();
  const s = detail.stats;
  const stats = `${formatDistance(s.totalDistanceM)} · ${formatDuration(s.totalDurationS)}` + (s.totalFuel != null ? ` · €${Math.round(s.totalFuel)} fuel` : "");
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
      <TopBar tripName={detail.trip.name} stats={stats} onShare={() => { /* wired in Task 13 */ }} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#F4F6F6", borderRight: "1px solid rgba(87,103,107,.18)" }}>
          <DayRail detail={detail} />
          <Pool detail={detail} />
        </aside>
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <MapCanvas />
          <MapLayer detail={detail} />
        </main>
        {selectedPointId && <DetailPanel detail={detail} />}
      </div>
    </div>
  );
}

export function TripEditorScreen() {
  const { id } = useParams();
  const { data, isPending } = useTrip(id!);
  if (isPending || !data) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return <EditorStoreProvider><EditorBody detail={data} /></EditorStoreProvider>;
}
