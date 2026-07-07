import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, trips, days } from "../../src/worker/db/schema";
import { daysRouter } from "../../src/worker/routes/days";
import { appWith } from "../helpers/session";

async function call(app: ReturnType<typeof appWith>, req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function post(app: ReturnType<typeof appWith>, body: object) {
  return call(app, new Request("http://x/api/trips/t1/days", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

describe("days", () => {
  beforeEach(async () => {
    const now = Date.now();
    await getDb(env).insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", createdAt: now, updatedAt: now });
  });

  it("appends days at increasing positions and stores title", async () => {
    const app = appWith("alice", daysRouter);
    const d0 = await (await post(app, { title: "Golden Circle" })).json<{ position: number; title: string }>();
    const d1 = await (await post(app, { title: "South coast" })).json<{ position: number }>();
    expect(d0.position).toBe(0);
    expect(d0.title).toBe("Golden Circle");
    expect(d1.position).toBe(1);
  });

  it("compacts positions after delete", async () => {
    const app = appWith("alice", daysRouter);
    await post(app, { title: "A" });
    const b = await (await post(app, { title: "B" })).json<{ id: string }>();
    await post(app, { title: "C" });
    await call(app, new Request(`http://x/api/days/${b.id}`, { method: "DELETE" }));
    const list = await getDb(env).select().from(days);
    expect(list.map((d) => d.position).sort()).toEqual([0, 1]);
    expect(list.find((d) => d.title === "C")!.position).toBe(1);
  });
});
