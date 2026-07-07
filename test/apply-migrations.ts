import { applyD1Migrations, env } from "cloudflare:test";

// Runs once before the test suite: applies the real drizzle-kit migrations to the
// in-memory D1 bound as env.DB, so tests exercise the actual schema.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
