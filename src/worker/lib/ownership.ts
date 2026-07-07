import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, trips } from "../db/schema";

type Db = ReturnType<typeof getDb>;

export async function ownedTrip(db: Db, tripId: string, userId: string) {
  const rows = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1);
  return rows[0];
}

// Returns the owned trip row, or null with the HTTP code the caller should respond with.
export async function requireTrip(c: Context, tripId: string) {
  const user = c.get("user") as { id: string } | null;
  if (!user) return { trip: null as null, code: 401 as const };
  const trip = await ownedTrip(getDb(c.env), tripId, user.id);
  if (!trip) return { trip: null as null, code: 404 as const };
  return { trip, code: 200 as const };
}
