import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Trash2, X } from "lucide-react";
import { getTripChat, streamTripChat, clearTripChat, AiUnconfiguredError, ChatBusyError, type ChatLogItem } from "../lib/aiChat";
import { useEditorStore } from "../state/editorStore";
import { ConfirmDialog } from "../components/ConfirmDialog";

type ThreadItem = ChatLogItem;

const INTRO: ThreadItem = {
  kind: "assistant",
  text: "I can plan this trip with you — describe what you have in mind, or ask me to refine specific days.",
};

// Right-side AI chat. All conversation state lives on the server; this panel
// renders the display log, streams the turn in flight, and refetches the trip
// whenever the assistant edits it (trip_updated).
export function ChatPanel({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const { chatOpen, closeChat, openChat, chatPrefill, consumeChatPrefill, setAiBusy } = useEditorStore();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [replies, setReplies] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // What the assistant is doing right now (last tool label); null = thinking/writing.
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const kickoffRef = useRef(false);

  // Unmount-only cleanup: the store's action identities change with its state,
  // so listing setAiBusy as a dep would re-run this cleanup mid-turn and abort
  // the stream. The dispatch inside the closed-over action is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { abortRef.current?.abort(); setAiBusy(false); }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, replies, activity]);
  useEffect(() => {
    if (chatPrefill != null) { setInput(chatPrefill); consumeChatPrefill(); }
  }, [chatPrefill, consumeChatPrefill]);

  function appendAssistantDelta(delta: string) {
    setThread((t) => {
      const last = t[t.length - 1];
      if (last?.kind === "assistant") return [...t.slice(0, -1), { kind: "assistant", text: last.text + delta }];
      return [...t, { kind: "assistant", text: delta }];
    });
  }

  async function runTurn(body: { text: string } | { start: true }) {
    setBusy(true);
    setAiBusy(true);
    setActivity(null);
    setError(null);
    setReplies([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamTripChat(tripId, body, {
        onText: (delta) => { setActivity(null); appendAssistantDelta(delta); },
        onTool: (label) => { setActivity(label); setThread((t) => [...t, { kind: "tool", text: label }]); },
        onReplies: setReplies,
        onTripUpdated: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
      }, ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof AiUnconfiguredError ? "AI planning isn't configured on this server."
        : e instanceof ChatBusyError ? "The assistant is already working — give it a moment."
        : e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setAiBusy(false);
      setActivity(null);
    }
  }

  // Load the transcript once; kick off from the stored description when the
  // trip is fresh from the new-trip modal (exactly once — the server consumes
  // the seed atomically, so a double mount is harmless anyway).
  useEffect(() => {
    let cancelled = false;
    getTripChat(tripId).then(({ log, busy: serverBusy, pendingSeed }) => {
      if (cancelled) return;
      setThread(log.length ? log : [INTRO]);
      if (serverBusy) setError("The assistant is finishing a previous turn — reload in a moment to see it.");
      if (pendingSeed && !kickoffRef.current) {
        kickoffRef.current = true;
        setThread([]); // the server logs the seed as the first user message
        void runTurn({ start: true });
      }
    }).catch(() => { if (!cancelled) setThread([INTRO]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setThread((th) => [...th, { kind: "user", text: t }]);
    await runTurn({ text: t });
  }

  async function clear() {
    setConfirmingClear(false);
    abortRef.current?.abort();
    await clearTripChat(tripId);
    setThread([INTRO]);
    setReplies([]);
    setError(null);
    setBusy(false);
  }

  if (!chatOpen) {
    return (
      <button onClick={() => openChat()} aria-label="Open AI chat"
        style={{ position: "absolute", right: 14, bottom: 14, zIndex: 20, display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 22, fontWeight: 600, fontSize: 13, cursor: "pointer", boxShadow: "0 6px 20px rgba(30,42,44,.25)" }}>
        <MessageSquareText size={15} aria-hidden /> AI planner
      </button>
    );
  }

  return (
    <aside aria-label="AI chat" style={{ width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid rgba(87,103,107,.18)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(87,103,107,.14)" }}>
        <MessageSquareText size={15} color="var(--lupine)" aria-hidden />
        <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>AI planner</span>
        <button onClick={() => setConfirmingClear(true)} aria-label="Clear chat" title="Clear chat"
          style={{ display: "flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "var(--slate)", cursor: "pointer" }}><Trash2 size={14} aria-hidden /></button>
        <button onClick={closeChat} aria-label="Collapse chat"
          style={{ display: "flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "var(--slate)", cursor: "pointer" }}><X size={15} aria-hidden /></button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 9, padding: 12 }}>
        {thread.map((item, i) =>
          item.kind === "tool" ? (
            <div key={i} className="mono" style={{ fontSize: 11, color: "var(--slate)", fontStyle: "italic", padding: "0 4px" }}>· {item.text}</div>
          ) : (
            <div key={i} style={{
              alignSelf: item.kind === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%", padding: "8px 11px", borderRadius: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.45,
              background: item.kind === "user" ? "var(--lupine)" : "#F4F6F6",
              color: item.kind === "user" ? "#fff" : "inherit",
            }}>{item.text}</div>
          ),
        )}
        {busy && (
          <div role="status" aria-label="Assistant is working" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 9, maxWidth: "88%", padding: "9px 12px", borderRadius: 10, background: "rgba(91,68,201,.07)", border: "1px solid rgba(91,68,201,.18)" }}>
            <span className="ai-dots" style={{ display: "flex", gap: 3, flex: "none" }} aria-hidden><span /><span /><span /></span>
            <span style={{ fontSize: 12, color: "var(--lupine)", fontWeight: 500, lineHeight: 1.35 }}>{activity ?? "Thinking…"}</span>
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: "#a33", padding: "0 12px 6px" }}>{error}</div>}

      {replies.length > 0 && !busy && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 8px" }}>
          {replies.map((r) => (
            <button key={r} onClick={() => void send(r)}
              style={{ padding: "5px 11px", background: "rgba(91,68,201,.08)", color: "var(--lupine)", border: "1px solid rgba(91,68,201,.35)", borderRadius: 15, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, padding: "0 12px 12px" }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Ask for changes or new days…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          disabled={busy}
          style={{ flex: 1, padding: "8px 10px", border: "1px solid rgba(87,103,107,.3)", borderRadius: 7, fontSize: 13, fontFamily: "inherit", resize: "none" }} />
        <button onClick={() => void send(input)} disabled={busy || !input.trim()}
          style={{ padding: "0 13px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: busy || !input.trim() ? 0.6 : 1 }}>
          Send
        </button>
      </div>

      {confirmingClear && (
        <ConfirmDialog title="Clear this chat?" body="The conversation history is removed; the trip itself stays as it is."
          confirmLabel="Clear chat" onConfirm={() => void clear()} onCancel={() => setConfirmingClear(false)} />
      )}
    </aside>
  );
}
