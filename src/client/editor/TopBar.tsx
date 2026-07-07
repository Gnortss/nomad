export function TopBar({ tripName, stats, onShare }: { tripName: string; stats: string; onShare: () => void }) {
  return (
    <header style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "0 18px", background: "var(--basalt)", color: "var(--glacier)" }}>
      <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 16 }}>ROADLINE</span>
      <span style={{ opacity: .35 }}>›</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{tripName}</span>
      <span className="mono" style={{ marginLeft: 20, fontSize: 12.5, color: "#aab8b7" }}>{stats}</span>
      <div style={{ flex: 1 }} />
      <button onClick={onShare} style={{ height: 34, padding: "0 15px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Share trip</button>
    </header>
  );
}
