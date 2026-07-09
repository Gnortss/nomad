import { X } from "lucide-react";
import { SCRIM, dialogCard, btnSecondary, btnDestructive, iconBtn } from "../styles/ui";

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }:
  { title: string; body?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: SCRIM, zIndex: 60 }}>
      <div style={{ ...dialogCard(420), padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ovp" style={{ flex: 1, fontWeight: 800, fontSize: 17 }}>{title}</span>
          <button onClick={onCancel} aria-label="Close" style={iconBtn(28)}><X size={13} aria-hidden /></button>
        </div>
        {body && <p style={{ fontSize: 13, color: "var(--slate)", margin: "6px 0 0", lineHeight: 1.5 }}>{body}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btnSecondary(34), fontSize: 13 }}>Cancel</button>
          <button onClick={onConfirm} style={btnDestructive(34)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
