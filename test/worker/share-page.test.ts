import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days, dayRoutes } from "../../src/worker/db/schema";
import { sharePageRouter } from "../../src/worker/routes/share-page";
import { buildDescription, injectOgTags } from "../../src/worker/lib/og-tags";
import { appWith } from "../helpers/session";

const SHELL =
  "<!doctype html><html><head><title>NOMAD</title></head><body><div id=root></div></body></html>";

// The worker test env has no real ASSETS binding; stub it to return a minimal shell.
function envWithAssets() {
  return {
    ...env,
    ASSETS: { fetch: async () => new Response(SHELL, { headers: { "content-type": "text/html" } }) },
  } as unknown as typeof env;
}

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, envWithAssets(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("buildDescription", () => {
  it("formats days, distance, and drive time", () => {
    expect(buildDescription({ dayCount: 8, totalDistanceM: 1_240_000, totalDurationS: 64_800 }))
      .toBe("8 days · 1,240 km · 18h drive");
  });
  it("uses the singular for a one-day trip", () => {
    expect(buildDescription({ dayCount: 1, totalDistanceM: 5_000, totalDurationS: 600 }))
      .toBe("1 day · 5 km · 0h drive");
  });
  it("drops distance and drive time when there are no routes", () => {
    expect(buildDescription({ dayCount: 8, totalDistanceM: 0, totalDurationS: 0 }))
      .toBe("8 days");
  });
});

describe("injectOgTags", () => {
  it("escapes the trip name and replaces the shell title", () => {
    const out = injectOgTags(SHELL, { name: 'A & B "C" <x>', description: "3 days", shareUrl: "http://x/s/t" });
    expect(out).toContain("<title>A &amp; B &quot;C&quot; &lt;x&gt;</title>");
    expect(out).toContain('property="og:title" content="A &amp; B &quot;C&quot; &lt;x&gt;"');
    expect(out).not.toContain("<title>NOMAD</title>");
  });
  it("appends tags when the shell has no </head>", () => {
    const out = injectOgTags("<html><body></body></html>", { name: "T", description: "d", shareUrl: "u" });
    expect(out).toContain('property="og:title" content="T"');
  });
});

describe("GET /s/:token", () => {
  beforeEach(async () => {
    const now = Date.now();
    const db = getDb(env);
    await db.insert(trips).values({ id: "t1", userId: "alice", name: "Iceland <2026>", startDate: "2026-07-12", shareToken: "tok1", createdAt: now, updatedAt: now });
    await db.insert(days).values([
      { id: "d0", tripId: "t1", position: 0 },
      { id: "d1", tripId: "t1", position: 1 },
    ]);
    await db.insert(dayRoutes).values({ dayId: "d0", waypointsHash: "h", polyline: "poly", distanceM: 200_000, durationS: 7_200, computedAt: now });
  });

  it("injects per-trip OG tags for a valid token", async () => {
    const app = appWith(null, sharePageRouter);
    const res = await call(app, new Request("http://x/s/tok1"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('property="og:title" content="Iceland &lt;2026&gt;"'); // escaped
    expect(html).toContain('property="og:description" content="2 days · 200 km · 2h drive"');
    expect(html).toContain('property="og:url" content="http://x/s/tok1"');
    expect(html).toContain('<title>Iceland &lt;2026&gt;</title>');
    expect(html).not.toContain("<title>NOMAD</title>");
  });

  it("returns the shell unmodified for an unknown token", async () => {
    const app = appWith(null, sharePageRouter);
    const res = await call(app, new Request("http://x/s/nope"));
    const html = await res.text();
    expect(html).toContain("<title>NOMAD</title>");
    expect(html).not.toContain("og:title");
  });
});
