# Design brief: Nomad — visual redesign as slides

You are redesigning the look of **Nomad**, a web app for planning road trips. Do **not** build a prototype or working code. The deliverable is a **slide deck**: one slide (or slide pair) per screen/component area listed below, showing the redesigned UI as high-fidelity mockups with short annotations. Design for **desktop, ~1440px wide** frames. Every slide must feel like part of one coherent design system.

## What the app is

Nomad plans multi-day road trips on a map. A trip is made of **stops** (points on the map), organized into **days** (each day is a driving route through its stops). Stops that aren't assigned to a day sit in an **unassigned pool**. Stops can belong to color-coded **groups** (e.g. "Dolomites", "Backup campsites"); groups are either trip-wide or scoped to a single day. An **AI planner chat** can build and refine the whole trip. Trips can be shared read-only via a link.

## Hard constraints

1. **The map tiles are Google Maps and stay exactly as they are.** You may redesign everything drawn *on top* of the map (markers, route lines, overlay cards, banners) but not the base map itself. Show real-looking Google Maps tiles in mockups.
2. **Slides only, no prototype.** Static mockups + annotations.
3. Keep the current information density and layout logic (left sidebar / map / right panels) unless you have a clearly better idea — if you change layout, show why on the slide.
4. Every interactive state listed below must appear somewhere in the deck (default, hover/selected where meaningful, empty, loading, error).

## Current design language (starting point — improve it, don't ignore it)

- Colors: `basalt #1E2A2C` (dark ink / top bars), `glacier #ECF0F0` (background), `slate #57676B` (secondary text), `lupine #5B44C9` (primary accent — buttons, selection, AI, routes), `sulfur #E39A0C` (warnings, "to book"), `moss #2F7A55` ("booked" / success).
- Type: **Overpass** for display/labels (all-caps section headers with letter-spacing), **Public Sans** for body, **Overpass Mono** for numbers (distances, durations, costs, dates).
- Shapes: 7–10px radii, thin `slate`-alpha borders, soft shadows, pill-shaped chips.
- Semantic colors matter functionally: lupine = primary/AI/selection, sulfur = warning/to-book, moss = booked. Keep the *semantics* even if you re-tune the hues.

The current implementation is functional but plain — inline-styled, flat panels. The goal is a distinctly more polished, atmospheric, "outdoors / expedition" feel without losing legibility or density.

---

## Slide 0 — Design foundations

Palette (with the semantic roles above), typography scale, and the core components reused everywhere: primary/secondary/ghost buttons, pill chips (type chips, group chips, filter chips, suggested-reply chips), text inputs and selects, modal/dialog frame, popover menu, confirm-dialog pattern (title, body, red confirm + cancel), section headers (small all-caps letter-spaced labels like `DAYS`, `PLACE`, `NOTES`).

## Slide 1 — Trips dashboard

