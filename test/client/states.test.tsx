import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyTrip, RouteFailed, RouteComputing } from "../../src/client/editor/states";

describe("finished-feel states", () => {
  it("empty trip uses the exact microcopy", () => {
    render(<EmptyTrip />);
    expect(screen.getByText("No stops yet.")).toBeTruthy();
    expect(screen.getByText(/Search for a place or drop a pin/)).toBeTruthy();
  });
  it("route failed shows retry and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<RouteFailed onRetry={onRetry} />);
    expect(screen.getByText(/Your stops are safe/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("route computing shows the measuring copy", () => {
    render(<RouteComputing />);
    expect(screen.getByText(/Measuring the drive/)).toBeTruthy();
  });
});
