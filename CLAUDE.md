# Dhaka Kacchi Berlin — Project Context

## Who this is for
Arko runs Dhaka Kacchi, an online kacchi biryani + borhani business in Berlin,
alongside an AI/ML bootcamp. Background in product strategy / B2B SaaS.
Prefers plain, concrete explanations and simple working solutions over clever ones.

## Current state
- Live site is a static HTML/CSS/JS site (no framework), currently hosted on Hostinger
  under a `public_html` structure. Pages: index, about, history, subscribe, order.
- Design: dark background, gold accents, Cormorant Garamond + DM Sans fonts,
  scroll-reveal animations. Strong brand story: a Bangladeshi doctor in Berlin who
  couldn't find real Old Dhaka kacchi, so she started making it herself.
- Ordering today: WhatsApp button only (wa.me link), 48h notice, 2-plate minimum.
- Subscribe form posts to a Google Apps Script URL (no-cors fetch, best-effort).
- Old code lives in GitHub repo: `shadmanArko/dhaka-kacchi-web` (private).
  This repo is being kept as the untouched **archive/backup** of the old static site.

## Decisions made so far
1. **Rebuild, not a re-skin.** Arko is fine restructuring
   the whole project for maintainability. Priority order: (1) ordering system,
   (2) visual polish pass, (3) later: chatbot / agentic AI features.
2. **Rebuilt via Lovable initially, then fully moved off it.** The project
   was originally scaffolded and iterated on through Lovable (an AI website
   builder) connected to this GitHub repo via its two-way sync. Arko later
   decided to stop using Lovable entirely — cost, and Lovable-introduced bugs
   in the frontend — and every trace of it (its vite-config wrapper, error-
   reporting hook, `.lovable/` metadata, boilerplate docs) has since been
   removed from the repo. All frontend work now goes through the same
   Claude-Code-driven workflow the backend already used.
3. **Repo reality check (inherited from the Lovable scaffold):** this
   project is **TanStack Start** (SSR + server functions, Vite, bun), not a
   plain Vite SPA. Default Nitro build target is Cloudflare. This matters for
   hosting — see the split architecture below.
4. **Hosting/deployment — split architecture, revised 2026-09-07** (Arko's
   explicit decision: frontend, backend, and database must be three
   separately-deployable systems that stay connected, so a future second
   backend can plug in later without redesigning any of this):
    - **Frontend**: this repo's `src/`, built as a static SPA, deployed to
      Hostinger via **GitHub Actions**: build on push to `main` → SFTP the
      built output into `public_html`. Uses Arko's existing Hostinger
      subscription. Only ever talks to the backend over HTTPS via
      `VITE_API_BASE_URL` — no backend code or secrets ship in this bundle.
    - **Backend (order API)**: `worker/` — plain **Node.js + Postgres**
      (moved off Cloudflare Workers/D1 2026-09-07/08; the original
      Cloudflare version lives on only in git history). Runs in Docker on a
      **Contabo VPS**, behind Caddy for automatic HTTPS. Owns all order
      logic — validation, cutoff enforcement, email confirmation, WhatsApp
      alert, storage. See `worker/CLAUDE.md` and `worker/ARCHITECTURE.md`
      for how it works and how to change it.
    - **Data storage**: **Postgres 16**, one instance on the VPS, two
      databases (`ordering` for this backend, `warehouse` for the separate
      AI/analytics system in the sibling `dhaka_kacchi_ai_harness` repo) —
      a real database boundary, not just separate schemas, so each backend
      gets its own least-privilege role.
    - **Why moved off Cloudflare**: D1 is only reachable from a Cloudflare
      Worker or the `wrangler` CLI — a future second backend on the VPS
      couldn't share that database. Postgres on the VPS can be shared by
      any number of backends.
    - Secrets (SSH host/user/key for Hostinger, Twilio credentials, email
      service credentials, `DATABASE_URL`, later `ANTHROPIC_API_KEY` for
      chatbot features) go in GitHub repo → Settings → Secrets and variables
      → Actions (frontend), and in a `.env` file on the VPS (backend, never
      committed). Never in code.
