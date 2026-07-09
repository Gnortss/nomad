import type { TripDetail } from "../lib/types";

export function computeDrop(current: string[], pointId: string, toIndex: number): string[] {
  const without = current.filter((id) => id !== pointId);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, clamped), pointId, ...without.slice(clamped)];
}

// Droppable payloads: day containers carry { type: "day" }, sortable stop rows
// carry { type: "dayStop", dayId } (dnd-kit injects sortable.index), and the
// ALSO THIS DAY zone carries { type: "dayAttached", dayId }. Where the stop
// lands decides on-route vs attached.
export type OverInfo = { id: string; data?: { type?: string; dayId?: string; sortable?: { index: number } } };
export type DropTarget = { toDayId: string; toIndex: number; fromDayId: string | null; attach?: boolean };

export function resolveDrop(activeId: string, over: OverInfo, detail: TripDetail): DropTarget | null {
  const fromDayId = detail.dayStops.find((s) => s.pointId === activeId)?.dayId ?? null;
  if (over.data?.type === "dayAttached" && over.data.dayId) {
    return { toDayId: over.data.dayId, toIndex: -1, fromDayId, attach: true };
  }
  if (over.data?.type === "dayStop" && over.data.dayId && over.data.sortable) {
    return { toDayId: over.data.dayId, toIndex: over.data.sortable.index, fromDayId };
  }
  if (over.data?.type === "day" || detail.days.some((d) => d.id === over.id)) {
    const count = detail.dayStops.filter((s) => s.dayId === over.id).length;
    return { toDayId: over.id, toIndex: count, fromDayId };
  }
  return null;
}
