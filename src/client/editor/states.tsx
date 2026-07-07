export function EmptyTrip() {
  return (
    <div style={{ padding: 20, textAlign: "center", color: "var(--slate)" }}>
      <div style={{ fontWeight: 700, color: "var(--basalt)" }}>No stops yet.</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Search for a place or drop a pin on the map to add your first stop.</div>
    </div>
  );
}
export function RouteComputing() {
  return <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>Measuring the drive…</div>;
}
export function RouteFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ fontSize: 12, color: "var(--basalt)" }}>
      Couldn’t reach the routing service. Your stops are safe — try again.
      <button onClick={onRetry} style={{ marginLeft: 8, padding: "2px 8px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 5, cursor: "pointer" }}>Retry</button>
    </div>
  );
}
export function RouteStale({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ fontSize: 12, color: "#8a5c00" }}>
      Route may be out of date
      <button onClick={onRefresh} style={{ marginLeft: 8, padding: "2px 8px", border: "1px solid var(--sulfur)", background: "#fff", borderRadius: 5, cursor: "pointer" }}>Refresh route</button>
    </div>
  );
}
