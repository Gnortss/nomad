import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTrips, useDeleteTrip } from "../lib/api";
import { signOut } from "../lib/auth";
import { TripThumb } from "../map/TripThumb";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NewTripModal } from "../components/NewTripModal";
import type { TripListItem } from "../lib/types";

export function TripListScreen() {
  const navigate = useNavigate();
  const { data } = useTrips();
  const [showNewTrip, setShowNewTrip] = useState(false);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
        <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em" }}>NOMAD</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewTrip(true)} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer" }}>+ New trip</button>
        <button onClick={signOut} style={{ marginLeft: 8, background: "transparent", color: "var(--glacier)", border: "1px solid rgba(236,240,240,.3)", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>Sign out</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, alignContent: "start" }}>
        {(data?.trips ?? []).map((t) => (
          // Menu is a sibling of the anchor (not a child) so its clicks never navigate.
          <div key={t.id} style={{ position: "relative" }}>
            <Link to={`/trips/${t.id}`} style={{ display: "block", padding: 18, background: "#F4F6F6", border: "1px solid rgba(87,103,107,.18)", borderRadius: 8, color: "inherit", textDecoration: "none" }}>
              <TripThumb points={t.points} routePolylines={t.routePolylines} />
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>{t.name}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>{t.startDate ?? "No dates yet"}</div>
            </Link>
            <TripCardMenu trip={t} />
          </div>
        ))}
      </div>
      {showNewTrip && (
        <NewTripModal onClose={() => setShowNewTrip(false)} onCreated={(id) => navigate(`/trips/${id}`)} />
      )}
    </div>
  );
}

function TripCardMenu({ trip }: { trip: TripListItem }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteTrip();
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setPos(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pos]);

  function toggle() {
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, r.right - 150), top: r.bottom + 4 });
  }

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Trip actions"
        style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, background: "rgba(244,246,246,.85)", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 14, lineHeight: 1, cursor: "pointer" }}>
        ⋯
      </button>
      {pos && (
        <div ref={menuRef} style={{ position: "fixed", left: pos.left, top: pos.top, width: 150, zIndex: 30, background: "#fff", border: "1px solid rgba(87,103,107,.2)", borderRadius: 7, boxShadow: "0 8px 28px rgba(30,42,44,.16)", overflow: "hidden" }}>
          <button onClick={() => { setPos(null); setConfirming(true); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", border: "none", background: "#fff", fontSize: 12.5, color: "#a33", cursor: "pointer" }}>
            Delete trip
          </button>
        </div>
      )}
      {confirming && (
        <ConfirmDialog title={`Delete "${trip.name}"?`} body="This removes the trip and all of its stops, days and routes."
          confirmLabel="Delete trip" onConfirm={() => { del.mutate(trip.id); setConfirming(false); }} onCancel={() => setConfirming(false)} />
      )}
    </>
  );
}
