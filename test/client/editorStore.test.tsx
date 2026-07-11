import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";

const wrapper = ({ children }: { children: React.ReactNode }) => <EditorStoreProvider>{children}</EditorStoreProvider>;

describe("editorStore", () => {
  it("selectDay sets/replaces/clears, selectPoint is independent", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    act(() => result.current.selectDay("d1"));
    expect(result.current.selectedDayId).toBe("d1");
    act(() => result.current.selectDay("d2"));         // replace, not toggle
    expect(result.current.selectedDayId).toBe("d2");

    act(() => result.current.selectPoint("p9"));
    expect(result.current.selectedDayId).toBe("d2");   // unchanged by selectPoint
    expect(result.current.selectedPointId).toBe("p9");

    act(() => result.current.selectDay(null));
    expect(result.current.selectedDayId).toBeNull();
  });

  it("expansion is multi-day and independent of selection", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    act(() => result.current.toggleDayExpanded("d1"));
    act(() => result.current.toggleDayExpanded("d2"));
    expect(result.current.expandedDayIds.has("d1")).toBe(true);
    expect(result.current.expandedDayIds.has("d2")).toBe(true);
    expect(result.current.selectedDayId).toBeNull();   // expanding never selects

    act(() => result.current.toggleDayExpanded("d1")); // collapse d1 only
    expect(result.current.expandedDayIds.has("d1")).toBe(false);
    expect(result.current.expandedDayIds.has("d2")).toBe(true);

    act(() => result.current.selectDay("d3"));
    expect(result.current.expandedDayIds.has("d3")).toBe(false); // selecting never expands
  });

  it("expandDay adds idempotently (for drag-over)", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    act(() => result.current.expandDay("d1"));
    act(() => result.current.expandDay("d1"));
    expect(result.current.expandedDayIds.has("d1")).toBe(true);
    expect(result.current.expandedDayIds.size).toBe(1);
  });

  it("starts with the chat closed when initialChatOpen is false", () => {
    const { result } = renderHook(() => useEditorStore(), {
      wrapper: ({ children }) => <EditorStoreProvider initialChatOpen={false}>{children}</EditorStoreProvider>,
    });
    expect(result.current.chatOpen).toBe(false);
  });

  it("drop-pin mode starts and cancels", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    expect(result.current.droppingPin).toBe(false);
    act(() => result.current.startDropPin());
    expect(result.current.droppingPin).toBe(true);
    act(() => result.current.cancelDropPin());
    expect(result.current.droppingPin).toBe(false);
  });
});
