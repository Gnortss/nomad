// Builds a Hono app whose auth middleware is bypassed with a fixed user, so route
// logic (ownership, DB writes) is testable without the real OAuth flow.
import { Hono } from "hono";
import type { AppEnv } from "../../src/worker/auth";

type Vars = { user: { id: string } | null };
type AnyRouter = Hono<{ Bindings: AppEnv; Variables: Vars }>;

export function appWith(userId: string | null, ...routers: AnyRouter[]) {
  const app = new Hono<{ Bindings: AppEnv; Variables: Vars }>();
  const setUser = async (c: { set: (k: "user", v: Vars["user"]) => void }, next: () => Promise<void>) => {
    c.set("user", userId ? { id: userId } : null);
    await next();
  };
  app.use("/api/*", setUser);
  for (const r of routers) app.route("/", r);
  return app;
}
