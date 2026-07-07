import { describe, it, expect } from "vitest";
import { googleRouteComputer } from "../../src/worker/lib/routes-google";

describe("googleRouteComputer", () => {
  it("posts origin/destination/intermediates and parses the response", async () => {
    let captured: any = null;
    const fakeFetch = async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({
        routes: [{ polyline: { encodedPolyline: "abc" }, distanceMeters: 214000, duration: "11400s" }],
      }), { status: 200 });
    };
    const compute = googleRouteComputer("KEY", fakeFetch as unknown as typeof fetch);
    const r = await compute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }]);
    expect(r).toEqual({ polyline: "abc", distanceM: 214000, durationS: 11400 });
    expect(captured.origin.location.latLng).toEqual({ latitude: 1, longitude: 1 });
    expect(captured.destination.location.latLng).toEqual({ latitude: 3, longitude: 3 });
    expect(captured.intermediates).toHaveLength(1);
    expect(captured.routingPreference).toBe("TRAFFIC_UNAWARE");
  });
});
