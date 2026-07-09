import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { useTrips, useDeleteTrip, usePatchTrip } from "../lib/api";
import { signOut } from "../lib/auth";
import { TripThumb } from "../map/TripThumb";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NewTripModal } from "../components/NewTripModal";
import { btnPrimary, btnGhostDark, popover, contour, E1 } from "../styles/ui";
import type { TripListItem } from "../lib/types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function formatCardDate(iso: string | null): string {
  if (!iso) return "NO DATES YET";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso.toUpperCase();
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

// Stable per-trip seed so thumbnail contour rings differ between cards.
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function TripListScreen() {
  const navigate = useNavigate();
  const { data } = useTrips();
  const [showNewTrip, setShowNewTrip] = useState(false);
  const trips = data?.trips ?? [];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", background: "var(--basalt)", color: "#ECF0F0", ...contour("85% -60%") }}>
        <span aria-hidden style={{ width: 11, height: 11, background: "var(--lupine)", borderRadius: 3 }} />
        <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 16 }}>NOMAD</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewTrip(true)} style={{ ...btnPrimary(34), padding: "0 15px" }}>+ New trip</button>
        <button onClick={signOut} style={{ ...btnGhostDark(34), fontSize: 13.5 }}>Sign out</button>
      </header>
      {data && trips.length === 0 ? (
        <EmptyDashboard onNewTrip={() => setShowNewTrip(true)} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "30px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18, alignContent: "start" }}>
          {trips.map((t) => <TripCard key={t.id} trip={t} />)}
        </div>
      )}
      {showNewTrip && (
        <NewTripModal onClose={() => setShowNewTrip(false)} onCreated={(id) => navigate(`/trips/${id}`)} />
      )}
    </div>
  );
}

// The dashboard's dark hero doubles as the zero-trips state: a dashed
// dream-route and a single primary action. No dummy cards.
function EmptyDashboard({ onNewTrip }: { onNewTrip: () => void }) {
  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--basalt)", display: "grid", placeItems: "center", ...contour("20% 140%", 54) }}>
      <svg viewBox="0 0 1352 290" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
        <path d="M60 170 Q300 120 560 140 Q820 160 1000 100 Q1160 50 1310 70" fill="none" stroke="#5B44C9" strokeWidth={2.5} strokeDasharray="1 12" strokeLinecap="round" opacity={0.8} />
        <circle cx={60} cy={170} r={5} fill="#5B44C9" />
        <circle cx={1310} cy={70} r={5} fill="#E39A0C" />
      </svg>
      <div style={{ position: "relative", textAlign: "center", color: "#ECF0F0", padding: 24 }}>
        <div className="ovp" style={{ fontWeight: 800, fontSize: 26 }}>Where to first?</div>
        <div style={{ fontSize: 14, color: "#B9C6C3", marginTop: 6, maxWidth: 460 }}>Describe a trip in one sentence — the AI planner drafts the days, stops and routes with you.</div>
        <button onClick={onNewTrip} style={{ ...btnPrimary(38), marginTop: 16, padding: "0 18px", fontSize: 14, boxShadow: "0 6px 20px rgba(91,68,201,.4), inset 0 1px 0 rgba(255,255,255,.18)" }}>
          + Plan your first trip
        </button>
      </div>
    </div>
  );
}

function TripCard({ trip: t }: { trip: TripListItem }) {
  const [hover, setHover] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const body = (
    <>
      <div style={{ position: "relative", borderRadius: 9, overflow: "hidden", background: "var(--basalt)" }}>
        <TripThumb points={t.points} routePolylines={t.routePolylines} seed={hashSeed(t.id)}
          meta={`${t.daysCount ?? 0} ${t.daysCount === 1 ? "DAY" : "DAYS"} · ${t.points.length} ${t.points.length === 1 ? "STOP" : "STOPS"}`} />
      </div>
      {renaming ? (
        <TripNameEditor trip={t} onDone={() => setRenaming(false)} />
      ) : (
        <div className="ovp" style={{ fontWeight: 800, fontSize: 16, marginTop: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
      )}
      <div className="mono" style={{ fontSize: 12, color: t.startDate ? "var(--slate)" : "#8FA3A0", marginTop: 3 }}>{formatCardDate(t.startDate)}</div>
    </>
  );
  const cardStyle: React.CSSProperties = {
    display: "block", padding: 12, background: "#fff", borderRadius: 12, color: "inherit", textDecoration: "none",
    border: `1px solid ${hover ? "rgba(91,68,201,.45)" : "rgba(30,42,44,.10)"}`,
    boxShadow: hover ? "0 2px 6px rgba(22,33,31,.08), 0 16px 40px rgba(22,33,31,.16)" : E1,
    transform: hover ? "translateY(-2px)" : "none",
    transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
  };
  return (
    // Menu is a sibling of the anchor (not a child) so its clicks never navigate.
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {renaming ? <div style={cardStyle}>{body}</div> : <Link to={`/trips/${t.id}`} style={cardStyle}>{body}</Link>}
      <TripCardMenu trip={t} onRename={() => setRenaming(true)} />
    </div>
  );
}

// key={t.name} reseeds the draft if the server name changes underneath.
function TripNameEditor({ trip, onDone }: { trip: TripListItem; onDone: () => void }) {
  const patch = usePatchTrip(trip.id);
  const [name, setName] = useState(trip.name);
  function commit() {
    const v = name.trim();
    if (v && v !== trip.name) patch.mutate({ name: v });
    onDone();
  }
  return (
    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onDone(); }}
      aria-label="Trip name" className="ovp"
      style={{ width: "100%", margin: "11px 0 0", padding: 0, fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)", color: "inherit", background: "transparent", border: "none", borderBottom: "1.5px dashed rgba(87,103,107,.45)", outline: "none" }} />
  );
}

function TripCardMenu({ trip, onRename }: { trip: TripListItem; onRename: () => void }) {
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
    setPos({ left: Math.max(8, r.right - 160), top: r.bottom + 4 });
  }

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "#fff", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", color: "var(--ink)", cursor: "pointer" };
  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Trip actions"
        style={{ position: "absolute", top: 18, right: 18, width: 28, height: 28, background: "rgba(22,33,31,.55)", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, lineHeight: 1, letterSpacing: ".5px", cursor: "pointer", boxShadow: pos ? "0 0 0 2px rgba(91,68,201,.6)" : "none" }}>
        ⋯
      </button>
      {pos && (
        <div ref={menuRef} style={{ ...popover, position: "fixed", left: pos.left, top: pos.top, width: 160, zIndex: 30 }}>
          <button onClick={() => { setPos(null); onRename(); }} style={row}>
            <Pencil size={12} aria-hidden style={{ color: "var(--slate)" }} /> Rename
          </button>
          <button onClick={() => { setPos(null); setConfirming(true); }}
            style={{ ...row, fontWeight: 600, color: "var(--brick)", borderTop: "1px solid rgba(30,42,44,.08)" }}>
            <Trash2 size={12} aria-hidden /> Delete trip
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