5. **Repo structure:**
   ```
   src/                    (frontend — TanStack Start/React)
     components/
     routes/               (Home, About, History, Order, Subscribe)
     lib/                  (API calls, utils)
   worker/                 (backend — Claude-Code-owned, Node.js + Postgres)
     src/                  (order API route handlers, business logic)
     schema.sql            (Postgres schema, applied via `npm run db:migrate`)
     CLAUDE.md             (how to run/maintain this backend)
     ARCHITECTURE.md       (how it fits together)
   public/
     images/
   .github/workflows/      (deploy-frontend.yml → Hostinger)
   ```
   The shared VPS infrastructure (`docker-compose.yml`, `Caddyfile`,
   Postgres-init scripts, backups) lives in `dhaka_kacchi_ai_harness` —
   that repo already hosts the warehouse, the other tenant of the same VPS.

## Frontend / backend split (important — governs how work is divided)
- **Both frontend and backend are Claude-Code-owned.** UI, pages, visual
  polish, and component structure live in `src/`; API design, database
  schema, auth, order logic, and any admin/notification logic live in
  `worker/`. Arko wants both built and maintained like a senior web
  developer would do it — deliberate architecture, proper structure, no
  shortcuts, no auto-generated glue.
- Frontend calls a clearly defined API (REST) that Claude Code designs —
  keep the contract explicit so the two sides can evolve independently
  without breaking each other.
- Secrets, business logic, and anything "production-grade" (payment
  handling, order validation, batch capacity limits, admin auth) live in
  the backend — never hardcoded into the frontend.

## Ordering system spec (captured 2026-07-25; delivery model updated 2026-09-08)
- **Cooking/delivery schedule:** kacchi is cooked and delivered **only on
  Saturdays**. Berlin delivery only.
- **Order cutoff:** orders for a given Saturday must be placed by
  **Friday 6:00 PM** (Europe/Berlin time). After that, that Saturday's date is
  no longer selectable on the order form; the next selectable date rolls to the
  following Saturday.
- **No batch capacity limit for now** — no cap enforced on orders per Saturday.
  Arko manages capacity manually if needed; revisit if volume grows.
- **Payment: cash on delivery only.** No online payment integration
  (Stripe/PayPal) needed now or in the near term.
- **Order flow:** customer goes to Order page → selects item(s) + quantity →
  selects a Saturday date (only valid/future Saturdays before the Fri 6pm
  cutoff are selectable) → chooses pickup or delivery (delivery requires
  typing an address and fetching a fee quote before submit is enabled) →
  enters contact details → submits.
