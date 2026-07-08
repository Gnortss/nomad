import { useState } from "react";
import { usePatchTrip } from "../lib/api";
import type { Trip } from "../lib/types";

const field: React.CSSProperties = { padding: "9px 11px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit" };
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--slate)" };

// Vehicle + routing constraints. Saved as one PATCH on "Save" (not per-field):
// toggling tolls/ferries recomputes routes server-side, so batching avoids
// firing a Routes call per checkbox click.
export function TripSettingsDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const patch = usePatchTrip(trip.id);
  const [vehicle, setVehicle] = useState<"car" | "ev">(trip.vehicle);
  const [evRange, setEvRange] = useState(trip.evRangeKm ? String(trip.evRangeKm) : "");
  const [avoidTolls, setAvoidTolls] = useState(trip.avoidTolls);
  const [allowFerries, setAllowFerries] = useState(trip.allowFerries);

  function save() {
    const range = parseInt(evRange, 10);
    patch.mutate(
      {
        vehicle,
        evRangeKm: vehicle === "ev" && Number.isInteger(range) && range >= 50 && range <= 2000 ? range : null,
        avoidTolls,
        allowFerries,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div role="dialog" aria-label="Trip settings" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ margin: 0 }}>Trip settings</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value as "car" | "ev")} aria-label="Vehicle" style={field}>
            <option value="car">Car (petrol / diesel)</option>
            <option value="ev">Electric car</option>
          </select>
        </div>

        {vehicle === "ev" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Range on a full charge (km)</span>
            <input value={evRange} onChange={(e) => setEvRange(e.target.value)} inputMode="numeric" placeholder="e.g. 400"
              aria-label="EV range in km" style={field} />
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={avoidTolls} onChange={(e) => setAvoidTolls(e.target.checked)} />
          Avoid toll roads
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={allowFerries} onChange={(e) => setAllowFerries(e.target.checked)} />
          Allow ferries
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 7, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={patch.isPending}
            style={{ padding: "8px 14px", border: "none", background: "var(--lupine)", color: "#fff", borderRadius: 7, fontWeight: 600, cursor: "pointer", opacity: patch.isPending ? 0.6 : 1 }}>
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
