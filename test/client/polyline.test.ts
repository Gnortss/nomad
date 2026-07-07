import { describe, it, expect } from "vitest";
import { decodePolyline } from "../../src/client/map/polyline";

describe("decodePolyline", () => {
  it("decodes the canonical Google example", () => {
    // from Google's polyline algorithm docs: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts[0].lat).toBeCloseTo(38.5, 5);
    expect(pts[0].lng).toBeCloseTo(-120.2, 5);
    expect(pts[1].lat).toBeCloseTo(40.7, 5);
    expect(pts[2].lng).toBeCloseTo(-126.453, 3);
  });
});