- **No minimum order quantity** (old site's 2-plate minimum is dropped).
- **Menu (only 2 items):**
  - Kacchi Biriyani — two sizes:
    - Taster Box — €9.99, 750ml, 1 person: 1 piece lamb, 1 whole potato, fresh salad.
    - Regular Box — €15.00 (best value), 1000ml, 2 people: 2 pieces lamb,
      1 whole potato, fresh salad, homemade chutney.
  - Shahi Borhani (add-on) — €6.00, 500ml, yogurt-based drink with mint/spices.
- **Fulfillment (updated 2026-09-08, distance method changed 2026-09-08 —
  replaces the old fixed-station list below, which is retired):**
  - **Free pickup** at the kitchen itself: Leopoldplatz, Wedding — in front of
    Lidl (Müllerstraße 25, 13353 Berlin — the Lidl in the former Karstadt
    building). Always available, no external dependency of any kind.
  - **Paid doorstep delivery**, anywhere within Berlin, priced by straight-line
    distance from the kitchen: 0–5km €5, 5–10km €7, 10–15km €9, 15–20km €12,
    20–25km €15. Beyond 25km, or outside Berlin, delivery isn't offered;
    pickup remains free. Fee tiers live in `worker/src/data.ts`
    (`DELIVERY_FEE_TIERS`) — Arko expects to keep adding tiers/adjusting
    prices, so that list is deliberately the only thing that needs editing.
  - **Distance is looked up from the customer's own postal code** against a
    German postal-code dataset bundled with the Worker
    (`worker/src/lib/plzLookup.ts`, `worker/src/data/postal-code-coordinates.json`,
    `worker/src/data/berlin-postal-codes.json`) — no geocoding API, no Google
    account, no billing, no live network call, no cost, nothing that can be
    "down." Originally built on the Google Maps Geocoding API plus a real
    Berlin boundary polygon; replaced 2026-09-08 once Arko asked whether a
    free/self-hosted option existed — postal-code-centroid accuracy is
    precise enough for 5km-wide fee bands, and German postal codes are
    officially assigned to one municipality each, so "is this Berlin" is an
    exact lookup, not a geometric approximation. The server always re-derives
    the fee itself at order time; it never trusts a client-supplied fee (same
    principle as menu pricing).
  - ~~Delivery stations (fixed list: Gesundbrunnen, Schönhauser Allee, ...
    Wedding)~~ — retired 2026-09-08. The old list and `GET /stations` no
    longer exist.
- **Notifications on new order:**
  - Customer gets a confirmation email. Email service: Arko has a Hostinger
    business email subscription, **not yet connected** — needs setup (SMTP
    credentials → Worker secrets) before this can go live.
  - Arko gets a WhatsApp alert via **Twilio WhatsApp API** (needs Twilio
    account + WhatsApp sender setup — not yet created).
  - ERP integration (Arko has an ERP system) — explicitly deferred, Arko will
    scope this later. Don't build it yet.
- **Admin view:** not yet decided — no dashboard requested yet; revisit later
  if Arko wants one (orders currently only need email + WhatsApp visibility).

## Ordering system — build status (2026-07-25; delivery model rebuilt 2026-09-08; ported off Cloudflare 2026-09-07/08)
- **Built and verified working end-to-end** (Playwright-driven click-through,
  as of 2026-07-25, against the ORIGINAL station-based model — re-verify
  against the new pickup/delivery flow before relying on this claim again):
  - `worker/` — Node.js + Postgres backend (ported from Cloudflare
    Workers + D1; see "Ported off Cloudflare" below). Routes: `GET /v1/menu`,
    `GET /v1/availability`, `POST /v1/delivery-quote`, `POST /v1/orders`,
    plus an unversioned `GET /health`. Pricing, cutoff validation, and
    delivery-fee computation are all server-side authoritative (frontend
    never sets its own price or delivery fee — the server always re-derives
    both). Manually verified against every one of these routes (pickup order,
    delivery order, valid and rejected postal codes) after the port; see
    `worker/CLAUDE.md` for setup/run and `worker/ARCHITECTURE.md` for how it
    fits together.
  - `src/routes/order.tsx` — real order form (replaced the old WhatsApp-only
    page), calling the backend via `src/lib/api.ts`. Falls back to the old
    WhatsApp button if the API is unreachable.
- **Ported off Cloudflare Workers/D1 to Node.js/Postgres, 2026-09-07/08**:
  driven by Arko's decision to split frontend/backend/database into three
  independently-deployable systems (frontend → Hostinger, backend+database →
  a Contabo VPS) that a future second backend can also connect to — D1 is
  only reachable from a Cloudflare Worker or `wrangler`, so it couldn't be
  shared. Also applied the SOLID/loose-coupling/documentation/API-readiness
  standards Arko asked for while the code was already being touched: routes
  now depend on an `OrdersRepository` interface, not a concrete Postgres
  pool (`worker/src/lib/ordersRepository.ts`); order notifications (email,
  WhatsApp) are decoupled via a small awaitable pub/sub
  (`worker/src/lib/orderEvents.ts`) instead of being called inline from the
  route handler; every route is versioned under `/v1` and typed with `zod`,
  which also generates a real OpenAPI document at `/v1/doc` for a future
  mobile/web app to build a client from (validated clean against the
  Redocly OpenAPI linter). Business logic (menu pricing, delivery pricing,
  date/cutoff rules) is unchanged byte-for-byte — only the runtime, database
  driver, and internal wiring changed.
- **Delivery model rebuilt 2026-09-08**: retired the fixed 27-station
  free-delivery list entirely, replaced by free pickup at the kitchen
  (Leopoldplatz/Müllerstraße 25) plus distance-tiered doorstep delivery
  across Berlin. `worker/schema.sql`'s `orders` table gained
  `fulfillment_type`/address/`distance_km`/`delivery_fee_cents` columns and
  dropped `station` — this was a clean drop+recreate (`DROP TABLE IF EXISTS`
  before each `CREATE TABLE`), since D1's schema file has no real migration
  chain and `CREATE TABLE IF NOT EXISTS` alone would have silently no-op'd
  against the old table shape.
- **Distance method changed 2026-09-08, same day**: the first version used the
  Google Maps Geocoding API plus a bundled real Berlin boundary polygon
  (`worker/src/lib/geo.ts`'s point-in-polygon, `berlin-boundary.geo.json`).
  Arko asked whether a free/self-hosted alternative existed instead of a paid
  API needing a Google Cloud billing account — replaced same-day with
  `worker/src/lib/plzLookup.ts`: a bundled German postal-code-to-coordinate
  dataset (`worker/src/data/postal-code-coordinates.json`, 8298 entries, ~240KB,
  from WZBSocialScienceCenter/plz_geocoord, Apache 2.0, derived from Destatis
  municipal registry data) plus the exact list of Berlin's 190 postal codes
  (`worker/src/data/berlin-postal-codes.json`). `geocoding.ts` and
  `geocode_cache` were deleted entirely — there's no live call left to wrap or
  cache. `quoteDeliveryForAddress()` in `delivery.ts` is now a plain
  synchronous function (no `Env` param, no `await`) — the "lookup" is reading
  a value out of a table shipped with the Worker. Validated against the same
  10 real-world coordinates the polygon version was checked against
  (Brandenburg border towns correctly excluded, far Berlin districts and the
  Steinstücken exclave correctly included) before the swap was made. Tradeoff
  disclosed to Arko and accepted: postal-code-centroid accuracy is slightly
  less precise than full street-address geocoding, acceptable given the fee
  tiers are 5km-wide bands.
- **Not yet done:**
  - Contabo VPS not yet provisioned — `worker/` and Postgres only run
    locally so far. See the VPS infrastructure files and provisioning
    sequence in `dhaka_kacchi_ai_harness` (Docker Compose, Caddy,
    Postgres-init, backups) once written.
  - Hostinger business email SMTP credentials not yet set (needed for order
    confirmation emails — `sendConfirmationEmail` currently no-ops with a
    warning if unset, so this doesn't block launch).
  - Twilio account + WhatsApp sender not yet set up (same graceful no-op
    behavior via `sendWhatsAppAlert`).
  - No CI/CD yet for the frontend (Hostinger SFTP via GitHub Actions) or an
    automated deploy for `worker/` to the VPS — both still manual for now.
  - ERP integration details — deferred, Arko to scope later.
  - Whether a separate admin dashboard is wanted (orders, subscribers, batches).
  - Timeline/scope for the chatbot or agentic AI integration mentioned as a later phase.

## Working preferences
- Arko wants everything set up "the most professional way" — proper CI/CD,
  maintainable structure, not quick hacks — even though the current site started
  as a prototype.
- He's comfortable with technical detail but appreciates concrete step-by-step
  instructions (exact menu paths, exact commands) rather than abstract advice.