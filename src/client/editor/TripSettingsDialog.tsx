import { useState } from "react";
import { usePatchTrip } from "../lib/api";
import { SCRIM, dialogCard, btnSecondary, btnPrimary, field } from "../styles/ui";
import type { Trip } from "../lib/types";

const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--slate)" };

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
    <div role="dialog" aria-label="Trip settings" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: SCRIM, zIndex: 60 }}>
      <div style={{ ...dialogCard(460), display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="ovp" style={{ fontWeight: 800, fontSize: 18 }}>Trip settings</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value as "car" | "ev")} aria-label="Vehicle" style={{ ...field(38), fontWeight: 600 }}>
            <option value="car">Car (petrol / diesel)</option>
            <option value="ev">Electric car</option>
          </select>
        </div>

        {vehicle === "ev" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, background: "rgba(91,68,201,.05)", border: "1px solid rgba(91,68,201,.2)", borderRadius: 10 }}>
            <span style={label}>Range on a full charge (km)</span>
            <input value={evRange} onChange={(e) => setEvRange(e.target.value)} inputMode="numeric" placeholder="e.g. 400"
              aria-label="EV range in km" className="mono" style={{ ...field(36), width: 130, fontSize: 14, fontWeight: 600 }} />
            <span style={{ fontSize: 11, color: "#8FA3A0" }}>only for EVs — the fuel stat hides in the top bar</span>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>
          <input type="checkbox" checked={avoidTolls} onChange={(e) => setAvoidTolls(e.target.checked)} />
          Avoid toll roads
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>
          <input type="checkbox" checked={allowFerries} onChange={(e) => setAllowFerries(e.target.checked)} />
          Allow ferries
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 2, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnSecondary(36), fontSize: 13 }}>Cancel</button>
          <button onClick={save} disabled={patch.isPending}
            style={{ ...btnPrimary(36), fontSize: 13, opacity: patch.isPending ? 0.8 : 1 }}>
            {patch.isPending && <span className="ai-spinner" aria-hidden style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%" }} />}
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#8FA3A0", textAlign: "right", marginTop: -8 }}>saving recomputes every day's route</div>
      </div>
    </div>
  );
}
