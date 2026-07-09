import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewriteDayStops } from "./tripModel";
import type { TripDetail, Trip, TripListItem, Group, PlaceInfo } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const listTrips = () => req<{ trips: TripListItem[] }>("/api/trips");
export const createTrip = (name: string) => req<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ name }) });
export const getTrip = (id: string) => req<TripDetail>(`/api/trips/${id}`);
export const patchTrip = (id: string, body: object) => req<Trip>(`/api/trips/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteTrip = (id: string) => req<void>(`/api/trips/${id}`, { method: "DELETE" });

export const createPoint = (tripId: string, body: object) => req(`/api/trips/${tripId}/points`, { method: "POST", body: JSON.stringify(body) });
export const getPlaceInfo = (pointId: string) => req<PlaceInfo>(`/api/points/${pointId}/place`);
export const patchPoint = (id: string, body: object) => req(`/api/points/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deletePoint = (id: string) => req<void>(`/api/points/${id}`, { method: "DELETE" });

export const createDay = (tripId: string, body: object) => req(`/api/trips/${tripId}/days`, { method: "POST", body: JSON.stringify(body) });
export const patchDay = (id: string, body: object) => req(`/api/days/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteDay = (id: string) => req<void>(`/api/days/${id}`, { method: "DELETE" });

export const putStops = (dayId: string, pointIds: string[]) =>
  req<{ stops: unknown[]; routes: Record<string, unknown>; routeStatus: Record<string, string> }>(`/api/days/${dayId}/stops`, { method: "PUT", body: JSON.stringify({ pointIds }) });
export const attachStop = (dayId: string, pointId: string) =>
  req(`/api/days/${dayId}/stops`, { method: "POST", body: JSON.stringify({ pointId }) });
export const patchStop = (dayId: string, pointId: string, body: { inRoute: boolean }) =>
  req(`/api/days/${dayId}/stops/${pointId}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteStop = (dayId: string, pointId: string) =>
  req(`/api/days/${dayId}/stops/${pointId}`, { method: "DELETE" });

export const createGroup = (tripId: string, body: object) => req(`/api/trips/${tripId}/groups`, { method: "POST", body: JSON.stringify(body) });
export const patchGroup = (id: string, body: object) => req(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteGroup = (id: string) => req<void>(`/api/groups/${id}`, { method: "DELETE" });

export const mintShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "POST" });
export const rotateShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "DELETE" });
export const getShare = (token: string) => req<unknown>(`/api/share/${token}`);

export const useTrips = () => useQuery({ queryKey: ["trips"], queryFn: listTrips });
// Server caches place details in D1 for 30 days; staleTime Infinity keeps a
// browser session from re-asking for the same stop.
export const usePlaceInfo = (pointId: string, enabled: boolean) =>
  useQuery({ queryKey: ["place", pointId], queryFn: () => getPlaceInfo(pointId), enabled, staleTime: Infinity });
export const useTrip = (id: string) => useQuery({ queryKey: ["trip", id], queryFn: () => getTrip(id) });

