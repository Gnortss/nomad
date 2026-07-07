import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { appWith } from "../helpers/session";
import { tripsRouter } from "../../src/worker/routes/trips";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("trips", () => {
  it("creates a trip and lists only the owner's trips", async () => {
    const alice = appWith("alice", tripsRouter);
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

    const bob = appWith("bob", tripsRouter);
    const bobList = await (await call(bob, new Request("http://x/api/trips"))).json<{ trips: unknown[] }>();
    expect(bobList.trips).toHaveLength(0);
  });

  it("rejects unauthenticated create", async () => {
    const anon = appWith(null, tripsRouter);
    const res = await call(anon, new Request("http://x/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    }));
    expect(res.status).toBe(401);
  });
});
