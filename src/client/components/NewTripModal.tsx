import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateTrip } from "../lib/api";
import { createAiTrip, AiUnconfiguredError } from "../lib/aiChat";

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

  return (
    <div role="dialog" aria-label="New trip" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 560, maxWidth: "94vw", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>New trip</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: "none", background: "rgba(87,103,107,.12)", borderRadius: 7, cursor: "pointer", fontSize: 15 }}>×</button>
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip name (optional — the AI will suggest one)"
          disabled={busy}
          style={{ padding: "9px 11px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit" }} />

        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
          placeholder="Describe the trip you have in mind — where to, roughly when and for how long, the vibe (camping, nature, cities…), your car and any constraints (EV, no tolls…). The AI planner picks it up from there, in the editor."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void createWithAi(); } }}
          disabled={busy}
          style={{ padding: "9px 11px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit", resize: "vertical" }} />

        {error && <div style={{ fontSize: 12.5, color: "#a33" }}>{error}</div>}

        <button onClick={() => void createWithAi()} disabled={busy || !description.trim()}
          style={{ padding: "10px 16px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: busy || !description.trim() ? 0.6 : 1 }}>
          {busy ? "Creating your trip…" : "Create trip"}
        </button>

        <button onClick={() => void skipToBlankTrip()} disabled={busy || create.isPending}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 12.5, color: "var(--slate)", textDecoration: "underline", cursor: "pointer" }}>
          Skip — create a blank trip instead
        </button>
      </div>
    </div>
  );
}
