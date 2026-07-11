import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TripChatHandlers } from "../../src/client/lib/aiChat";

const getTripChat = vi.fn();
const streamTripChat = vi.fn();
const clearTripChat = vi.fn();
vi.mock("../../src/client/lib/aiChat", async (orig) => ({
  ...(await orig<object>()),
  getTripChat: (id: string) => getTripChat(id),
  streamTripChat: (id: string, body: object, h: TripChatHandlers, s?: AbortSignal) => streamTripChat(id, body, h, s),
  clearTripChat: (id: string) => clearTripChat(id),
}));

import { ChatPanel } from "../../src/client/editor/ChatPanel";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";

let isMobile = false;
vi.mock("../../src/client/lib/useIsMobile", () => ({ useIsMobile: () => isMobile }));

const wrap = (initialChatOpen = true) => render(
  <QueryClientProvider client={new QueryClient()}>
    <EditorStoreProvider initialChatOpen={initialChatOpen}>
      <ChatPanel tripId="t1" />
    </EditorStoreProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  getTripChat.mockReset();
  streamTripChat.mockReset();
  clearTripChat.mockReset();
});

describe("ChatPanel", () => {
  it("renders the stored transcript", async () => {
    getTripChat.mockResolvedValue({
      log: [{ kind: "user", text: "plan slovenia" }, { kind: "tool", text: "Writing day 1" }, { kind: "assistant", text: "Day 1 is in." }],
      busy: false, pendingSeed: false,
    });
    wrap();
    await screen.findByText("plan slovenia");
    expect(screen.getByText("· Writing day 1")).toBeTruthy();
    expect(screen.getByText("Day 1 is in.")).toBeTruthy();
    expect(streamTripChat).not.toHaveBeenCalled(); // no seed → no kickoff
  });

  it("kicks off from a pending seed exactly once", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: true });
    streamTripChat.mockImplementation(async (_id: string, _b: object, h: TripChatHandlers) => {
      h.onText("Sounds great — researching…");
    });
    wrap();
    await waitFor(() => expect(streamTripChat).toHaveBeenCalledTimes(1));
    expect(streamTripChat.mock.calls[0][1]).toEqual({ start: true });
    await screen.findByText("Sounds great — researching…");
  });

  it("sends a message, streams the reply, and shows quick-reply chips that send on click", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    streamTripChat.mockImplementation(async (_id: string, body: { text?: string }, h: TripChatHandlers) => {
      if (body.text === "plan day 2") {
        h.onText("Coast or mountains?");
        h.onReplies(["Coast", "Mountains"]);
      } else {
        h.onText("Mountains it is.");
      }
    });
    wrap();
    const input = await screen.findByPlaceholderText(/Ask for changes/);
    fireEvent.change(input, { target: { value: "plan day 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Coast or mountains?");
    const chip = await screen.findByRole("button", { name: "Mountains" });
    fireEvent.click(chip);
    await screen.findByText("Mountains it is.");
    expect(streamTripChat.mock.calls[1][1]).toEqual({ text: "Mountains" });
    expect(screen.queryByRole("button", { name: "Coast" })).toBeNull(); // chips cleared on send
  });

  it("offers a Try again chip when the turn fails with a transient error", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    streamTripChat.mockImplementationOnce(async () => { throw new Error("Overloaded"); });
    streamTripChat.mockImplementation(async (_id: string, _b: object, h: TripChatHandlers) => {
      h.onText("Picking up where we left off.");
    });
    wrap();
    const input = await screen.findByPlaceholderText(/Ask for changes/);
    fireEvent.change(input, { target: { value: "plan it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Overloaded"); // error banner
    const chip = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(chip);
    await screen.findByText("Picking up where we left off.");
    expect(streamTripChat.mock.calls[1][1]).toEqual({ text: "Try again" });
    expect(screen.queryByText("Overloaded")).toBeNull(); // banner cleared by the new turn
  });

  it("shows a live activity bubble while a turn runs: Thinking…, then the current tool label", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    let handlers!: TripChatHandlers;
    let finish!: () => void;
    let signal!: AbortSignal;
    streamTripChat.mockImplementation((_id: string, _b: object, h: TripChatHandlers, s: AbortSignal) => {
      handlers = h;
      signal = s;
      return new Promise<void>((res) => { finish = res; });
    });
    wrap();
    const input = await screen.findByPlaceholderText(/Ask for changes/);
    fireEvent.change(input, { target: { value: "plan it" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Thinking…"); // before any event: generic state
    // Regression guard: store updates during the turn must NOT re-run the
    // unmount cleanup and abort the in-flight stream.
    expect(signal.aborted).toBe(false);
    act(() => handlers.onTool("Searching: campsites Bled"));
    expect(signal.aborted).toBe(false);
    // The bubble shows the CURRENT activity; the permanent tool line appears too.
    expect((await screen.findAllByText("Searching: campsites Bled")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("status", { name: "Assistant is working" })).toBeTruthy();
    act(() => handlers.onText("Found three.")); // streaming text → back to plain dots state
    await screen.findByText("Thinking…");

    act(() => finish());
    await waitFor(() => expect(screen.queryByRole("status", { name: "Assistant is working" })).toBeNull());
  });

  it("invalidates the trip query on trip_updated", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    streamTripChat.mockImplementation(async (_id: string, _b: object, h: TripChatHandlers) => {
      h.onTripUpdated();
    });
    render(
      <QueryClientProvider client={qc}>
        <EditorStoreProvider><ChatPanel tripId="t1" /></EditorStoreProvider>
      </QueryClientProvider>
    );
    const input = await screen.findByPlaceholderText(/Ask for changes/);
    fireEvent.change(input, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["trip", "t1"] }));
  });

  it("clears the chat after confirmation", async () => {
    getTripChat.mockResolvedValue({ log: [{ kind: "user", text: "old message" }], busy: false, pendingSeed: false });
    clearTripChat.mockResolvedValue(undefined);
    wrap();
    await screen.findByText("old message");
    fireEvent.click(screen.getByRole("button", { name: "Clear chat" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Clear chat" }).at(-1)!); // dialog confirm
    await waitFor(() => expect(clearTripChat).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(screen.queryByText("old message")).toBeNull());
  });

  it("shows an unread dot when a turn finishes while collapsed; opening clears it", async () => {
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: true });
    let finishTurn!: () => void;
    streamTripChat.mockImplementation((_id: string, _b: object, h: TripChatHandlers) =>
      new Promise<void>((res) => { h.onText("First draft is in."); finishTurn = res; }));
    function Harness() {
      const { closeChat } = useEditorStore();
      return <><button onClick={closeChat}>collapse</button><ChatPanel tripId="t1" /></>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditorStoreProvider><Harness /></EditorStoreProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(streamTripChat).toHaveBeenCalled());
    fireEvent.click(screen.getByText("collapse"));
    await act(async () => { finishTurn(); });
    const pill = await screen.findByRole("button", { name: "Open AI chat — new reply" });
    fireEvent.click(pill);
    // reopened: the pill is gone; collapsing again shows no dot (unread cleared)
    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
    expect(screen.getByRole("button", { name: "Open AI chat" })).toBeTruthy();
  });

  it("expands to a full-screen overlay on mobile", async () => {
    isMobile = true;
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    wrap();
    const aside = screen.getByLabelText("AI chat");
    expect(aside.style.position).toBe("fixed");
    isMobile = false;
  });

  it("floats the collapsed pill above the sheet peek on mobile", async () => {
    isMobile = true;
    getTripChat.mockResolvedValue({ log: [], busy: false, pendingSeed: false });
    wrap(false);
    const pill = screen.getByRole("button", { name: "Open AI chat" });
    expect(pill.style.bottom).toBe("100px"); // PEEK_PX + 4
    isMobile = false;
  });
});