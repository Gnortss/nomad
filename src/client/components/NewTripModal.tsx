import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateTrip } from "../lib/api";
import { streamAiChat, AiUnconfiguredError, type AiMessages } from "../lib/aiChat";

type ThreadItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; label: string };

const INTRO =
  "Describe the trip you have in mind — where to, roughly when and for how long, and the vibe (camping road trip, nature, cities…). I'll ask a couple of questions, research, and build a day-by-day plan for you.";

export function NewTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: (tripId: string) => void }) {
  const qc = useQueryClient();
  const create = useCreateTrip();
  const [name, setName] = useState("");
  const [input, setInput] = useState("");
  const [thread, setThread] = useState<ThreadItem[]>([{ kind: "assistant", text: INTRO }]);
  const [messages, setMessages] = useState<AiMessages>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  function append(item: ThreadItem) {
    setThread((t) => [...t, item]);
  }
  function appendAssistantDelta(delta: string) {
    setThread((t) => {
      const last = t[t.length - 1];
      if (last?.kind === "assistant") return [...t.slice(0, -1), { kind: "assistant", text: last.text + delta }];
      return [...t, { kind: "assistant", text: delta }];
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    append({ kind: "user", text });
    setBusy(true);

    const nextMessages = [...messages, { role: "user", content: [{ type: "text", text }] }];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAiChat(
        { messages: nextMessages, tripName: name.trim() || undefined },
        {
          onText: appendAssistantDelta,
          onTool: (label) => append({ kind: "tool", label }),
          onMessagesState: setMessages,
          onTripCreated: (tripId) => {
            setCreating(true);
            qc.invalidateQueries({ queryKey: ["trips"] });
            onCreated(tripId);
          },
        },
        ctrl.signal,
      );
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof AiUnconfiguredError
        ? "AI planning isn't configured on this server — you can still create a blank trip below."
        : e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function skipToBlankTrip() {
    const trip = await create.mutateAsync(name.trim() || "New trip");
    onCreated((trip as { id: string }).id);
  }

  return (
    <div role="dialog" aria-label="New trip" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(30,42,44,.4)", zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 640, maxWidth: "94vw", display: "flex", flexDirection: "column", gap: 12, maxHeight: "88vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>New trip</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: "none", background: "rgba(87,103,107,.12)", borderRadius: 7, cursor: "pointer", fontSize: 15 }}>×</button>
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trip name (optional — the AI will suggest one)"
          style={{ padding: "9px 11px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit" }} />

        <div ref={scrollRef} style={{ flex: 1, minHeight: 260, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px" }}>
          {thread.map((item, i) =>
            item.kind === "tool" ? (
              <div key={i} className="mono" style={{ fontSize: 11.5, color: "var(--slate)", fontStyle: "italic", padding: "0 6px" }}>· {item.label}</div>
            ) : (
              <div key={i} style={{
                alignSelf: item.kind === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%", padding: "9px 12px", borderRadius: 10, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.45,
                background: item.kind === "user" ? "var(--lupine)" : "#F4F6F6",
                color: item.kind === "user" ? "#fff" : "inherit",
              }}>{item.text}</div>
            ),
          )}
          {busy && <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)", padding: "0 6px" }}>…</div>}
          {creating && <div className="mono" style={{ fontSize: 11.5, color: "var(--moss)", padding: "0 6px" }}>Trip created — opening the editor…</div>}
        </div>

        {error && <div style={{ fontSize: 12.5, color: "#a33" }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="e.g. 10 days of camping around Slovenia in July, slow pace"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            disabled={busy || creating}
            style={{ flex: 1, padding: "9px 11px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit", resize: "none" }} />
          <button onClick={() => void send()} disabled={busy || creating || !input.trim()}
            style={{ padding: "0 16px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer", opacity: busy || !input.trim() ? 0.6 : 1 }}>
            Send
          </button>
        </div>

        <button onClick={() => void skipToBlankTrip()} disabled={creating || create.isPending}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 12.5, color: "var(--slate)", textDecoration: "underline", cursor: "pointer" }}>
          Skip — create a blank trip instead
        </button>
      </div>
    </div>
  );
}
