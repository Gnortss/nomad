import { Hono } from "hono";
import { createAuth, type AppEnv } from "./auth";
import { tripsRouter } from "./routes/trips";
import { pointsRouter } from "./routes/points";
import { daysRouter } from "./routes/days";
import { makeStopsRouter } from "./routes/stops";
import { tripDetailRouter } from "./routes/trip-detail";
import { groupsRouter } from "./routes/groups";
import { shareRouter } from "./routes/share";

export type Env = { DB: D1Database };
type Variables = { user: { id: string } | null };

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();

app.get("/api/health", (c) => c.json({ ok: true }));

// better-auth handler — mounted before the guard so /api/auth/* is always reachable.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Per-request session: one auth instance, reused via context.
app.use("/api/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ? { id: session.user.id } : null);
  await next();
});

app.route("/", tripsRouter);
app.route("/", pointsRouter);
app.route("/", daysRouter);
app.route("/", makeStopsRouter());
app.route("/", tripDetailRouter);
app.route("/", groupsRouter);
app.route("/", shareRouter);

export default app;
