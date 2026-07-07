import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, trips } from "../db/schema";
import { newId } from "../lib/id";
import type { AppEnv } from "../auth";

export const tripsRouter = new Hono<{ Bindings: AppEnv; Variables: { user: { id: string } | null } }>();

tripsRouter.get("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env);
  const rows = await db.select().from(trips).where(eq(trips.userId, user.id));
  return c.json({ trips: rows });
});

tripsRouter.post("/api/trips", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { name } = await c.req.json<{ name?: string }>();
  if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
  const db = getDb(c.env);
  const now = Date.now();
  const row = { id: newId(), userId: user.id, name: name.trim(), currency: "EUR", createdAt: now, updatedAt: now };
  await db.insert(trips).values(row);
  return c.json(row, 201);
});
