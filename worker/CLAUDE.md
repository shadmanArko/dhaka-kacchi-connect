# Ordering backend — maintenance guide

## What this is

The API behind the Dhaka Kacchi ordering site: customer accounts (phone/email
+ password, OTP-verified at signup), menu, delivery-fee quotes, and order
creation (with email confirmation + a Telegram alert to the owner). Node.js +
Postgres, plain `pg` (no ORM), Hono for HTTP routing. Runs as one long-lived
process — in Docker on the VPS in production, via `npm run dev` locally.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit together and
why they're structured this way. This file is just "how do I change X."

## Running it locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npm run db:migrate          # applies schema.sql — safe to re-run, but see warning below
npm run dev                 # http://localhost:8787, auto-restarts on file changes
```

Without SMTP/Telegram vars set, orders still save correctly — those just log
a warning and skip. **OTP codes and password-reset links are different**:
without `BERLIN_SMS_API_KEY`/`HOSTINGER_SMTP_*` configured, the code/link
is printed to the console instead of actually sent, so registration and
"forgot password" both stay fully testable locally with zero real
credentials — look for a `[dev] ...` line in the server's output.

**`npm run db:migrate` runs `DROP TABLE IF EXISTS` before every
`CREATE TABLE`.** Fine against an empty or throwaway database. Never run it
against a database with real orders in it without a backup first — there is
no real migration chain yet (see `schema.sql`'s own comment).

## The 5 most common changes

**1. Add or change a menu item**
Edit `MENU` in [src/data.ts](./src/data.ts). That's the only place prices
live — the frontend never sends its own price, so this is the single source
of truth.

**2. Add or change a delivery fee tier**
Edit `DELIVERY_FEE_TIERS` in [src/data.ts](./src/data.ts) — an ordered list
of `{ maxKm, feeCents }`. The first tier whose `maxKm` isn't exceeded wins.
No other file needs to change.

**3. Add a new API endpoint**
In [src/index.ts](./src/index.ts): define a `createRoute({...})` (method,
path, request/response `zod` schemas, `operationId`, `summary`,
`security: []`), then `v1.openapi(route, handler)`. The OpenAPI doc at
`/v1/doc` updates automatically — nothing else to maintain by hand.

**4. Add a new notification channel** (e.g. a future loyalty system)
Add a new file under `src/lib/` that calls `onOrderCreated(...)` from
[src/lib/orderEvents.ts](./src/lib/orderEvents.ts), then import it once from
`src/index.ts` (see how `registerEmailNotifications` and
`registerTelegramNotifications` are wired). No existing file needs to change.

**5. Add a database column**
Add it to the relevant `CREATE TABLE` in [schema.sql](./schema.sql), update
the matching TypeScript type in `src/lib/orders.ts`, and update the
`INSERT`/`UPDATE` in `src/lib/ordersRepository.ts`. Re-run `npm run
db:migrate` against a dev database (see the warning above about real data).

**6. Add a new authenticated route**
Same as #3, but also add `security: [{ bearerAuth: [] }]` to the
`createRoute({...})` call and register the guard once, before any route
definitions: `v1.use("/your-path", requireAuth(sessionsRepository))` — see
[src/lib/authMiddleware.ts](./src/lib/authMiddleware.ts) and how `/orders`,
`/me`, `/auth/logout` already do this in `src/index.ts`.

## Customer accounts

Every order requires a logged-in account — there's no guest checkout.
Registration collects phone/name/DOB/address/email/password, generates a
6-digit code, and texts it via **BerlinSMS's plain SMS API**
([src/lib/berlinSms.ts](./src/lib/berlinSms.ts)) — chosen over BerlinSMS's
separate managed "2FA" product specifically so the message wording is
fully ours to control. The account is only created once that code is
confirmed. Regular login is phone-or-email + password — no OTP on every
login, since that would mean an SMS cost per login instead of a one-time
cost per new customer. "Forgot password" is email-only, on purpose, never
phone/SMS — see [src/lib/auth.ts](./src/lib/auth.ts) for every
OTP/session/lockout/rate-limit constant in one place, and
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design rationale.

A logged-in customer's email/phone are permanently locked once verified —
`POST /orders` always takes them from the account, never from the request
body. Name and address stay editable at checkout, and an edit there writes
through to the account for next time.

## Telegram: outbound alerts + inbound "upcoming orders" lookup

Outbound (unchanged): a per-order alert the instant one comes in, plus the
Friday-evening weekly digest script (below). Inbound (new): send the bot
**any** text message from the owner's own chat, and it replies with every
non-cancelled order from today forward, grouped by Saturday — see
`POST /telegram/webhook` in [src/index.ts](./src/index.ts) and
[src/lib/telegram.ts](./src/lib/telegram.ts).

This needs a third env var beyond `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`:
`TELEGRAM_WEBHOOK_SECRET` (any random string, e.g. `openssl rand -hex 32`) —
Telegram echoes it back on every webhook call as the
`X-Telegram-Bot-Api-Secret-Token` header, which is how the route tells a
real Telegram request from anything else. The route 404s until all three
vars are set.

**One-time setup after setting the env vars** (re-run any time the secret
rotates — it's idempotent):
```bash
npm run telegram:set-webhook
```
Verify it took with `GET https://api.telegram.org/bot<token>/getWebhookInfo`
— this is also the main debugging tool if a message to the bot doesn't get
a reply, since the webhook route always responds `200` to Telegram (so
Telegram never retries), meaning failures don't show up any other way.

