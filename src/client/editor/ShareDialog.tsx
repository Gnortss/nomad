import { useEffect, useState } from "react";
import { mintShare, rotateShare } from "../lib/api";

export function ShareDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { mintShare(tripId).then((r) => setToken(r.shareToken)); }, [tripId]);
  const url = token ? `${location.origin}/s/${token}` : "Generating…";
  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ marginTop: 0 }}>Share this trip</h3>
        <div className="mono" style={{ fontSize: 12.5, padding: "10px 12px", background: "#F4F6F6", borderRadius: 7, wordBreak: "break-all" }}>{url}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => rotateShare(tripId).then((r) => setToken(r.shareToken))} style={{ padding: "8px 14px", border: "1px solid rgba(87,103,107,.3)", background: "#fff", borderRadius: 7, cursor: "pointer" }}>Rotate link</button>
          <button onClick={onClose} style={{ padding: "8px 14px", border: "none", background: "var(--lupine)", color: "#fff", borderRadius: 7, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}
