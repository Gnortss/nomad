import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EditorStoreProvider, useEditorStore } from "../../src/client/state/editorStore";

const wrapper = ({ children }: { children: React.ReactNode }) => <EditorStoreProvider>{children}</EditorStoreProvider>;

describe("editorStore", () => {
  it("focusDay toggles, selectPoint is independent", () => {
    const { result } = renderHook(() => useEditorStore(), { wrapper });
    act(() => result.current.focusDay("d1"));
    expect(result.current.focusedDayId).toBe("d1");
    act(() => result.current.focusDay("d1"));         // toggle off
    expect(result.current.focusedDayId).toBeNull();

    act(() => result.current.focusDay("d2"));
    act(() => result.current.selectPoint("p9"));
    expect(result.current.focusedDayId).toBe("d2");    // unchanged by selectPoint
    expect(result.current.selectedPointId).toBe("p9");

    act(() => result.current.clearFocus());
    expect(result.current.focusedDayId).toBeNull();
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
