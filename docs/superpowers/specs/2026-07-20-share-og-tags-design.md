# Share-link OG title & description — design

**Date:** 2026-07-20
**Status:** Approved design, ready to implement

## Problem

A shared trip link (`/s/:token`) is a client-side SPA route. The worker never
sees it — the static-asset handler serves the generic `index.html` shell, whose
`<head>` has only `<title>NOMAD</title>` and no Open Graph tags. So when the link
is pasted into WhatsApp, Slack, iMessage, X, etc., the preview card is blank /
generic instead of showing what the trip is.

Link-preview crawlers do not run JavaScript: they fetch the URL, read the `<head>`
meta tags, and stop. To give them trip-specific content, the worker must intercept
`/s/:token`, look up the trip, and inject the tags into the shell before returning.

## Scope

**In:** per-trip `<title>`, `og:title`, `og:description`, `og:url`, `og:type`,
`twitter:card` on the share page.

- `og:title` / `<title>` = trip name.
- `og:description` = `"8 days · 1,240 km · 18h drive"` (day count, total route
  distance, total drive time).

**Out (explicitly dropped):** any map/preview image (`og:image`), Google Static
Maps, image proxy routes, image caching, and any new environment variables. A
text-only summary card is the whole deliverable.

## Mechanism

Make the worker intercept `/s/:token`, fetch the built `index.html` via the
static-assets binding, inject the tags, and return the modified HTML. Real
browsers then boot the SPA as normal — the injected tags are inert to the app.

*Alternative considered and rejected:* user-agent sniffing to inject only for
known crawlers. Unnecessary complexity — injecting for every request is harmless
and simpler, and avoids maintaining a bot list.

## Changes

### 1. `wrangler.jsonc`

- Add `"/s/*"` to `assets.run_worker_first` (currently `["/api/*"]`) so the worker
  receives share-page requests instead of the static handler serving the shell
  directly.
- Add `"binding": "ASSETS"` to the `assets` block so the worker can read
  `index.html` at runtime via `env.ASSETS.fetch(...)`.

No other config changes; no new vars or secrets.

### 2. Meta-tag builder — `src/worker/lib/og-tags.ts` (new, pure, unit-tested)

Two pure functions, no I/O, so they are trivially testable:

- `buildDescription({ dayCount, totalDistanceM, totalDurationS }): string`
  - `days` = `` `${n} day${n === 1 ? "" : "s"}` `` (singular/plural).
  - `km` = `Math.round(totalDistanceM / 1000)`, thousands-separated via
    `Intl.NumberFormat("en-US")` (available in Workers) → `"1,240 km"`.
  - `hours` = `Math.round(totalDurationS / 3600)` → `"18h drive"`.
  - Join non-empty parts with `" · "`.
  - **Zero-route trips:** when `totalDistanceM === 0`, drop the distance and drive
    parts and return just the day count (e.g. `"8 days"`) — no `"0 km · 0h drive"`.
- `injectOgTags(shellHtml, { name, description, shareUrl }): string`
  - HTML-escape `name`, `description`, and `shareUrl` (they land inside
    `content="..."` attributes; `name` is user input, so escaping `& < > " '` is a
    correctness/XSS requirement, not a nicety).
  - Replace the existing `<title>…</title>` with `<title>{escaped name}</title>`.
  - Insert the OG/Twitter block immediately before `</head>`:
    `og:title`, `og:description`, `og:url`, `og:type=website`,
    `twitter:card=summary` (text card — no image, so *not*
    `summary_large_image`).
  - Defensive: if `</head>` is not found, append the block to the end (should not
    happen with our controlled shell, but avoids silently dropping tags).

### 3. Page route — `src/worker/routes/share-page.ts` (new), mounted in `src/worker/index.ts`

`GET /s/:token`:

1. Look up the trip by `shareToken` (select `name` only; the token is public).
2. **Not found →** fetch and return `index.html` unmodified, so the SPA renders
   its own not-found state. (Do not 404 — the client route must still load.)
3. Aggregate stats with the same source as `/api/share/:token`: day count from
   `days`, and `SUM(distanceM)` / `SUM(durationS)` over `dayRoutes` for the trip's
   day IDs. Reuse the existing summation shape from `share.ts`.
4. `const { origin } = new URL(c.req.url)`; `description = buildDescription(...)`;
   `shareUrl = origin + "/s/" + token`.
5. `shell = await env.ASSETS.fetch(new URL("/index.html", origin)).then(r => r.text())`.
6. Return `injectOgTags(shell, { name, description, shareUrl })` as `text/html`.

Mount at `"/"` in `index.ts` alongside the other routers. `/s/*` is **not** under
`/api/*`, so the existing `app.use("/api/*", …)` auth middleware does not run for
it — correct, since the share page is public.

## Data flow

```
crawler → GET /s/:token
       → worker (run_worker_first matches /s/*)
       → D1: trip name + day count + route distance/duration sums
       → env.ASSETS: index.html shell
       → injectOgTags(shell, …)
       → text/html with per-trip <title> + og:* + twitter:card
```

Real user → same path → same HTML → SPA boots and hydrates as before.

## Privacy

The route exposes only the trip name and aggregate distance/duration — a strict
subset of what `/api/share/:token` already serves publicly. No private fields
(budget, cost, notes, user id, etc.) are read or emitted. The route is
unauthenticated by necessity (crawlers cannot log in), consistent with the
existing public share endpoint.

## Testing

- **Unit — `buildDescription`:** days singular vs plural; thousands separator on
  distance; hours rounding; the zero-route case returns only the day count.
- **Unit — `injectOgTags`:** tags present with expected values; trip name with
  `"`, `<`, `&` is escaped in both `<title>` and `content`; existing `<title>` is
  replaced (not duplicated); missing `</head>` falls back to append.
- **Worker route — `GET /s/:token`** (following the existing
  `test/worker/share.test.ts` harness, stubbing `env.ASSETS.fetch` to return a
  minimal `<head></head>` shell): valid token → HTML containing `og:title` (trip
  name) and `og:description` (stats line); unknown token → shell returned
  unmodified (no injected `og:` tags).

## Verification

`npm run typecheck` + `npm test` green. Manually confirm the injected HTML with
`curl -s https://<host>/s/<token> | grep -i 'og:'` after deploy, and/or paste a
share link into a preview-rendering chat.

## Out of scope / future

Map thumbnail image (`og:image`) via a static-map API, and the associated caching
and cost controls — considered and deferred. If revisited, the image would ride on
its own route and cache; nothing in this design blocks adding it later.
