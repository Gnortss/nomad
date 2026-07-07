import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";

describe("schema", () => {
  it("inserts and reads a trip", async () => {
    const db = getDb(env);
    const now = Date.now();
    await db.insert(trips).values({ id: "t1", userId: "u1", name: "Iceland", createdAt: now, updatedAt: now });
    const rows = await db.select().from(trips);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Iceland");
    expect(rows[0].currency).toBe("EUR");
  });
});
