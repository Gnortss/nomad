import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

// Worker/D1 integration tests (workerd pool). Client React tests run separately
// via vitest.client.ts (jsdom) — kept as a distinct invocation because the
// pool-workers Vite pipeline must own the whole config, not sit under `projects`.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    test: {
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          main: "./src/worker/index.ts",
          singleWorker: true,
          miniflare: {
            compatibilityDate: "2025-01-01",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DB"],
            bindings: {
              TEST_MIGRATIONS: migrations,
              BETTER_AUTH_SECRET: "test-secret",
              BETTER_AUTH_URL: "http://localhost",
              GOOGLE_CLIENT_ID: "test-client-id",
              GOOGLE_CLIENT_SECRET: "test-client-secret",
              GOOGLE_ROUTES_KEY: "test-routes-key",
            },
          },
        },
      },
    },
  };
});