The landing screen after login.
- **Top bar** (dark basalt, 56px): `NOMAD` wordmark left; right side: primary **+ New trip** button, ghost **Sign out** button.
- **Trip card grid** (responsive, ~240px min cards): each card has
  - a **map thumbnail** (static mini-map rendering of that trip's stop points and route polylines — designed by us, drawn on a neutral background, not necessarily Google tiles),
  - trip **name** (bold),
  - **start date** in mono, or "No dates yet",
  - a **⋯ overflow button** (top-right of card) opening a small menu with **Delete trip** (destructive red), which opens a confirm dialog ("Delete "X"? This removes the trip and all of its stops, days and routes.").
- Include an **empty state** design (user has zero trips yet — currently undesigned; invent something inviting that funnels to "+ New trip").

## Slide 2 — New trip modal

Opened from "+ New trip". This is AI-first: the user describes a trip and the AI plans it in the editor.
- Modal (~560px) over a dark scrim: title "New trip" + close ×.
- **Trip name input** — optional, placeholder notes the AI will suggest one.
- **Description textarea** (~5 rows) — the main field: where to, when/how long, vibe (camping, nature, cities…), vehicle and constraints (EV, no tolls…). Enter submits.
- Inline **error line** (e.g. "AI planning isn't configured on this server — you can still create a blank trip below.").
- Primary button **Create trip** → busy state "Creating your trip…" (disabled, with progress feel).
- Secondary escape hatch: small text link **"Skip — create a blank trip instead"**.

## Slide 3 — Trip editor: overall page layout

The core screen. Show the whole composition; details of each region come in later slides.
- **Top bar** (dark, 56px): `NOMAD` wordmark (links home) › breadcrumb separator › **inline-editable trip name** (dashed underline affordance) › **trip stats** in mono ("1 240 km · 18 h 05 · €140 fuel" — fuel omitted for EVs). Right: ghost **Settings**, ghost **Delete trip**, primary **Share trip**.
- **Left sidebar, 344px**: Days rail (top, scrollable) + Unassigned pool (bottom, max ~270px). Slides 4–5.
- **Center: Google map** filling remaining space, with our markers and route polylines (slide 8).
- **Right: Stop detail panel, 382px** — slides in when a stop is selected (slide 9).
- **Far right: AI chat panel, 344px** — open state (slide 6); when closed, a floating **"AI planner" pill button** (lupine, chat icon) bottom-right over the map. Note: detail panel and chat can be open simultaneously — show how the map breathes with both open.
- **Map overlay states** to design:
  - *Empty trip*: centered card "No stops yet — search for a place or drop a pin on the map to add your first stop."
  - *AI planning*: centered card with spinner — "The AI is planning your trip… Days and stops appear on the map as they're ready — follow along in the chat."
  - *Drop-pin mode*: small banner top-left "Click the map to place a stop" + Cancel; crosshair cursor.
  - *Route status* (small inline banners): "Measuring the drive…", "Couldn't reach the routing service. Your stops are safe — try again. [Retry]", "Route may be out of date [Refresh route]".

## Slide 4 — Left sidebar: Days rail

Top region of the left sidebar.
- Header row: `DAYS` label + small **+ Add day** button.
- **Day card**, one per day, in trip order. Each contains:
  - a **day number badge** (square, dark, bold number),
  - **title** ("Day 3" default, or a custom title like "Passo Giau & Cortina"),
  - mono **stats line**: "182 km · 3 h 10" or "No route yet",
  - **"Long day" warning pill** (sulfur, warning triangle) when driving time is excessive — the day badge also switches to a warning-outlined variant,
  - a **sparkle button** ("Refine with AI" — prefills the chat with "Refine day N: "),
  - a **chevron** to expand/collapse the stop list.
- **Selected day state**: card highlighted (currently white bg + lupine left border); selecting a day also focuses that day on the map (its markers highlighted, others dimmed).
- **Expanded day** shows two lists:
  1. **Routed stops** (the driving order): each row = type icon, stop name (ellipsized), **END** tag on the last stop (day routes start at the previous day's last stop, so there is no START tag), and a **booking-status dot** (moss = booked, sulfur = to book, dashed hollow = idea).
  2. **"ALSO THIS DAY"** section: stops attached to the day but not on the driving route — plain ones first, then clustered under their **day-scoped group headers** (small color square + group name).
- **Drag & drop**: rows are draggable between days and from the pool. Design the drop affordances — day-card drop highlight (lupine outline/tint), an **insertion line** between rows, dragged-row ghosting, and the floating **drag overlay card**.
- **States**: empty ("No days yet. Add a day, then drag stops onto it.") and **AI-planning skeletons** — shimmering placeholder day cards with the caption "The AI is planning — days appear here as they're written."

## Slide 5 — Left sidebar: Unassigned pool

Bottom region of the left sidebar (slightly different background to read as a tray).
- Header: `UNASSIGNED` label.
- **Two add buttons** side by side: **Search a place** (expands into a Google Places autocomplete input with a suggestion dropdown — design the dropdown) and **Drop a pin** (toggle; active state inverts to lupine while pin-drop mode is armed).
- **Group filter chips**: one per group — color swatch + name, tap to filter the pool to that group (active = outlined). Groups color-code stops everywhere.
- **Stop cards** (the pool list): type icon, name (bold, ellipsized), group swatch + group name underneath when grouped, and a trailing **"＋ Day" button** opening the **day-assign popover**: a list of "Day N — title" rows (current day checkmarked) plus a destructive "Remove from day" row. Cards are draggable into days ("DRAG →" hint appears on the drag-overlay variant).

## Slide 6 — AI planner chat

Right-side panel, 344px, white.
- **Header**: chat icon + "AI planner" + trash icon (clear chat → confirm dialog "Clear this chat? The conversation history is removed; the trip itself stays as it is.") + collapse ×.
- **Thread**:
  - **User bubbles**: lupine, right-aligned.
  - **Assistant bubbles**: light gray, left-aligned, multi-paragraph text.
  - **Tool/activity lines** interleaved in the log: small mono italic lines like "· Searching the web for campsites…" — the AI narrates what it's doing while it edits the trip.
  - **Working indicator**: left-aligned pill with three animated dots + the current activity label (or "Thinking…").
  - First-run **intro message**: "I can plan this trip with you — describe what you have in mind, or ask me to refine specific days."
- **Suggested replies**: a wrap row of tappable lupine-outline chips above the composer (server-suggested follow-ups).
- **Error line** (e.g. "The assistant is already working — give it a moment.").
- **Composer**: 2-row textarea "Ask for changes or new days…" + primary **Send**; Enter sends.
- **Collapsed state**: the floating "AI planner" pill over the map.
- Show the **kickoff moment** (fresh trip from the modal): chat streaming the plan while the day rail shows skeletons and markers pop onto the map — this is the app's signature moment; make it feel alive.

## Slide 6b — AI planning in progress (the kickoff state)

A dedicated full-page design for the minutes right after creating an AI trip — the trip has **no days and no stops yet** and the AI is working. This is the app's signature moment and deserves its own treatment, not just a spinner. Design the whole editor in this state:

- **Map**: centered overlay card with spinner — currently "The AI is planning your trip… Days and stops appear on the map as they're ready — follow along in the chat." Consider something more atmospheric than a plain card.
- **Days rail**: caption "The AI is planning — days appear here as they're written." above 3 shimmering **skeleton day cards** (badge block + two text bars, staggered animation).
- **Chat panel** (open): the streamed plan arriving — assistant text mid-stream, interleaved mono tool-activity lines ("· Searching the web for campsites…"), the animated working indicator with the current activity label.
- **The progressive fill**: days and markers pop in one by one as the AI writes them — show a mid-planning frame (2 days real, 1 skeleton, a few markers already on the map) so the transition from empty → planned is designed, not just the two endpoints.
- Contrast it with the **non-AI empty state** (blank trip, AI idle): "No stops yet — search for a place or drop a pin" card on the map, "No days yet. Add a day, then drag stops onto it." in the rail. Both states share a layout but must read clearly as "AI is working" vs "waiting for you".

## Slide 7 — Stops: the core object, everywhere

One slide defining the visual language of a stop, since it appears in five contexts (pool card, day row, attached row, drag overlay, map marker) and they must read as the same object.
- **Type taxonomy** (11 types, currently lucide icons): campsite (tent), wild camp (tent-tree), hostel (bed), hotel/apartment (hotel), point of interest (map pin), fuel stop (fuel pump), charging stop (plug), food (utensils), viewpoint (mountain), activity (footprints), other (hexagon). Design the icon treatment.
- **Booking status** semantics, visible at a glance in every context: **idea** = dashed/hollow, **to book** = sulfur, **booked** = moss + checkmark.
- **Group color**: each stop carries its group's color (swatch on cards, fill on markers). Default (ungrouped) color = basalt.
- Show the matrix: each context × a couple of statuses/groups.

## Slide 8 — Map layer (on top of Google tiles)

Everything Nomad draws on the untouched Google base map.
- **Stop markers**: currently 30px rounded squares filled with the group color, white ring, white type icon inside. Ring encodes booking status (dashed = idea; thicker + check = booked). Redesign freely but keep group color + type icon + status all legible at map scale.
- **Marker states**: *focused* (its day selected — slightly enlarged), *dimmed* (another day selected — faded/desaturated), default.
- **Route polylines**: one per day, currently lupine; **selected day** = thicker/more opaque, others fade way down. Consider how multiple day routes read together.
- Include the map **overlay cards/banners** from slide 3 in context.

## Slide 9 — Stop detail panel

382px right panel when a stop is selected. Dense but scannable — design the vertical rhythm of these labeled sections:
- **Header**: inline-editable **stop name** (dashed-underline affordance), below it type icon + type label ("Campsite"); close ×.
- **PLACE** — Google Places info (fetched for Google-sourced stops):
  - rating card: **★ 4.6 (1,284 reviews)**, formatted address, **Website** + phone links, collapsible **Opening hours** (7 weekday lines),
  - always: an **"Open in Google Maps ↗"** dashed-outline link button,
  - design the variants: info loaded / no place data (pin-dropped stop — link only) / quota exhausted (link only).
- **DAY** — the **day-assign dropdown** ("Day 3 — Dolomites ▾" or "Unassigned") + an **"On route"** checkbox (whether the stop is part of the day's driving route vs. just attached to the day).
- **TYPE** — all 11 type chips (icon + label), active chip filled lupine.
- **GROUP** — chips: "No group", one per group (color swatch + name, day-scoped groups suffixed "· Day N"), and **+ New group** which expands an inline form: name input, **6-swatch color picker** (brick red, sulfur, green, teal-blue, lupine, slate), scope select (Trip-wide / Day N), Create + Cancel.
- **BOOKING** — 3-way segmented control: Idea / To book / Booked (active segment fills with the status color).
- **EST. COST** — mono number input + basis select (total / per night / per person).
- **NOTES** — free-text textarea ("No notes yet.").
- **LINKS** — list of saved links (link icon + label, remove ×) + "+ Add link" expanding to label + URL inputs with Add/Cancel.
- Footer: quiet destructive **Delete stop** text button (confirm before delete).

## Slide 10 — Dialogs & secondary screens

- **Trip settings dialog** (~420px): Vehicle select (Car petrol/diesel · Electric car), conditional **EV range (km)** input, checkboxes **Avoid toll roads** / **Allow ferries**, Cancel + Save (busy "Saving…"). Changing these recomputes routes.
- **Share dialog**: generated share URL in a mono well, **Rotate link** (invalidates the old one) + **Done**.
- **Login screen**: wordmark, tagline "Plan the drive. Not just the destination.", **Continue with Google** button. Currently bare — worth an atmospheric treatment (it's the front door).
- **Public share view** (read-only, no auth, also the one mobile-visited screen — make it responsive): header with trip name, mono meta line ("12 Jul 2026 · 9 days · 1 240 km"), "Shared itinerary · view only" tag; a 40%-height map; then a scrollable day-by-day list — day title + mono stats, numbered stops with END tags and booking-status labels, "ALSO THIS DAY" attached stops.

---

## Deck expectations

- One coherent system across all slides; a stop, a chip, or a section header must look identical wherever it recurs.
- Annotate sparingly: call out states, semantics (what a color/dot means), and anything that changed from the description above and why.
- Realistic content throughout — use a believable sample trip (e.g. a 9-day Slovenia → Dolomites camping loop with named campsites, passes, viewpoints) rather than lorem ipsum.
- Include at least one slide-level look at the full editor with **everything open** (day selected, stop selected, chat open, drag in progress is optional) to prove the density works.
