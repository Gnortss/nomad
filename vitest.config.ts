import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          main: "./src/worker/index.ts",
          singleWorker: true,
          miniflare: {
            compatibilityDate: "2025-01-01",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DB"],
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
