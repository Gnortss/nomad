import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TripDetail, Trip } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const listTrips = () => req<{ trips: Trip[] }>("/api/trips");
export const createTrip = (name: string) => req<Trip>("/api/trips", { method: "POST", body: JSON.stringify({ name }) });
export const getTrip = (id: string) => req<TripDetail>(`/api/trips/${id}`);
export const deleteTrip = (id: string) => req<void>(`/api/trips/${id}`, { method: "DELETE" });

export const createPoint = (tripId: string, body: object) => req(`/api/trips/${tripId}/points`, { method: "POST", body: JSON.stringify(body) });
export const patchPoint = (id: string, body: object) => req(`/api/points/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deletePoint = (id: string) => req<void>(`/api/points/${id}`, { method: "DELETE" });

export const createDay = (tripId: string, body: object) => req(`/api/trips/${tripId}/days`, { method: "POST", body: JSON.stringify(body) });
export const patchDay = (id: string, body: object) => req(`/api/days/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteDay = (id: string) => req<void>(`/api/days/${id}`, { method: "DELETE" });

export const putStops = (dayId: string, pointIds: string[]) =>
  req<{ stops: unknown[]; routes: Record<string, unknown>; routeStatus: Record<string, string> }>(`/api/days/${dayId}/stops`, { method: "PUT", body: JSON.stringify({ pointIds }) });

export const createGroup = (tripId: string, body: object) => req(`/api/trips/${tripId}/groups`, { method: "POST", body: JSON.stringify(body) });
export const patchGroup = (id: string, body: object) => req(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteGroup = (id: string) => req<void>(`/api/groups/${id}`, { method: "DELETE" });

export const mintShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "POST" });
export const rotateShare = (tripId: string) => req<{ shareToken: string }>(`/api/trips/${tripId}/share`, { method: "DELETE" });
export const getShare = (token: string) => req<unknown>(`/s/${token}`);

export const useTrips = () => useQuery({ queryKey: ["trips"], queryFn: listTrips });
export const useTrip = (id: string) => useQuery({ queryKey: ["trip", id], queryFn: () => getTrip(id) });

export function useInvalidateTrip(tripId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["trip", tripId] });
}
export function usePutStops(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (v: { dayId: string; pointIds: string[] }) => putStops(v.dayId, v.pointIds), onSuccess: invalidate });
}
// Cross-day moves need two PUTs (PUT /stops rewrites one day only): remove from the
// source day first, then write the target day. Single invalidation after both.
export function useMoveStop(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({
    mutationFn: async (v: { fromDayId: string | null; fromPointIds: string[]; toDayId: string; toPointIds: string[] }) => {
      if (v.fromDayId && v.fromDayId !== v.toDayId) await putStops(v.fromDayId, v.fromPointIds);
      await putStops(v.toDayId, v.toPointIds);
    },
    onSuccess: invalidate,
  });
}
export function usePatchPoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (v: { id: string; body: object }) => patchPoint(v.id, v.body), onSuccess: invalidate });
}
export function useCreatePoint(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (body: object) => createPoint(tripId, body), onSuccess: invalidate });
}
export function useCreateDay(tripId: string) {
  const invalidate = useInvalidateTrip(tripId);
  return useMutation({ mutationFn: (body: object) => createDay(tripId, body), onSuccess: invalidate });
}
export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => createTrip(name), onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }) });
}
