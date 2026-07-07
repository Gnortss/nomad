import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";
import { pointsRouter } from "../../src/worker/routes/points";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seedTrip(userId: string, id = "t1") {
  const now = Date.now();
  await getDb(env).insert(trips).values({ id, userId, name: "Iceland", createdAt: now, updatedAt: now });
}

describe("points", () => {
  beforeEach(() => seedTrip("alice"));

  it("creates a point in the trip's pool with decoded links", async () => {
    const app = appWith("alice", pointsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Skógafoss", lat: 63.53, lng: -19.51, type: "viewpoint",
        links: [{ label: "site", url: "https://x" }] }),
    }));
    expect(res.status).toBe(201);
    const p = await res.json<{ id: string; type: string; bookingStatus: string; links: { label: string; url: string }[] }>();
    expect(p.type).toBe("viewpoint");
    expect(p.bookingStatus).toBe("idea");
    expect(p.links[0].url).toBe("https://x");
  });

  it("404s when creating a point on someone else's trip", async () => {
    const app = appWith("bob", pointsRouter);
    const res = await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", lat: 1, lng: 2 }),
    }));
    expect(res.status).toBe(404);
  });

  it("patches and deletes a point", async () => {
    const app = appWith("alice", pointsRouter);
    const created = await (await call(app, new Request("http://x/api/trips/t1/points", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "N1", lat: 1, lng: 2 }),
    }))).json<{ id: string }>();

    const patched = await call(app, new Request(`http://x/api/points/${created.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingStatus: "booked", estCost: 22 }),
    }));
    expect((await patched.json<{ bookingStatus: string }>()).bookingStatus).toBe("booked");

    const del = await call(app, new Request(`http://x/api/points/${created.id}`, { method: "DELETE" }));
    expect(del.status).toBe(204);
  });
});
