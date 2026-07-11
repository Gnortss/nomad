import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BottomSheet, detentHeight, closestDetent, PEEK_PX } from "../../src/client/components/BottomSheet";

describe("detent math", () => {
  it("computes detent heights from the container height", () => {
    expect(detentHeight("peek", 800)).toBe(PEEK_PX);
    expect(detentHeight("half", 800)).toBe(400);
    expect(detentHeight("full", 800)).toBe(720);
  });

  it("snaps to the nearest detent", () => {
    expect(closestDetent(100, 800)).toBe("peek");
    expect(closestDetent(390, 800)).toBe("half");
    expect(closestDetent(700, 800)).toBe("full");
    // exactly between half (400) and full (720) → half wins (checked first)
    expect(closestDetent(560, 800)).toBe("half");
  });
});

describe("BottomSheet", () => {
  it("renders header and children with a drag handle, starting at half", () => {
    render(<BottomSheet header={<span>214 km</span>}><div data-testid="content" /></BottomSheet>);
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.getByText("214 km")).toBeTruthy();
    const handle = screen.getByLabelText("Resize day list");
    // jsdom: clientHeight is 0, so the container falls back to window.innerHeight (768)
    expect(handle.parentElement!.style.height).toBe(`${detentHeight("half", 768)}px`);
  });

  it("snaps to full after dragging the handle up", () => {
    render(<BottomSheet><div /></BottomSheet>);
    const handle = screen.getByLabelText("Resize day list");
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 200, pointerId: 1 }); // up 300px from half(384) → 684
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(handle.parentElement!.style.height).toBe(`${detentHeight("full", 768)}px`);
  });
});
