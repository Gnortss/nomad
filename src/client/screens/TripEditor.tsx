import { useState } from "react";
import { useParams } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { MapPin } from "lucide-react";
import { useTrip, useMoveStop, useAttachStop, useCreatePoint } from "../lib/api";
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
import { routeStopsForDay, daysWithStats } from "../lib/tripModel";
import { formatDistance, formatDuration } from "../lib/format";
import { contour, BORDER } from "../styles/ui";
import type { TripDetail } from "../lib/types";

// Day containers geometrically contain their stop rows and the attached zone,
// so prioritize: stop rows first (precise insertion), then the ALSO THIS DAY
// zone (attach off-route), then day containers (append), then a rect fallback
// for fast pointer movement.
const collisionDetection: CollisionDetection = (args) => {
  for (const type of ["dayStop", "dayAttached", "day"]) {
    const hits = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === type) });
    if (hits.length) return hits;
  }
  return rectIntersection(args);
};

function EditorBody({ detail }: { detail: TripDetail }) {
  const { selectedPointId, selectedDayId, droppingPin, cancelDropPin, selectDay, expandDay, aiBusy } = useEditorStore();
  const routeDays = daysWithStats(detail);
  const [shareOpen, setShareOpen] = useState(false);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const activePoint = activePointId ? detail.points.find((p) => p.id === activePointId) : undefined;
  const moveStop = useMoveStop(detail.trip.id);
  const attachStop = useAttachStop(detail.trip.id);
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
  // container = append, ALSO THIS DAY zone = attach off-route), then write.
  function onDragEnd(e: DragEndEvent) {
    setActivePointId(null);
    if (!e.over) return;
    const pointId = String(e.active.id);
    const drop = resolveDrop(pointId, { id: String(e.over.id), data: e.over.data.current as OverInfo["data"] }, detail);
    if (!drop) return;
    if (drop.attach) {
      const already = detail.dayStops.some((s) => s.dayId === drop.toDayId && s.pointId === pointId && !s.inRoute);
      if (!already) attachStop.mutate({ dayId: drop.toDayId, pointId });
      return;
    }
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

  // Selected-day badge docked top-left on the map (slide 08).
  const selDay = selectedDayId ? routeDays.find((d) => d.id === selectedDayId) : undefined;

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
        <TopBar trip={detail.trip} stats={stats} onShare={() => setShareOpen(true)} aiBusy={aiBusy} />
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
                    <div role="status" style={{ width: 330, padding: "18px 20px", borderRadius: 14, background: "var(--basalt)", color: "#ECF0F0", boxShadow: "0 2px 6px rgba(22,33,31,.2), 0 28px 70px rgba(22,33,31,.45)", ...contour("85% -30%", 34) }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <span className="ai-spinner" aria-hidden style={{ width: 18, height: 18, flex: "none", border: "2.5px solid rgba(236,240,240,.2)", borderTopColor: "#8B77E0", borderRadius: "50%" }} />
                        <span className="ovp" style={{ fontWeight: 800, fontSize: 15 }}>The AI is planning your trip…</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#B9C6C3", marginTop: 7, lineHeight: 1.5 }}>Days and stops appear on the map as they're ready — follow along in the chat.</div>
                      <div aria-hidden style={{ height: 3, borderRadius: 2, background: "rgba(236,240,240,.14)", overflow: "hidden", position: "relative", marginTop: 13 }}>
                        <span className="ai-skeleton" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "40%", borderRadius: 2, background: "#8B77E0" }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ pointerEvents: "auto", background: "rgba(255,255,255,.95)", border: BORDER, borderRadius: 11, boxShadow: "0 8px 28px rgba(22,33,31,.16)" }}>
                      <EmptyTrip />
                    </div>
                  )}
                </div>
              )}
              {/* top-left dock: day badge, then status banners under it (slide 08) */}
              <div style={{ position: "absolute", left: 14, top: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, pointerEvents: "none" }}>
                {selDay && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(255,255,255,.95)", border: BORDER, borderRadius: 10, boxShadow: "0 2px 8px rgba(22,33,31,.12)" }}>
                    <span className="ovp" style={{ width: 20, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--lupine)", color: "#fff", borderRadius: 6, fontWeight: 800, fontSize: 11 }}>{selDay.position + 1}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink)", textTransform: "uppercase" }}>
                      {selDay.title ?? `Day ${selDay.position + 1}`}{selDay.distanceM != null && ` · ${formatDistance(selDay.distanceM)} · ${formatDuration(selDay.durationS!)}`}
                    </span>
                  </div>
                )}
                {droppingPin && (
                  <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(22,33,31,.92)", color: "#ECF0F0", borderRadius: 9, boxShadow: "0 4px 14px rgba(22,33,31,.3)", fontSize: 12, fontWeight: 600 }}>
                    <MapPin size={11} aria-hidden />
                    Click the map to place a stop
                    <button onClick={cancelDropPin} style={{ border: "none", background: "rgba(236,240,240,.16)", color: "#ECF0F0", borderRadius: 5, padding: "3px 8px", fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                  </div>
                )}
              </div>
            </main>
            {selectedPointId && <DetailPanel detail={detail} />}
            <ChatPanel tripId={detail.trip.id} />
          </div>
          <DragOverlay>
            {activePoint && <div style={{ width: 300 }}><StopCard point={activePoint} detail={detail} overlay /></div>}
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
