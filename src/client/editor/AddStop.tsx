import { useState } from "react";
import { createPoint } from "../lib/api";

// Frozen to the Essentials Place Details SKU (spec §5.2). Adding ratings/photos/hours
// silently escalates to Pro/Enterprise pricing — do NOT extend without a cost review.
export const PLACE_DETAILS_FIELDS = ["id", "displayName", "location", "formattedAddress"] as const;

type Resolved = { name: string; lat: number; lng: number; googlePlaceId: string };

export function AddStop({ tripId, testResolve }: { tripId: string; testResolve?: (q: string) => Promise<Resolved> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  async function useResult() {
    // In production this runs Autocomplete (session token) + a Place Details call with
    // PLACE_DETAILS_FIELDS. In tests, testResolve stands in for the Google round-trip.
    const resolve = testResolve!;
    const r = await resolve(q);
    await createPoint(tripId, { name: r.name, lat: r.lat, lng: r.lng, coordSource: "google", googlePlaceId: r.googlePlaceId });
    setOpen(false); setQ("");
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ flex: 1, height: 32, background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>🔍 Search a place</button>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <input role="textbox" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place" style={{ flex: 1, height: 32, borderRadius: 7, border: "1px solid rgba(87,103,107,.28)", padding: "0 10px" }} />
      <button onClick={useResult} style={{ height: 32, padding: "0 10px", borderRadius: 7, border: "none", background: "var(--lupine)", color: "#fff", cursor: "pointer" }}>Use result</button>
    </div>
  );
}
