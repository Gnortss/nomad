import { useState } from "react";
import { useParams } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { LoaderCircle } from "lucide-react";
import { useTrip, useMoveStop, useCreatePoint } from "../lib/api";
import { EditorStoreProvider, useEditorStore } from "../state/editorStore";
import { MapCanvas } from "../map/MapCanvas";
import { MapCamera } from "../map/MapCamera";
import { MapLayer } from "../map/MapLayer";
import { DayRail } from "../editor/DayRail";
import { Pool, StopCard } from "../editor/Pool";
import { DetailPanel } from "../editor/DetailPanel";
import { ChatPanel } from "../editor/ChatPanel";
import { TopBar } from "../editor/TopBar";
import { ShareDialog } from "../editor/ShareDialog";
import { EmptyTrip } from "../editor/states";
import { computeDrop, resolveDrop, type OverInfo } from "../editor/assign";
import { routeStopsForDay } from "../lib/tripModel";
import { formatDistance, formatDuration } from "../lib/format";
import type { TripDetail } from "../lib/types";

// Day containers geometrically contain their stop rows, so prioritize: stop rows
// first (precise insertion), then day containers (append), then a rect fallback
// for fast pointer movement.
const collisionDetection: CollisionDetection = (args) => {
  const stops = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "dayStop") });
  if (stops.length) return stops;
  const days = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "day") });
  if (days.length) return days;
  return rectIntersection(args);
};

function EditorBody({ detail }: { detail: TripDetail }) {
  const { selectedPointId, droppingPin, cancelDropPin, selectDay, expandDay, aiBusy } = useEditorStore();
  const [shareOpen, setShareOpen] = useState(false);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const activePoint = activePointId ? detail.points.find((p) => p.id === activePointId) : undefined;
  const moveStop = useMoveStop(detail.trip.id);
  // Distance constraint so a plain click on a draggable row still fires onClick (select).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const createPoint = useCreatePoint(detail.trip.id);
  const s = detail.stats;
  // Fuel-cost stat is meaningless for an EV (it's computed from l/100km).
  const stats = `${formatDistance(s.totalDistanceM)} · ${formatDuration(s.totalDurationS)}` +
    (s.totalFuel != null && detail.trip.vehicle !== "ev" ? ` · €${Math.round(s.totalFuel)} fuel` : "");

  function onDragStart(e: DragStartEvent) {
    setActivePointId(e.active.id as string);
  }

  // Expand the hovered day mid-drag so the user can aim at an exact slot, and
  // select it so the map highlight follows the drag. Both reducers bail out
  // when already applied, so repeated dragOver events don't rerender.
  function onDragOver(e: DragOverEvent) {
    const overDayId = (e.over?.data.current?.dayId as string | undefined) ?? (e.over?.id as string | undefined);
    if (overDayId && detail.days.some((d) => d.id === overDayId)) { expandDay(overDayId); selectDay(overDayId); }
  }

  // Drop: resolve target day + insertion index (stop row = insert before it, day
  // container = append), then rewrite the affected day orders.
  function onDragEnd(e: DragEndEvent) {
    setActivePointId(null);
    if (!e.over) return;
    const pointId = String(e.active.id);
    const drop = resolveDrop(pointId, { id: String(e.over.id), data: e.over.data.current as OverInfo["data"] }, detail);
    if (!drop) return;
    const current = routeStopsForDay(detail, drop.toDayId).map((p) => p.id);
    const toPointIds = computeDrop(current, pointId, drop.toIndex);
    if (drop.fromDayId === drop.toDayId && toPointIds.join() === current.join()) return; // no-op reorder
    const fromPointIds = drop.fromDayId ? routeStopsForDay(detail, drop.fromDayId).map((p) => p.id).filter((id) => id !== pointId) : [];
    moveStop.mutate({ fromDayId: drop.fromDayId, fromPointIds, toDayId: drop.toDayId, toPointIds });
  }

  // Drop-pin mode: the next map click creates a user-sourced point in the pool.
  function onMapClick(latLng: { lat: number; lng: number }) {
    if (!droppingPin) return;
    createPoint.mutate({ name: "New stop", lat: latLng.lat, lng: latLng.lng, coordSource: "user" });
    cancelDropPin();
  }

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
        <TopBar trip={detail.trip} stats={stats} onShare={() => setShareOpen(true)} />
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActivePointId(null)}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}>
          <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
            <aside style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#F4F6F6", borderRight: "1px solid rgba(87,103,107,.18)" }}>
              <DayRail detail={detail} />
              <Pool detail={detail} />
            </aside>
            <main style={{ flex: 1, position: "relative", minWidth: 0, cursor: droppingPin ? "crosshair" : "auto" }}>
              <MapCanvas onMapClick={onMapClick}>
                <MapCamera detail={detail} />
                <MapLayer detail={detail} />
              </MapCanvas>
              {detail.points.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  {aiBusy ? (
                    <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", background: "rgba(255,255,255,.94)", border: "1px solid rgba(91,68,201,.3)", borderRadius: 10, boxShadow: "0 8px 28px rgba(30,42,44,.16)" }}>
                      <LoaderCircle className="ai-spinner" size={20} color="var(--lupine)" aria-hidden />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>The AI is planning your trip…</div>
                        <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 2 }}>Days and stops appear on the map as they're ready — follow along in the chat.</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ pointerEvents: "auto", background: "rgba(255,255,255,.92)", border: "1px solid rgba(87,103,107,.2)", borderRadius: 10, boxShadow: "0 8px 28px rgba(30,42,44,.16)" }}>
                      <EmptyTrip />
                    </div>
                  )}
                </div>
              )}
              {droppingPin && (
                <div style={{ position: "absolute", left: 16, top: 14, display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(255,255,255,.92)", border: "1px solid rgba(87,103,107,.2)", borderRadius: 8, boxShadow: "0 2px 8px rgba(30,42,44,.1)", fontSize: 12, fontWeight: 500 }}>
                  Click the map to place a stop
                  <button onClick={cancelDropPin} style={{ border: "none", background: "rgba(87,103,107,.14)", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                </div>
              )}
            </main>
            {selectedPointId && <DetailPanel detail={detail} />}
            <ChatPanel tripId={detail.trip.id} />
          </div>
          <DragOverlay>
            {activePoint && <div style={{ width: 320 }}><StopCard point={activePoint} detail={detail} /></div>}
          </DragOverlay>
        </DndContext>
        {shareOpen && <ShareDialog tripId={detail.trip.id} onClose={() => setShareOpen(false)} />}
      </div>
    </APIProvider>
  );
}

export function TripEditorScreen() {
  const { id } = useParams();
  const { data, isPending } = useTrip(id!);
  if (isPending || !data) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return <EditorStoreProvider><EditorBody detail={data} /></EditorStoreProvider>;
}
