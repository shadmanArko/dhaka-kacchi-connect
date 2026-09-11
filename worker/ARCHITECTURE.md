# Ordering backend — architecture

A five-minute tour of how this service is put together and why. For "how do
I change X," see [CLAUDE.md](./CLAUDE.md) instead.

## Shape

```
HTTP request
     │
     ▼
src/index.ts ─── routes, each with a zod schema (request+response validated,
     │            OpenAPI doc generated from the same schema — no hand-
     │            written API reference to keep in sync)
     │
     ├─ requireAuth() ── the ONLY gate: /orders, /me, /auth/logout need a
     │                    valid session; every /auth/* route that BEGINS a
     │                    session (register/verify-otp/login/password-reset)
     │                    is itself public - can't require login to log in
     │
     ├──▶ src/lib/orders.ts ──────── pure pricing rules, zero DB/HTTP dependency
     ├──▶ src/lib/delivery.ts ────── delivery-fee calculation (uses plzLookup.ts)
     ├──▶ src/lib/auth.ts ────────── password hashing, OTP code generation/hashing,
     │                               session/reset-token generation - pure, zero DB
     ├──▶ src/lib/berlinSms.ts ───── sends the OTP text BerlinSMS's plain SMS API -
     │                               this app writes the message, BerlinSMS just delivers it
     │
     ▼
ordersRepository.ts / customersRepository.ts / otpRepository.ts /
sessionsRepository.ts / passwordResetTokensRepository.ts ── one interface
     │            per table; the ONLY things route handlers depend on to
     │            read/write - never `pg` directly
     ▼
Postgres (via src/db.ts)

After an order is saved:
src/lib/orderEvents.ts ──emit──▶ src/lib/email.ts     (sends confirmation)
                          └────▶ src/lib/telegram.ts  (alerts the owner)

Separately, cron-triggered (NOT event-driven - see below):
scripts/weeklyDigest.ts ──▶ src/lib/telegram.ts (Friday-evening summary)
```

## Why it's structured this way

**Routes depend on an interface, not a database.** `OrdersRepository`
(`src/lib/ordersRepository.ts`) is what `index.ts` actually calls —
`createPostgresOrdersRepository(pool)` is just today's implementation of it.
If the database ever changed, or a test suite needed a fake one, only that
one factory function would need to change — no route handler would.

**Notifications are decoupled from the order route via an event.**
`POST /orders` doesn't call `sendConfirmationEmail` or `sendTelegramOrderAlert`
directly — it saves the order, then emits one `order.created` event
(`src/lib/orderEvents.ts`). Email and Telegram each register themselves as
listeners at startup. Adding a third channel later (e.g. a loyalty system)
means writing one new file that registers a listener — zero changes to the
order route or the existing listeners. This is a plain in-process
publish/subscribe, not a message queue — a queue would solve a scaling
problem this single-process service doesn't have.

**The weekly digest is cron-triggered, not event-driven.** Nothing "happens"
to cause a Friday-evening summary — it's purely time-based, so it can't be
"just another `orderEvents` listener" the way email/Telegram are. It's a
plain script (`scripts/weeklyDigest.ts`) invoked by an OS-level cron job on
the VPS, the same pattern the sibling `warehouse` repo already uses for its
own hourly sync — not an in-process scheduler library (`node-cron` etc.),
which would be new infrastructure this service otherwise avoids (see "What
this deliberately does NOT have" below).

**The server never trusts a price, fee, distance — or identity — sent by
the client.** Every order re-derives its own subtotal (`priceOrder` in
`orders.ts`) and, for delivery, its own fee (`quoteDeliveryForAddress` in
`delivery.ts`) from scratch, server-side. A `POST /delivery-quote` call
earlier in the checkout flow is only ever a preview for the customer to
see — never treated as authorization for the price used when the order is
actually placed. The same rule extends to identity: once a session exists,
`POST /orders` always takes the customer's email/phone from their account
(via `requireAuth()` + `customersRepository.findById`), never from the
request body — a client could send anything there and it would simply be
ignored.

**Account creation waits for OTP confirmation, on purpose.** Registering
doesn't create a `customers` row immediately — it creates an `otp_codes` row
holding the whole would-be account, and only turns that into a real
`customers` row once the texted code is confirmed (`otpRepository.ts`,
`src/index.ts`'s `/auth/verify-otp` handler). This means an abandoned
signup (wrong number, gave up, whatever) never leaves a half-created,
unusable account behind.

**This app generates and checks the OTP code itself - BerlinSMS only
delivers the text.** `auth.ts` generates the 6-digit code and stores its
SHA-256 hash (`otp_codes.code_hash`), never the raw code; `berlinSms.ts`
sends it via BerlinSMS's plain SMS API with a message this app fully
controls. This was a deliberate choice over BerlinSMS's separate managed
"2FA" product (which generates/checks the code on its own servers): that
product's message wording isn't customizable, and this app wanted a
message that actually says "Dhaka Kacchi." `auth.ts`'s
`OTP_TTL_MINUTES`/`OTP_MAX_ATTEMPTS`/`OTP_MAX_SENDS_PER_*` constants are
this app's own expiry/attempt/rate-limit policy on the registration
endpoint, independent of whatever limits BerlinSMS applies on its side.

**Sessions are opaque tokens in Postgres, not JWTs.** At this app's scale, a
Postgres lookup per request costs nothing worth optimizing away, and an
opaque token is trivially revocable (logout/password-reset just deletes the
row) — a JWT isn't revocable without building the equivalent of this same
table as a blocklist anyway. Sent as `Authorization: Bearer <token>`, not a
cookie, since this same API is meant to serve a future mobile app too (see
"Every route is versioned" below) and bearer headers work identically for
both, unlike cookies.

**Delivery pricing has no external dependency.** Distance is computed from a
German postal-code dataset bundled directly into this service
(`src/data/postal-code-coordinates.json`, `src/lib/plzLookup.ts`) — no
Google Maps API key, no billing account, no network call, nothing that can
be "down." A postal code's centroid is precise enough for 5km-wide fee
bands; see `plzLookup.ts` for the data provenance and validation notes.

**Every route is versioned (`/v1`) and schema-typed (`zod`).** This costs
nothing today and avoids a painful retrofit later, once a real client (a
future mobile app) depends on specific paths. The same `zod` schemas
(`src/schemas.ts`) validate incoming requests AND generate the OpenAPI
document served at `/v1/doc` — that document is the API reference for
anyone building a client against this backend.

## Where this runs

Locally: `npm run dev`, a plain Node process reading Postgres from
`DATABASE_URL`. In production: built into a Docker image (see `Dockerfile`)
and run on a Contabo VPS behind Caddy, which handles HTTPS. Postgres runs in
a sibling container on the same VPS — see the shared infrastructure docs in
the `dhaka_kacchi_ai_harness` repo for the full Docker Compose setup.

## What this deliberately does NOT have

No ORM (the entire write surface is a handful of SQL statements — not worth
the setup cost yet). No message queue (one process, no cross-service
fan-out to coordinate). No real migration chain yet (`schema.sql` is a
single file with explicit drops — revisit once there's real order data to
protect). No in-process scheduler (`node-cron`, etc.) — the one time-based
job (the weekly digest) is a plain script invoked by OS-level cron. No
separate session store (Redis, etc.) — sessions live in Postgres like
everything else; this traffic doesn't need a faster store. These aren't
gaps to fill later by default; they're deliberate calls to keep this simple
until there's an actual reason not to.
