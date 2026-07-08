import { describe, it, expect } from "vitest";
import { googlePlaceDetails } from "../../src/worker/lib/places";

const BODY = {
  formattedAddress: "Skógafoss, 861, Iceland",
  rating: 4.8,
  userRatingCount: 34211,
  regularOpeningHours: { weekdayDescriptions: ["Monday: Open 24 hours"] },
  websiteUri: "https://example.is",
  internationalPhoneNumber: "+354 555 1234",
};

describe("googlePlaceDetails", () => {
  it("requests the place with the frozen field mask and parses the response", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    const fakeFetch = async (u: string, init: RequestInit) => {
      url = u;
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify(BODY), { status: 200 });
    };
    const details = await googlePlaceDetails("KEY", fakeFetch as unknown as typeof fetch)("pid123");
    expect(url).toBe("https://places.googleapis.com/v1/places/pid123");
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toBe(
      "formattedAddress,rating,userRatingCount,regularOpeningHours.weekdayDescriptions,websiteUri,internationalPhoneNumber");
    expect(details).toEqual({
      formattedAddress: "Skógafoss, 861, Iceland",
      rating: 4.8,
      userRatingCount: 34211,
      weekdayHours: ["Monday: Open 24 hours"],
      websiteUri: "https://example.is",
      phone: "+354 555 1234",
    });
  });

  it("nulls missing fields and defaults hours to an empty list", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ formattedAddress: "X" }), { status: 200 });
    const details = await googlePlaceDetails("KEY", fakeFetch as unknown as typeof fetch)("pid123");
    expect(details).toEqual({
      formattedAddress: "X", rating: null, userRatingCount: null, weekdayHours: [], websiteUri: null, phone: null,
    });
  });

  it("returns null on a non-OK response", async () => {
    const fakeFetch = async () => new Response("nope", { status: 403 });
    expect(await googlePlaceDetails("KEY", fakeFetch as unknown as typeof fetch)("pid123")).toBeNull();
  });
});
