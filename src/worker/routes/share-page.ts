import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { getDb, trips, days, dayRoutes } from "../db/schema";
import { buildDescription, injectOgTags } from "../lib/og-tags";
import type { AppEnv } from "../auth";

type Vars = { user: { id: string } | null };
export const sharePageRouter = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

// Server-rendered share page: crawlers get per-trip OG tags, browsers get the same
// shell and boot the SPA as usual. Requires "/s/*" in run_worker_first (wrangler.jsonc)
// so this runs instead of the static-asset handler serving the bare shell.
sharePageRouter.get("/s/:token", async (c) => {
  const token = c.req.param("token");
  const { origin } = new URL(c.req.url);
  const db = getDb(c.env);

  const trip = (
    await db.select({ id: trips.id, name: trips.name })
      .from(trips).where(eq(trips.shareToken, token)).limit(1)
  )[0];

  const shell = await c.env.ASSETS.fetch(new URL("/index.html", origin));
  if (!trip) return shell; // unknown token → unmodified shell; the SPA shows its not-found state

  const dys = await db.select({ id: days.id }).from(days).where(eq(days.tripId, trip.id));
  const dayIds = dys.map((d) => d.id);
  const routeRows = dayIds.length
    ? await db.select({ distanceM: dayRoutes.distanceM, durationS: dayRoutes.durationS })
        .from(dayRoutes).where(inArray(dayRoutes.dayId, dayIds))
    : [];
  let totalDistanceM = 0, totalDurationS = 0;
  for (const r of routeRows) { totalDistanceM += r.distanceM; totalDurationS += r.durationS; }

  const html = injectOgTags(await shell.text(), {
    name: trip.name,
    description: buildDescription({ dayCount: dys.length, totalDistanceM, totalDurationS }),
    shareUrl: `${origin}/s/${token}`,
  });
  return c.html(html);
});
