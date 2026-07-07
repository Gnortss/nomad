import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "../../src/client/screens/AppShell";

// The map SDK is not loaded in jsdom; stub the wrapper so we test structure, not Google.
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="api-provider">{children}</div>,
  Map: () => <div data-testid="map" />,
}));
vi.mock("../../src/client/lib/auth", () => ({ signOut: vi.fn() }));

describe("MapCanvas mounting", () => {
  it("renders exactly one map instance in the shell", () => {
    const { getAllByTestId } = render(<AppShell />);
    expect(getAllByTestId("map")).toHaveLength(1);
  });
});
