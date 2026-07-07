import { signOut } from "../lib/auth";
import { MapCanvas } from "../map/MapCanvas";

export function AppShell() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
        <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em" }}>ROADLINE</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={signOut}
          style={{ background: "transparent", color: "var(--glacier)", border: "1px solid rgba(236,240,240,.3)", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}
        >
          Sign out
        </button>
      </header>
      <div id="app-body" style={{ flex: 1, minHeight: 0 }}>
        <MapCanvas />
      </div>
    </div>
  );
}
