import { useEffect, useState } from "react";
import { mintShare, rotateShare } from "../lib/api";
import { SCRIM, dialogCard, btnPrimary, contour } from "../styles/ui";

export function ShareDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { mintShare(tripId).then((r) => setToken(r.shareToken)); }, [tripId]);
  const url = token ? `${location.origin}/s/${token}` : "Generating…";

  function copy() {
    if (!token) return;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div role="dialog" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: SCRIM, zIndex: 60 }}>
      <div style={dialogCard(460)}>
        <div className="ovp" style={{ fontWeight: 800, fontSize: 18 }}>Share this trip</div>
        <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}>Anyone with the link can view — never edit.</div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", background: "var(--basalt)", borderRadius: 10, ...contour("90% -60%", 26) }}>
          <span className="mono" style={{ flex: 1, fontSize: 12, color: "#B9C6C3", wordBreak: "break-all" }}>{url}</span>
          <button onClick={copy} style={{ flex: "none", padding: "4px 9px", background: "rgba(236,240,240,.14)", color: "#ECF0F0", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 10.5, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => rotateShare(tripId).then((r) => setToken(r.shareToken))}
            style={{ height: 36, padding: "0 14px", background: "#fff", color: "var(--brick)", border: "1px solid rgba(178,58,46,.35)", borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            Rotate link
          </button>
          <button onClick={onClose} style={{ ...btnPrimary(36), padding: "0 18px", fontSize: 13 }}>Done</button>
        </div>
        <div style={{ fontSize: 11, color: "#8FA3A0", marginTop: 8 }}>rotating invalidates the old link immediately</div>
      </div>
    </div>
  );
}
