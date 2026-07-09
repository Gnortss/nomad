import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, TriangleAlert, X } from "lucide-react";
import { useCreateTrip } from "../lib/api";
import { createAiTrip, AiUnconfiguredError } from "../lib/aiChat";
import { SCRIM, dialogCard, btnPrimary, iconBtn, FIELD_BORDER } from "../styles/ui";

// One-shot description form: the server extracts title/map-center/profile from
// the description and stores it as the chat seed — the real conversation happens
// in the editor's chat panel, which kicks off from that seed.
export function NewTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: (tripId: string) => void }) {
  const qc = useQueryClient();
  const create = useCreateTrip();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createWithAi() {
    const desc = description.trim();
    if (!desc || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { tripId } = await createAiTrip({ name: name.trim() || undefined, description: desc });
      qc.invalidateQueries({ queryKey: ["trips"] });
      onCreated(tripId);
    } catch (e) {
      setBusy(false);
      setError(e instanceof AiUnconfiguredError
        ? "AI planning isn't configured on this server — you can still create a blank trip below."
        : e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function skipToBlankTrip() {
    const trip = await create.mutateAsync(name.trim() || "New trip");
    onCreated((trip as { id: string }).id);
  }

  const frozen: React.CSSProperties = busy ? { background: "#F1F4F2", color: "#8FA3A0" } : {};

  return (
    <div role="dialog" aria-label="New trip" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: SCRIM, zIndex: 60 }}>
      <div style={{ ...dialogCard(560), padding: "26px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "rgba(91,68,201,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={17} color="var(--lupine)" />
          </span>
          <h3 className="ovp" style={{ margin: 0, flex: 1, fontWeight: 800, fontSize: 21 }}>New trip</h3>
          <button onClick={onClose} aria-label="Close" disabled={busy} style={{ ...iconBtn(30), borderRadius: 9, opacity: busy ? 0.4 : 1 }}><X size={14} aria-hidden /></button>
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip name (optional — the AI will suggest one)"
          disabled={busy}
          style={{ height: 40, padding: "0 13px", background: "var(--panel)", border: "1px solid rgba(30,42,44,.14)", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", ...frozen }} />

        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} autoFocus
          placeholder="Describe the trip you have in mind — where to, roughly when and for how long, the vibe (camping, nature, cities…), your car and any constraints (EV, no tolls…). The AI planner picks it up from there, in the editor."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void createWithAi(); } }}
          disabled={busy}
          style={{ minHeight: 128, padding: "12px 13px", background: "#fff", border: FIELD_BORDER, borderRadius: 9, fontSize: 13.5, lineHeight: 1.55, fontFamily: "inherit", resize: "vertical", ...frozen }} />

        <div style={{ fontSize: 12, color: "var(--slate)", marginTop: -6 }}>Where to, roughly when and how long, the vibe, your vehicle and constraints — anything helps.</div>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 11px", background: "rgba(178,58,46,.07)", border: "1px solid rgba(178,58,46,.25)", borderRadius: 9, fontSize: 12.5, color: "#8C2D23", lineHeight: 1.45 }}>
            <TriangleAlert size={13} aria-hidden style={{ flex: "none", marginTop: 1, color: "var(--brick)" }} />
            {error}
          </div>
        )}

        {busy && (
          <div aria-hidden style={{ height: 3, borderRadius: 2, background: "rgba(91,68,201,.15)", overflow: "hidden", position: "relative" }}>
            <span className="ai-skeleton" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "45%", borderRadius: 2, background: "var(--lupine)" }} />
          </div>
        )}

        <button onClick={() => void createWithAi()} disabled={busy || !description.trim()}
          style={{ ...btnPrimary(44), borderRadius: 10, fontSize: 14.5, gap: 10, opacity: busy ? 0.75 : !description.trim() ? 0.6 : 1 }}>
          {busy && <span className="ai-spinner" aria-hidden style={{ width: 16, height: 16, border: "2.5px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%" }} />}
          {busy ? "Creating your trip…" : "Create trip"}
        </button>

        <button onClick={() => void skipToBlankTrip()} disabled={busy || create.isPending}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 12.5, color: busy ? "#B9C6C3" : "var(--slate)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit" }}>
          Skip — create a blank trip instead
        </button>
      </div>
    </div>
  );
}
