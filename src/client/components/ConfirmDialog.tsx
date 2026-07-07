export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }:
  { title: string; body?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {body && <p style={{ fontSize: 13.5, color: "var(--slate)", margin: "0 0 4px" }}>{body}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 14px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 7, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "8px 14px", border: "none", background: "#a33", color: "#fff", borderRadius: 7, cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
