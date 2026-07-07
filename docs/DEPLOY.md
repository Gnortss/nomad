# Deploy runbook (Phase 0)

The code is fully built and tested locally. The steps below require **your Cloudflare and Google Cloud accounts** and are the only things blocking a live deploy. Do them once.

## 1. Cloudflare D1 databases

```bash
npx wrangler login                 # opens a browser once
npx wrangler d1 create roadline-dev
npx wrangler d1 create roadline-preview
npx wrangler d1 create roadline-prod
```

Paste each printed `database_id` into `wrangler.jsonc`:
- `roadline-dev` → top-level `d1_databases[0].database_id`
- `roadline-preview` → `env.preview.d1_databases[0].database_id`
- `roadline-prod` → `env.production.d1_databases[0].database_id`

Apply migrations to the remote DBs:
```bash
npx wrangler d1 migrations apply roadline-prod --env production --remote
npx wrangler d1 migrations apply roadline-preview --env preview --remote
```
(Local dev/tests already work without these — they use an in-memory/local D1.)

## 2. Google Cloud — one project for Maps + OAuth

**Maps:**
- Enable **Maps JavaScript API**, **Places API**, **Routes API** (Routes/Places needed from Phase 1a).
- Create a **cloud-styled Map ID** with a muted gray-green style → this is `VITE_GOOGLE_MAPS_MAP_ID`.
- Create a **browser API key** restricted to your prod + preview HTTP referrers, APIs limited to Maps JS + Places → `VITE_GOOGLE_MAPS_BROWSER_KEY`. Create a **separate dev browser key** for `localhost` (put in `.env.local`).
- Create a **server API key** restricted to Routes + Places (used from Phase 1a) → Worker secret `GOOGLE_ROUTES_KEY`.
- Set per-API **daily quota caps** (~300/day) and a billing alert.

**OAuth (better-auth Google provider):**
- Configure the OAuth consent screen.
- Create a **Web OAuth client**; register redirect URIs:
  - `https://<prod-domain>/api/auth/callback/google`
  - `https://<preview-domain>/api/auth/callback/google`
  - `http://localhost:5173/api/auth/callback/google`
- Client id/secret → Worker secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Then set the real domains into `wrangler.jsonc` `env.*.vars.BETTER_AUTH_URL`.

## 3. Worker secrets (per environment)

Run for both `--env preview` and `--env production`:
```bash
npx wrangler secret put BETTER_AUTH_SECRET --env production   # generate: openssl rand -base64 32
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
npx wrangler secret put GOOGLE_ROUTES_KEY --env production
```

## 4. GitHub Actions

Repository → Settings → Secrets and variables → Actions:
- **Secret** `CLOUDFLARE_API_TOKEN` — a token with Workers Scripts:Edit + D1:Edit.
- **Variables** `VITE_GOOGLE_MAPS_BROWSER_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` — baked into the client bundle at build time.

On push to `main`, `.github/workflows/deploy.yml` runs tests, builds, applies migrations to `roadline-prod`, and deploys `--env production`. Pull requests deploy `--env preview`.

## 5. Local dev

```bash
cp .env.local          # set real dev browser key + Map ID
# .dev.vars already holds dev auth placeholders; set a real Google dev OAuth client to test login
npm run dev            # http://localhost:5173
```
