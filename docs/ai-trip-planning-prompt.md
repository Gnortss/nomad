# Prompt: plan AI-assisted trip creation flow

Use Claude Code's plan mode for this (not the superpowers brainstorming/writing-plans skills). Research first, ask me clarifying questions one at a time where my input is needed, then propose an implementation plan. Do not write code yet.

## Feature

Add an intermediate step to trip creation. Today "+ New trip" just POSTs `{name: "New trip"}` to `/api/trips` and opens the trip editor. Instead:

1. Clicking "+ New trip" opens a modal with a trip-name field and an AI chat.
2. User describes the trip in freeform chat: vibe (camping road trip / nature / cities), pace (stay put a few days vs. move fast), duration, etc.
3. AI asks follow-up questions if it needs more info.
4. AI summarizes what it understood and what it plans to research, for user confirmation.
5. AI researches — web search for destinations/ideas based on the user's brief, and Google Maps (routes/places) to judge feasibility of drive lengths between stops.
6. AI produces a day-by-day plan: route points and day-level points (stops/sights) per day.
7. Modal closes, trip is created, user lands on the trip editor with the generated plan already populated.

## Codebase context

- Stack: Cloudflare Workers (Hono) + D1/Drizzle + React 19 + React Router. No AI SDK or web-search integration exists yet.
- Trip creation: `src/client/screens/TripList.tsx` (`useCreateTrip`) -> `POST /api/trips` in `src/worker/routes/trips.ts`.
- Trip data model touches: `trips`, `days`, `points`, `dayRoutes` (polylines), `groups`, `dayStops` — see `src/worker/db/schema.ts` and routes in `src/worker/routes/{days,points,groups,stops,trip-detail}.ts`.
- Google Maps: client already uses `@vis.gl/react-google-maps` (`VITE_GOOGLE_MAPS_BROWSER_KEY`/`MAP_ID`, browser-side). Worker already has a `GOOGLE_ROUTES_KEY` secret used server-side for route polylines — reusable for drive-time/feasibility checks.
- No Anthropic/OpenAI key or web-search API key configured yet (`.dev.vars`).

## Known open questions to research (bring options + a recommendation, don't just ask me)

- **AI provider**: leaning Claude/Anthropic API — confirm it fits (tool use for web search + structured day-plan output, cost per trip-planning session, streaming support on Workers).
- **Web search**: how does the AI search the web from a Cloudflare Worker? (Anthropic's built-in web search tool vs. a separate search API like Brave Search.)
- **Long-running multi-turn flow under Workers limits**: chat + research + maps calls could run long / need multiple round-trips. Consider streaming responses, a Durable Object to hold chat/research session state, and whether research should be a visible background step rather than a single blocking request.
- **Output mapping**: how the AI's day-by-day plan (route points + day points) maps onto the existing `days`/`points`/`dayStops`/`dayRoutes` schema, and whether trip creation becomes multi-step (create trip shell, then populate via the same endpoints the editor already uses, vs. a new bulk "create from plan" endpoint).
- **Chat/session persistence**: does the planning chat need to be saved (resumable, auditable) or is it ephemeral once the trip is created?

## What I want from this session

Research the above, ask me clarifying questions one at a time where my input is needed, then present 2-3 implementation approaches with trade-offs and your recommendation. Do not start implementing.
