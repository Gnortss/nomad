import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { TripThumb, projectAll } from "../../src/client/map/TripThumb";

// Google's canonical polyline example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
const ENC = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

describe("projectAll", () => {
  it("keeps all output inside the padded viewBox and flips north to smaller y", () => {
    const { dots } = projectAll([{ lat: 64.1, lng: -21.9 }, { lat: 63.4, lng: -19.0 }], []);
    expect(dots).toHaveLength(2);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(14);
      expect(d.x).toBeLessThanOrEqual(240 - 14);
      expect(d.y).toBeGreaterThanOrEqual(14);
      expect(d.y).toBeLessThanOrEqual(120 - 14);
    }
    expect(dots[0].y).toBeLessThan(dots[1].y); // 64.1°N sits above 63.4°N
  });

  it("preserves aspect ratio (wide bbox stays wide)", () => {
    // ~1° tall, ~10° wide near the equator → x-span must exceed y-span
    const { dots } = projectAll([{ lat: 0, lng: 0 }, { lat: 1, lng: 10 }], []);
    const xSpan = Math.abs(dots[0].x - dots[1].x);
    const ySpan = Math.abs(dots[0].y - dots[1].y);
    expect(xSpan).toBeGreaterThan(ySpan);
  });

  it("includes polyline vertices in the fit", () => {
    const { paths } = projectAll([], [ENC]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveLength(3);
  });
});

describe("TripThumb", () => {
  it("renders a dot per point and a path per polyline", () => {
    const { container } = render(<TripThumb points={[{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }]} routePolylines={[ENC]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("renders only the background for an empty trip", () => {
    const { container } = render(<TripThumb points={[]} routePolylines={[]} />);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("centers a single point", () => {
    const { container } = render(<TripThumb points={[{ lat: 46, lng: 14 }]} routePolylines={[]} />);
    const c = container.querySelector("circle")!;
    expect(Number(c.getAttribute("cx"))).toBe(120);
    expect(Number(c.getAttribute("cy"))).toBe(60);
  });
});
