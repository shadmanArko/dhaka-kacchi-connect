# Ordering system — spec and build status

The customer-facing order flow: what it does, how it's built, and what's
left. See [worker/CLAUDE.md](../worker/CLAUDE.md) and
[worker/ARCHITECTURE.md](../worker/ARCHITECTURE.md) for how the backend
itself is run and structured — this doc is the product spec plus a log of
how it got built, not the backend's own reference.

## Spec (captured 2026-07-25; delivery model updated 2026-09-08)

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

## Build status (2026-07-25; delivery model rebuilt 2026-09-08; ported off Cloudflare 2026-09-07/08)

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
  - `src/pages/OrderPage.tsx` (routed at `/order` and `/de/order` — see
    [localization.md](localization.md)) — real order form (replaced the old
    WhatsApp-only page), calling the backend via `src/lib/api.ts`. Falls back
    to the old WhatsApp button if the API is unreachable.
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
  - ERP integration details — deferred, Arko to scope later.
  - Whether a separate admin dashboard is wanted (orders, subscribers, batches).
  - Timeline/scope for the chatbot or agentic AI integration mentioned as a later phase.

See [deployment.md](deployment.md) for the CI/CD pipelines that build and
ship this system.
