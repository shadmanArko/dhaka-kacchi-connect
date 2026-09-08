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
     ├──▶ src/lib/orders.ts ──────── pure pricing rules, zero DB/HTTP dependency
     ├──▶ src/lib/delivery.ts ────── delivery-fee calculation (uses plzLookup.ts)
     │
     ▼
src/lib/ordersRepository.ts ──── the ONLY interface a route handler depends
     │                            on to persist an order — not `pg` directly
     ▼
Postgres (via src/db.ts)

After an order is saved:
src/lib/orderEvents.ts ──emit──▶ src/lib/email.ts     (sends confirmation)
                          └────▶ src/lib/whatsapp.ts  (alerts the owner)
```

## Why it's structured this way

**Routes depend on an interface, not a database.** `OrdersRepository`
(`src/lib/ordersRepository.ts`) is what `index.ts` actually calls —
`createPostgresOrdersRepository(pool)` is just today's implementation of it.
If the database ever changed, or a test suite needed a fake one, only that
one factory function would need to change — no route handler would.

**Notifications are decoupled from the order route via an event.**
`POST /orders` doesn't call `sendConfirmationEmail` or `sendWhatsAppAlert`
directly — it saves the order, then emits one `order.created` event
(`src/lib/orderEvents.ts`). Email and WhatsApp each register themselves as
listeners at startup. Adding a third channel later (e.g. a loyalty system)
means writing one new file that registers a listener — zero changes to the
order route or the existing listeners. This is a plain in-process
publish/subscribe, not a message queue — a queue would solve a scaling
problem this single-process service doesn't have.

**The server never trusts a price, fee, or distance sent by the client.**
Every order re-derives its own subtotal (`priceOrder` in `orders.ts`) and,
for delivery, its own fee (`quoteDeliveryForAddress` in `delivery.ts`) from
scratch, server-side. A `POST /delivery-quote` call earlier in the checkout
flow is only ever a preview for the customer to see — never treated as
authorization for the price used when the order is actually placed.

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
protect). These aren't gaps to fill later by default; they're deliberate
calls to keep this simple until there's an actual reason not to.
