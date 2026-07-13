import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { getTripChat, streamTripChat, clearTripChat, AiUnconfiguredError, ChatBusyError, type ChatLogItem } from "../lib/aiChat";
import { useEditorStore } from "../state/editorStore";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PEEK_PX } from "../components/BottomSheet";
import { useIsMobile } from "../lib/useIsMobile";
import { btnPrimary, iconBtn, FIELD_BORDER, RULE } from "../styles/ui";

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
  const isMobile = useIsMobile();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [replies, setReplies] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // What the assistant is doing right now (last tool label); null = thinking/writing.
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Sulfur dot on the collapsed pill: the assistant finished while collapsed.
  const [unread, setUnread] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the view should follow new messages. Cleared when the user scrolls
  // up (e.g. re-reading history mid-stream), restored when they scroll back
  // down, reopen the panel, or send a message.
  const pinnedRef = useRef(true);
  const kickoffRef = useRef(false);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  // Unmount-only cleanup: the store's action identities change with its state,
  // so listing setAiBusy as a dep would re-run this cleanup mid-turn and abort
  // the stream. The dispatch inside the closed-over action is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { abortRef.current?.abort(); setAiBusy(false); }, []);
  // Reopening re-pins (the scroll container remounts at the top); declared
  // before the follow effect so the same render's scroll sees the reset.
  useEffect(() => {
    if (chatOpen) { setUnread(false); pinnedRef.current = true; }
  }, [chatOpen]);
  // Follow new content only while pinned to the bottom — never fight a user
  // who scrolled up. busy: the "Thinking…" bubble grows the scroll area
  // without a thread change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [chatOpen, thread, replies, activity, busy]);
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
      if (!chatOpenRef.current) setUnread(true);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof AiUnconfiguredError ? "AI planning isn't configured on this server."
        : e instanceof ChatBusyError ? "The assistant is already working — give it a moment."
        : e instanceof Error ? e.message : "Something went wrong");
      // Retryable failures (overload/connection): the conversation is intact
      // server-side, so offer a chip that continues it.
      if (!(e instanceof AiUnconfiguredError) && !(e instanceof ChatBusyError)) setReplies(["Try again"]);
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
    pinnedRef.current = true; // sending snaps the view back to the newest message
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
      <button onClick={() => openChat()} aria-label={unread ? "Open AI chat — new reply" : "Open AI chat"}
        style={{ position: "absolute", right: 16, bottom: isMobile ? PEEK_PX + 4 : 16, zIndex: isMobile ? 30 : 20, display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 24, fontWeight: 700, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 8px 26px rgba(91,68,201,.45), inset 0 1px 0 rgba(255,255,255,.2)" }}>
        <Sparkles size={15} aria-hidden /> AI planner
        {unread && <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--sulfur)", boxShadow: "0 0 0 2px rgba(255,255,255,.6)", marginLeft: 2 }} />}
      </button>
    );
  }

  const errorBusy = error?.includes("already working");

  return (
    <aside aria-label="AI chat" style={isMobile
      ? { position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", background: "#fff" }
      : { width: 344, flex: "none", display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid rgba(30,42,44,.12)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderBottom: RULE }}>
        <span aria-hidden style={{ width: 28, height: 28, flex: "none", borderRadius: 9, background: "rgba(91,68,201,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={14} color="var(--lupine)" />
        </span>
        <span className="ovp" style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>AI planner</span>
        <button onClick={() => setConfirmingClear(true)} aria-label="Clear chat" title="Clear chat" style={iconBtn(28)}><Trash2 size={13} aria-hidden /></button>
        <button onClick={closeChat} aria-label="Collapse chat" style={iconBtn(28)}><X size={14} aria-hidden /></button>
      </div>

      <div ref={scrollRef}
        onScroll={(e) => { const el = e.currentTarget; pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
        {thread.map((item, i) =>
          item.kind === "tool" ? (
            <div key={i} className="mono" style={{ fontSize: 11, color: "#8FA3A0", fontStyle: "italic", padding: "0 4px" }}>· {item.text}</div>
          ) : (
            <div key={i} style={{
              alignSelf: item.kind === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%", padding: "9px 12px", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5,
              borderRadius: item.kind === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: item.kind === "user" ? "var(--lupine)" : "#F1F4F2",
              color: item.kind === "user" ? "#fff" : "inherit",
            }}>{item.text}</div>
          ),
        )}
        {busy && (
          <div role="status" aria-label="Assistant is working" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 9, maxWidth: "88%", padding: "9px 12px", borderRadius: 12, background: "rgba(91,68,201,.06)", border: "1px solid rgba(91,68,201,.18)" }}>
            <span className="ai-dots" style={{ display: "flex", gap: 3, flex: "none" }} aria-hidden><span /><span /><span /></span>
            <span style={{ fontSize: 12, color: "var(--lupine)", fontWeight: 600, lineHeight: 1.35 }}>{activity ?? "Thinking…"}</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ margin: "0 13px 8px", display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 11px", borderRadius: 9, fontSize: 12.5, lineHeight: 1.45,
          background: errorBusy ? "rgba(227,154,12,.09)" : "rgba(178,58,46,.07)",
          border: errorBusy ? "1px solid rgba(227,154,12,.35)" : "1px solid rgba(178,58,46,.25)",
          color: errorBusy ? "#8A5C00" : "#8C2D23" }}>
          <TriangleAlert size={13} aria-hidden style={{ flex: "none", marginTop: 1 }} />
          {error}
        </div>
      )}

      {replies.length > 0 && !busy && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 13px 8px" }}>
          {replies.map((r) => (
            <button key={r} onClick={() => void send(r)}
              style={{ padding: "5px 12px", background: "rgba(91,68,201,.06)", color: "var(--lupine)", border: "1px solid rgba(91,68,201,.35)", borderRadius: 16, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, padding: "0 13px 13px" }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Ask for changes or new days…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          disabled={busy}
          style={{ flex: 1, padding: "9px 11px", border: FIELD_BORDER, borderRadius: 10, fontSize: 13, lineHeight: 1.4, fontFamily: "inherit", resize: "none", background: busy ? "var(--panel)" : "#fff", boxShadow: "inset 0 1px 2px rgba(22,33,31,.04)" }} />
        <button onClick={() => void send(input)} disabled={busy || !input.trim()}
          style={{ ...btnPrimary(), height: "auto", padding: "0 15px", borderRadius: 10, fontSize: 13, opacity: busy || !input.trim() ? 0.55 : 1 }}>
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
