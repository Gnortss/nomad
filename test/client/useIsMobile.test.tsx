import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useIsMobile } from "../../src/client/lib/useIsMobile";

// jsdom's matchMedia always reports matches:false and never fires change
// events, so stub it with a controllable fake.
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })));
  return (next: boolean) => { matches = next; listeners.forEach((cb) => cb()); };
}

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it("reflects the media query and reacts to changes", () => {
    const setMatches = stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    act(() => setMatches(false));
    expect(result.current).toBe(false);
  });

  it("is false on desktop viewports", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
