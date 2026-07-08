// Streaming client for POST /api/ai/chat (SSE over fetch — EventSource can't POST).
// `messages` is the opaque Anthropic conversation state: the server returns the full
// updated array after each turn and we send it back verbatim on the next one.

export type AiMessages = unknown[];

export type AiChatHandlers = {
  onText: (delta: string) => void;
  onTool: (label: string) => void;
  onMessagesState: (messages: AiMessages) => void;
  onTripCreated: (tripId: string) => void;
};

export class AiUnconfiguredError extends Error {
  constructor() { super("AI planning is not configured (missing API key)"); }
}

export async function streamAiChat(
  body: { messages: AiMessages; tripName?: string },
  h: AiChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 503) throw new AiUnconfiguredError();
  if (!res.ok || !res.body) throw new Error(`AI chat request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let errorMessage: string | null = null;

  const dispatch = (event: string, raw: string) => {
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    switch (event) {
      case "text": h.onText(String(data.delta ?? "")); break;
      case "tool": h.onTool(String(data.label ?? "")); break;
      case "messages_state": h.onMessagesState(data.messages as AiMessages); break;
      case "trip_created": h.onTripCreated(String(data.tripId)); break;
      // Inspect the AI's submitted plan / insertion counts in the browser console.
      case "debug": console.debug(`[ai-plan] ${String(data.label)}`, data.data); break;
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
  if (errorMessage) throw new Error(errorMessage);
}
