import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePatchTrip, useDeleteTrip } from "../lib/api";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function TopBar({ tripId, tripName, stats, onShare }: { tripId: string; tripName: string; stats: string; onShare: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteTrip();
  const navigate = useNavigate();

  return (
    <header style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
      <Link to="/trips" className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 16, color: "inherit", textDecoration: "none" }}>NOMAD</Link>
      <span style={{ opacity: .35 }}>›</span>
      <TripName key={tripName} tripId={tripId} tripName={tripName} />
      <span className="mono" style={{ marginLeft: 20, fontSize: 12.5, color: "#aab8b7" }}>{stats}</span>
      <div style={{ flex: 1 }} />
      <button onClick={() => setConfirming(true)} style={{ height: 34, padding: "0 12px", background: "transparent", color: "var(--glacier)", border: "1px solid rgba(236,240,240,.3)", borderRadius: 7, fontSize: 13.5, cursor: "pointer" }}>Delete trip</button>
      <button onClick={onShare} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Share trip</button>
      {confirming && (
        <ConfirmDialog title={`Delete "${tripName}"?`} body="This removes the trip and all of its stops, days and routes."
          confirmLabel="Delete trip" onConfirm={() => del.mutate(tripId, { onSuccess: () => navigate("/trips") })} onCancel={() => setConfirming(false)} />
      )}
    </header>
  );
}

// key={tripName} above reseeds the draft when the server name changes.
function TripName({ tripId, tripName }: { tripId: string; tripName: string }) {
  const patch = usePatchTrip(tripId);
  // Local draft: the PATCH invalidates the trip query, and the refetch would
  // clobber a controlled input mid-edit (same pattern as DetailPanel).
  const [name, setName] = useState(tripName);

  function commit() {
    const v = name.trim();
    if (v && v !== tripName) patch.mutate({ name: v });
    else setName(tripName);
  }

  return (
    <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      aria-label="Trip name"
      style={{ width: `${Math.max(name.length + 1, 6)}ch`, maxWidth: 320, margin: 0, padding: 0, fontWeight: 600, fontSize: 14, fontFamily: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1px dashed rgba(230,237,236,.35)", outline: "none" }} />
  );
}
