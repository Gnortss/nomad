import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { appAs } from "../helpers/session";

async function call(app: ReturnType<typeof appAs>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("trips", () => {
  it("creates a trip and lists only the owner's trips", async () => {
    const alice = appAs("alice");
    const created = await call(alice, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Iceland" }),
    }));
    expect(created.status).toBe(201);
    const trip = await created.json<{ id: string; name: string }>();
    expect(trip.name).toBe("Iceland");

    const aliceList = await (await call(alice, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(aliceList.trips).toHaveLength(1);

    const bob = appAs("bob");
    const bobList = await (await call(bob, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(bobList.trips).toHaveLength(0);
  });

  it("rejects unauthenticated create", async () => {
    const anon = appAs(null);
    const res = await call(anon, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    }));
    expect(res.status).toBe(401);
  });
});
