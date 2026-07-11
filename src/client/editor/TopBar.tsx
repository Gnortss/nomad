import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreVertical, Sparkles } from "lucide-react";
import { usePatchTrip, useDeleteTrip } from "../lib/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TripSettingsDialog } from "./TripSettingsDialog";
import { useIsMobile } from "../lib/useIsMobile";
import { btnPrimary, btnGhostDark, contour, popover } from "../styles/ui";
import type { Trip } from "../lib/types";

export function TopBar({ trip, stats, onShare, aiBusy = false }: { trip: Trip; stats: string; onShare: () => void; aiBusy?: boolean }) {
  const tripId = trip.id, tripName = trip.name;
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const del = useDeleteTrip();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Dialogs render in both variants.
  const dialogs = (
    <>
      {confirming && (
        <ConfirmDialog title={`Delete "${tripName}"?`} body="This removes the trip and all of its stops, days and routes."
          confirmLabel="Delete trip" onConfirm={() => del.mutate(tripId, { onSuccess: () => navigate("/trips") })} onCancel={() => setConfirming(false)} />
      )}
      {settingsOpen && <TripSettingsDialog trip={trip} onClose={() => setSettingsOpen(false)} />}
    </>
  );

  if (isMobile) {
    return (
      <header style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: "var(--basalt)", color: "#ECF0F0", ...contour("90% -80%") }}>
        <span aria-hidden style={{ width: 10, height: 10, flex: "none", background: "var(--lupine)", borderRadius: 3 }} />
        <Link to="/trips" className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 14, color: "inherit", textDecoration: "none" }}>NOMAD</Link>
        <span style={{ opacity: 0.35 }}>›</span>
        <TripName key={tripName} tripId={tripId} tripName={tripName} />
        {aiBusy && (
          <span role="status" aria-label="AI planning" style={{ display: "inline-flex", flex: "none", padding: "3px 6px", borderRadius: 14, background: "rgba(91,68,201,.28)", border: "1px solid rgba(122,99,232,.5)", color: "#CFC5F5" }}>
            <Sparkles size={10} aria-hidden />
          </span>
        )}
        <div style={{ flex: 1 }} />
        <TripMenu onShare={onShare} onSettings={() => setSettingsOpen(true)} onDelete={() => setConfirming(true)} aiBusy={aiBusy} />
        {dialogs}
      </header>
    );
  }

  return (
    <header style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 13, padding: "0 16px", background: "var(--basalt)", color: "#ECF0F0", ...contour("90% -80%") }}>
      <span aria-hidden style={{ width: 10, height: 10, flex: "none", background: "var(--lupine)", borderRadius: 3 }} />
      <Link to="/trips" className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 14, color: "inherit", textDecoration: "none" }}>NOMAD</Link>
      <span style={{ opacity: 0.35 }}>›</span>
      <TripName key={tripName} tripId={tripId} tripName={tripName} />
      {aiBusy && (
        <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4, padding: "3px 10px", borderRadius: 14, background: "rgba(91,68,201,.28)", border: "1px solid rgba(122,99,232,.5)", fontSize: 10.5, fontWeight: 700, color: "#CFC5F5", whiteSpace: "nowrap" }}>
          <Sparkles size={10} aria-hidden /> AI planning…
        </span>
      )}
      <span className="mono" style={{ marginLeft: 10, fontSize: 11.5, color: "#8FA3A0", textTransform: "uppercase", whiteSpace: "nowrap" }}>{stats}</span>
      <div style={{ flex: 1 }} />
      <button onClick={() => setSettingsOpen(true)} style={{ ...btnGhostDark(31), opacity: aiBusy ? 0.5 : 1 }}>Settings</button>
      <button onClick={() => setConfirming(true)} style={btnGhostDark(31)}>Delete trip</button>
      <button onClick={onShare} style={{ ...btnPrimary(31), padding: "0 13px", fontSize: 12, borderRadius: 8, opacity: aiBusy ? 0.5 : 1 }}>Share trip</button>
      {dialogs}
    </header>
  );
}

// Mobile overflow menu for the top-bar actions; same dismiss pattern as DayMenu.
function TripMenu({ onShare, onSettings, onDelete, aiBusy }: { onShare: () => void; onSettings: () => void; onDelete: () => void; aiBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // aiBusy dims Share/Settings without disabling — mirrors the desktop buttons.
  const item = (label: string, onClick: () => void, opts?: { destructive?: boolean; dimmed?: boolean }): React.ReactNode => (
    <button onClick={() => { setOpen(false); onClick(); }}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", fontFamily: "inherit", background: "#fff", fontSize: 13, fontWeight: 600, color: opts?.destructive ? "var(--brick)" : "var(--ink)", opacity: opts?.dimmed ? 0.5 : 1, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} aria-label="Trip menu" aria-expanded={open} style={btnGhostDark(31)}>
        <MoreVertical size={15} aria-hidden />
      </button>
      {open && (
        <div ref={menuRef} style={{ ...popover, position: "fixed", right: 8, top: 54, width: 180, zIndex: 40, color: "var(--ink)" }}>
          {item("Share trip", onShare, { dimmed: aiBusy })}
          {item("Settings", onSettings, { dimmed: aiBusy })}
          <div style={{ borderTop: "1px solid rgba(30,42,44,.10)" }} />
          {item("Delete trip", onDelete, { destructive: true })}
        </div>
      )}
    </>
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
      style={{ width: `${Math.max(name.length + 1, 6)}ch`, maxWidth: 320, margin: 0, padding: "0 0 1px", fontWeight: 600, fontSize: 13.5, fontFamily: "inherit", color: "inherit", background: "transparent", border: "none", borderBottom: "1.5px dashed rgba(236,240,240,.4)", outline: "none" }} />
  );
}
