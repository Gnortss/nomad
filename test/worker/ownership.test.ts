import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb, trips } from "../../src/worker/db/schema";
import { ownedTrip } from "../../src/worker/lib/ownership";

describe("ownedTrip", () => {
  it("returns the row only for the owner", async () => {
    const db = getDb(env);
    const now = Date.now();
    await db.insert(trips).values({ id: "t1", userId: "alice", name: "Iceland", createdAt: now, updatedAt: now });
    expect(await ownedTrip(db, "t1", "alice")).toBeTruthy();
    expect(await ownedTrip(db, "t1", "bob")).toBeUndefined();
    expect(await ownedTrip(db, "nope", "alice")).toBeUndefined();
  });
});
