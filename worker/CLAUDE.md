# Ordering backend — maintenance guide

## What this is

The API behind the Dhaka Kacchi ordering site: menu, delivery-fee quotes, and
order creation (with email + WhatsApp alerts). Node.js + Postgres, plain
`pg` (no ORM), Hono for HTTP routing. Runs as one long-lived process — in
Docker on the VPS in production, via `npm run dev` locally.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit together and
why they're structured this way. This file is just "how do I change X."

## Running it locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npm run db:migrate          # applies schema.sql — safe to re-run, but see warning below
npm run dev                 # http://localhost:8787, auto-restarts on file changes
```

Without SMTP/Twilio vars set, orders still save correctly — email/WhatsApp
sending just logs a warning and skips. Nothing blocks local development on
having real credentials.

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
`registerWhatsAppNotifications` are wired). No existing file needs to change.

**5. Add a database column**
Add it to the relevant `CREATE TABLE` in [schema.sql](./schema.sql), update
the matching TypeScript type in `src/lib/orders.ts`, and update the
`INSERT`/`UPDATE` in `src/lib/ordersRepository.ts`. Re-run `npm run
db:migrate` against a dev database (see the warning above about real data).

## Key files, if you need to go deeper

| File | Owns |
|---|---|
| `src/config.ts` | Reading and validating environment variables |
| `src/db.ts` | The Postgres connection pool |
| `src/lib/orders.ts` | Order pricing rules — no database, no HTTP |
| `src/lib/ordersRepository.ts` | Reading/writing orders in Postgres |
| `src/lib/delivery.ts` | Delivery-fee calculation |
| `src/lib/plzLookup.ts` | Postal-code → coordinates lookup |
| `src/lib/orderEvents.ts` | The "an order was created" event, and who listens |
| `src/lib/email.ts` / `src/lib/whatsapp.ts` | The two current notification channels |
| `src/schemas.ts` | Request/response shapes (also generates the OpenAPI doc) |
| `src/index.ts` | Routes — wires schemas, handlers, and the repository together |
| `src/server.ts` | Process entrypoint (starts the HTTP server, handles shutdown) |

## Deploying

Build and run via Docker (see `Dockerfile`) on the VPS, behind Caddy. See
the shared VPS infrastructure docs in the sibling `dhaka_kacchi_ai_harness`
repo for the full setup (`docker-compose.yml`, Caddy, Postgres roles).

## For a future app

Every route is versioned under `/v1` and typed with `zod`, which generates a
real OpenAPI 3.0 document at `GET /v1/doc`. A future mobile or web app (or an
AI coding agent building one) should generate its API client from that
document rather than hand-reading route code — it's always in sync with the
actual code, since it's generated from the same schemas Hono validates
requests against.
