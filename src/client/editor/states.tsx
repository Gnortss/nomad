import { BORDER } from "../styles/ui";

export function EmptyTrip() {
  return (
    <div style={{ padding: "14px 18px", textAlign: "center", color: "var(--slate)", maxWidth: 280 }}>
      <div className="ovp" style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)" }}>No stops yet.</div>
      <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>Search for a place or drop a pin on the map to add your first stop.</div>
    </div>
  );
}
export function RouteComputing() {
  return (
    <div className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", border: BORDER, borderRadius: 9, fontSize: 10, color: "var(--slate)", textTransform: "uppercase" }}>
      <span className="ai-spinner" aria-hidden style={{ width: 11, height: 11, flex: "none", border: "2px solid rgba(87,103,107,.25)", borderTopColor: "var(--slate)", borderRadius: "50%" }} />
      Measuring the drive…
    </div>
  );
}
export function RouteFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(178,58,46,.06)", border: "1px solid rgba(178,58,46,.25)", borderRadius: 9, fontSize: 11.5, color: "#8C2D23" }}>
      Couldn’t reach the routing service. Your stops are safe — try again.
      <button onClick={onRetry} style={{ padding: "3px 8px", border: "1px solid rgba(178,58,46,.35)", background: "#fff", color: "var(--brick)", borderRadius: 6, fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>Retry</button>
    </div>
  );
}
export function RouteStale({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(227,154,12,.09)", border: "1px solid rgba(227,154,12,.35)", borderRadius: 9, fontSize: 11.5, color: "#8A5C00" }}>
      Route may be out of date
      <button onClick={onRefresh} style={{ padding: "3px 8px", border: "1px solid rgba(227,154,12,.5)", background: "#fff", color: "#8A5C00", borderRadius: 6, fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>Refresh route</button>
    </div>
  );
}
