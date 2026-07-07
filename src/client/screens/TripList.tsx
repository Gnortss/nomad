import { useNavigate } from "react-router-dom";
import { useTrips, useCreateTrip } from "../lib/api";
import { signOut } from "../lib/auth";

export function TripListScreen() {
  const navigate = useNavigate();
  const { data } = useTrips();
  const create = useCreateTrip();

  async function onNew() {
    const trip = await create.mutateAsync("New trip");
    navigate(`/trips/${(trip as { id: string }).id}`);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
        <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em" }}>ROADLINE</span>
        <div style={{ flex: 1 }} />
        <button onClick={onNew} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer" }}>+ New trip</button>
        <button onClick={signOut} style={{ marginLeft: 8, background: "transparent", color: "var(--glacier)", border: "1px solid rgba(236,240,240,.3)", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>Sign out</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {(data?.trips ?? []).map((t) => (
          <a key={t.id} href={`/trips/${t.id}`} style={{ display: "block", padding: 18, background: "#F4F6F6", border: "1px solid rgba(87,103,107,.18)", borderRadius: 8, color: "inherit" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>{t.startDate ?? "No dates yet"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