## Key files, if you need to go deeper

| File | Owns |
|---|---|
| `src/config.ts` | Reading and validating environment variables |
| `src/db.ts` | The Postgres connection pool, plus a `withTransaction`/`isUniqueViolation` helper |
| `src/lib/orders.ts` | Order pricing rules — no database, no HTTP |
| `src/lib/ordersRepository.ts` | Reading/writing orders in Postgres |
| `src/lib/customers.ts` | Customer domain types — no database, no HTTP |
| `src/lib/customersRepository.ts` | Reading/writing customer accounts in Postgres |
| `src/lib/otpRepository.ts` | The 6-digit codes texted at registration |
| `src/lib/sessionsRepository.ts` | Logged-in sessions (a bearer token's hash → customer) |
| `src/lib/passwordResetTokensRepository.ts` | "Forgot password" email links |
| `src/lib/auth.ts` | Password hashing, OTP/token generation, and every OTP/session/lockout/rate-limit constant |
| `src/lib/authMiddleware.ts` | The `requireAuth()` "you must be signed in" check |
| `src/lib/delivery.ts` | Delivery-fee calculation |
| `src/lib/plzLookup.ts` | Postal-code → coordinates lookup |
| `src/lib/orderEvents.ts` | The "an order was created" event, and who listens |
| `src/lib/email.ts` | Order-confirmation and password-reset emails |
| `src/lib/berlinSms.ts` | The one-time OTP text at registration (BerlinSMS's plain SMS API, custom message) |
| `src/lib/telegram.ts` | The owner's per-order alert, plus the inbound `/telegram/webhook` handling (see also `scripts/weeklyDigest.ts`) |
| `scripts/setTelegramWebhook.ts` | One-time registration of the inbound webhook URL with Telegram |
| `src/schemas.ts` | Request/response shapes (also generates the OpenAPI doc) |
| `src/index.ts` | Routes — wires schemas, handlers, and the repositories together |
| `src/server.ts` | Process entrypoint (starts the HTTP server, handles shutdown) |
| `scripts/weeklyDigest.ts` | Friday-evening Telegram summary of the week's orders (cron-triggered, see below) |

## Deploying

Build and run via Docker (see `Dockerfile`) on the VPS, behind Caddy. See
the shared VPS infrastructure docs in the sibling `dhaka_kacchi_ai_harness`
repo for the full setup (`docker-compose.yml`, Caddy, Postgres roles).

The weekly digest (`npm run digest:weekly`) is a plain script, not a route —
it's meant to be triggered by an OS-level cron job on the VPS at Friday
18:00 Europe/Berlin (the same moment that Saturday's order cutoff closes),
e.g.:
```
0 18 * * 5 cd /opt/dhaka-kacchi/dhaka-kacchi-connect/worker && npm run digest:weekly >> /var/log/dhaka-kacchi-digest.log 2>&1
```

## For a future app

Every route is versioned under `/v1` and typed with `zod`, which generates a
real OpenAPI 3.0 document at `GET /v1/doc`. A future mobile or web app (or an
AI coding agent building one) should generate its API client from that
document rather than hand-reading route code — it's always in sync with the
actual code, since it's generated from the same schemas Hono validates
requests against.
