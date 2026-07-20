/// <reference types="@cloudflare/vitest-pool-workers" />
import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
    // Production binding (wrangler.jsonc); tests that exercise it stub it per-call.
    ASSETS: Fetcher;
  }
}
