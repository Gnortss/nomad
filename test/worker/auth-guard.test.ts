import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../../src/worker/index";

describe("auth guard", () => {
  it("returns 401 for a protected route with no session", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://x/api/trips"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});