export function useInvalidateTrip(tripId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["trip", tripId] });
}
// Both stop mutations write the new arrangement into the cached TripDetail up
// front (onMutate) so the drop lands instantly, restore the snapshot on error,
// and invalidate on settle so the cache converges to server truth either way.
function useOptimisticStops<V>(tripId: string, writesFor: (v: V) => { dayId: string; pointIds: string[] }[]) {
  const qc = useQueryClient();
  return {
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: ["trip", tripId] });
      const prev = qc.getQueryData<TripDetail>(["trip", tripId]);
      if (prev) qc.setQueryData(["trip", tripId], rewriteDayStops(prev, writesFor(v)));
      return { prev };
    },
    onError: (_e: Error, _v: V, ctx?: { prev?: TripDetail }) => {
      if (ctx?.prev) qc.setQueryData(["trip", tripId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  };
}
export function usePutStops(tripId: string) {
  return useMutation({
    mutationFn: (v: { dayId: string; pointIds: string[] }) => putStops(v.dayId, v.pointIds),
    ...useOptimisticStops(tripId, (v: { dayId: string; pointIds: string[] }) => [v]),
  });
}
// Cross-day moves need two PUTs (PUT /stops rewrites one day only): remove from the
// source day first, then write the target day. Single invalidation after both.
export function useMoveStop(tripId: string) {
  return useMutation({
    mutationFn: async (v: { fromDayId: string | null; fromPointIds: string[]; toDayId: string; toPointIds: string[] }) => {
      if (v.fromDayId && v.fromDayId !== v.toDayId) await putStops(v.fromDayId, v.fromPointIds);
      await putStops(v.toDayId, v.toPointIds);
    },
    ...useOptimisticStops(tripId, (v: { fromDayId: string | null; toDayId: string; fromPointIds: string[]; toPointIds: string[] }) =>
      v.fromDayId && v.fromDayId !== v.toDayId
        ? [{ dayId: v.fromDayId, pointIds: v.fromPointIds }, { dayId: v.toDayId, pointIds: v.toPointIds }]
        : [{ dayId: v.toDayId, pointIds: v.toPointIds }]),
  });
}
// Attach a stop to a day off-route (drop into ALSO THIS DAY); the point leaves
// wherever it sat. Optimistic so the row lands in the section instantly.
export function useAttachStop(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; pointId: string }) => attachStop(v.dayId, v.pointId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["trip", tripId] });
      const prev = qc.getQueryData<TripDetail>(["trip", tripId]);
      if (prev) {
        const kept = prev.dayStops.filter((s) => s.pointId !== v.pointId);
        const maxPos = Math.max(-1, ...kept.filter((s) => s.dayId === v.dayId).map((s) => s.position));
        qc.setQueryData(["trip", tripId], { ...prev, dayStops: [...kept, { dayId: v.dayId, pointId: v.pointId, position: maxPos + 1, inRoute: false }] });
      }
      return { prev };
    },
    onError: (_e: Error, _v, ctx?: { prev?: TripDetail }) => { if (ctx?.prev) qc.setQueryData(["trip", tripId], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });
}
// Toggle a stop between route waypoint and attached-to-day.
export function useToggleStopRoute(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({
    mutationFn: (v: { dayId: string; pointId: string; inRoute: boolean }) => patchStop(v.dayId, v.pointId, { inRoute: v.inRoute }),
    onSuccess: invalidate,
  });
}
// Unassign a stop (route or attached) from its day; optimistic row removal.
export function useUnassignStop(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; pointId: string }) => deleteStop(v.dayId, v.pointId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["trip", tripId] });
      const prev = qc.getQueryData<TripDetail>(["trip", tripId]);
      if (prev) qc.setQueryData(["trip", tripId], { ...prev, dayStops: prev.dayStops.filter((s) => !(s.dayId === v.dayId && s.pointId === v.pointId)) });
      return { prev };
    },
    onError: (_e, _v, ctx?: { prev?: TripDetail }) => { if (ctx?.prev) qc.setQueryData(["trip", tripId], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });
}
export function usePatchTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => patchTrip(tripId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] }); // trip list cards show the name too
    },
  });
}
export function usePatchPoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (v: { id: string; body: object }) => patchPoint(v.id, v.body), onSuccess: invalidate });
}
export function useDeletePoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (id: string) => deletePoint(id), onSuccess: invalidate });
}
export function useCreatePoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (body: object) => createPoint(tripId, body), onSuccess: invalidate });
}
export function useCreateGroup(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({
    mutationFn: (body: { name: string; color?: string | null; dayId?: string | null }) => createGroup(tripId, body) as Promise<Group>,
    onSuccess: invalidate,
  });
}
export function useCreateDay(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (body: object) => createDay(tripId, body), onSuccess: invalidate });
}
export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => createTrip(name), onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }) });
}
export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTrip(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: ["trip", id] }); // drop dead cache for the deleted trip
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}
