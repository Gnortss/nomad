import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TypeIcon } from "../../src/client/components/TypeIcon";

describe("TypeIcon", () => {
  it("renders the mapped lucide glyph for a known type", () => {
    const { container } = render(<TypeIcon type="camp" />);
    expect(container.querySelector("svg.lucide-tent")).toBeTruthy();
  });
  it("falls back to the map-pin glyph for unknown types", () => {
    const { container } = render(<TypeIcon type="???" />);
    expect(container.querySelector("svg.lucide-map-pin")).toBeTruthy();
  });
  it("applies size and color", () => {
    const { container } = render(<TypeIcon type="fuel" size={16} color="#fff" />);
    const svg = container.querySelector("svg.lucide-fuel")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("stroke")).toBe("#fff");
  });
});
