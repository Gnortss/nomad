// Builds a Hono app whose auth middleware is bypassed with a fixed user, so route
// logic (ownership, DB writes) is testable without the real OAuth flow.
import { Hono } from "hono";
import { tripsRouter } from "../../src/worker/routes/trips";
import type { AppEnv } from "../../src/worker/auth";

export function appAs(userId: string | null) {
  const app = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();
  app.use("/api/*", async (c, next) => {
    c.set("user", userId ? { id: userId } : null);
    await next();
  });
  app.route("/", tripsRouter);
  return app;
}
