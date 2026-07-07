---
name: verify
description: Build/launch/drive recipe for verifying nomad changes end-to-end in the running app
---

# Verifying nomad end-to-end

## Launch

- `npm run dev` — vite + @cloudflare/vite-plugin runs the worker too (API + client on one port, default 5173).
- **The Google Maps browser key is referrer-restricted to `localhost:5173`.** On any other port the map fails with `RefererNotAllowedMapError`. If 5173 is taken, find the process (`Get-NetTCPConnection -LocalPort 5173`) — it's usually an already-running dev server serving the same working tree (HMR keeps it current), so just use it.
- Auth: Chrome profile usually has a session (Better Auth). If not, sign in manually first.

## Gotchas (all pre-existing, as of 2026-07)

- **Deep links work since 2026-07-07** (`assets_navigation_prefers_asset_serving` flag + `run_worker_first: ["/api/*"]` in wrangler.jsonc): document GETs of `/trips`, `/trips/:id`, `/s/:token` serve the SPA. In dev, unmatched non-`/api` paths get index.html even for fetch()-style requests — worker JSON endpoints must live under `/api/`.
- **Editing wrangler.jsonc while dev is running** triggers a plugin restart that can wedge the server (every request 500s "fetch failed"); kill the process on 5173 and rerun `npm run dev`.
- **Empty trip = geolocation prompt**: MapCamera requests geolocation on empty trips. While the permission bubble is pending, CDP `Page.captureScreenshot` times out ("renderer frozen"). Seed the trip with points first (`POST /api/trips/:id/points` with `{name, lat, lng, coordSource: "user"}`) or navigate away to dismiss the bubble.
- Screenshots are also flaky when the automation window is occluded; JS eval keeps working — verify state via `fetch("/api/trips/:id")` instead.

## Driving flows

- dnd-kit drags: the extension's `left_click_drag` does not produce enough pointermove events for dnd-kit (`over` never resolves). Simulate with stepped PointerEvents: dispatch `pointerdown` on the row, then several `pointermove` on `document` (~60ms apart), then `pointerup`. Works — verified same-day reorder persists.
- Sortable day rows have `aria-roledescription="sortable"`, pool rows `"draggable"` — use these selectors to find rows.
- Delete stop uses `window.confirm` — stub it (`window.confirm = () => true`) **in the same javascript_exec call** as the button click; stubs don't reliably persist across calls.
- Ground truth after any mutation: `fetch("/api/trips/<id>", {credentials:"include"})` and inspect `points` / `dayStops`.
