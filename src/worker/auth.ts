import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "./db/schema";
import type { Env } from "./index";

export type AppEnv = Env & {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_ROUTES_KEY: string;
};

export function createAuth(env: AppEnv) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    telemetry: { enabled: false }, // avoids node:os import; no place in a 2-user app

    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
  });
}
