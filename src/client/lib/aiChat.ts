// Client for the per-trip AI chat (SSE over fetch — EventSource can't POST).
// The server owns all conversation state; the client only renders the display
// log and streams events for the turn in flight.

export type ChatLogItem = { kind: "user" | "assistant" | "tool"; text: string };

export type TripChatHandlers = {
  onText: (delta: string) => void;
  onTool: (label: string) => void;
  onReplies: (replies: string[]) => void;
  onTripUpdated: () => void;
  onError?: (message: string) => void;
};

export class AiUnconfiguredError extends Error {
  constructor() { super("AI planning is not configured (missing API key)"); }
}
export class ChatBusyError extends Error {
  constructor() { super("The assistant is already working on a turn"); }
}

// One-shot trip creation from a description (POST /api/ai/new-trip): the server
// extracts title/center/profile, stores the description as the chat seed, and
// the editor's chat panel kicks off from it.
export async function createAiTrip(body: { name?: string; description: string }): Promise<{ tripId: string }> {
  const res = await fetch("/api/ai/new-trip", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 503) throw new AiUnconfiguredError();
  if (!res.ok) throw new Error(`Trip creation failed (${res.status})`);
  return res.json() as Promise<{ tripId: string }>;
}

export async function getTripChat(tripId: string): Promise<{ log: ChatLogItem[]; busy: boolean; pendingSeed: boolean }> {
  const res = await fetch(`/api/ai/trips/${tripId}/chat`, { credentials: "include" });
  if (!res.ok) throw new Error(`Chat load failed (${res.status})`);
  return res.json() as Promise<{ log: ChatLogItem[]; busy: boolean; pendingSeed: boolean }>;
}

export async function clearTripChat(tripId: string): Promise<void> {
  const res = await fetch(`/api/ai/trips/${tripId}/chat`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`Chat clear failed (${res.status})`);
}

// Runs one chat turn ({text} or {start:true} for the seed kickoff) and streams
// its events. Resolves when the turn finishes; throws on transport/turn errors.
export async function streamTripChat(
  tripId: string,
  body: { text: string } | { start: true },
  h: TripChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/ai/trips/${tripId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 503) throw new AiUnconfiguredError();
  if (res.status === 409) throw new ChatBusyError();
  if (!res.ok || !res.body) throw new Error(`AI chat request failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) return; // {started:false} no-op kickoff

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let errorMessage: string | null = null;

  const dispatch = (event: string, raw: string) => {
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    switch (event) {
      case "text": h.onText(String(data.delta ?? "")); break;
      case "tool": h.onTool(String(data.label ?? "")); break;
      case "replies": h.onReplies(Array.isArray(data.replies) ? (data.replies as string[]) : []); break;
      case "trip_updated": h.onTripUpdated(); break;
      // Inspect tool inputs / edit counts in the browser console.
      case "debug": console.debug(`[ai-chat] ${String(data.label)}`, data.data); break;
      case "error": errorMessage = String(data.message ?? "AI request failed"); break;
      case "done": break;
    }
  };

  const parseFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length || event !== "message") dispatch(event, dataLines.join("\n"));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx).replace(/\r/g, "");
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) parseFrame(frame);
    }
  }
  if (errorMessage) {
    h.onError?.(errorMessage);
    throw new Error(errorMessage);
  }
}
