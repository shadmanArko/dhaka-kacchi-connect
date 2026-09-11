# Frontend ↔ Backend integration

The frontend is a pure client. All server calls go through `src/lib/api.ts`.

## Environment

Create `.env` (or `.env.local`) in the project root:

```
VITE_API_BASE_URL=https://your-backend.example.com
```

Restart the dev server after changing env vars.

## Endpoints the frontend expects

Every ordering endpoint is versioned under `/v1` (see
`worker/src/index.ts`) — `/subscribe` is the one exception, since it isn't
implemented in `worker/` at all yet (see below).

| Method | Path               | Body                                                              | Response                                                                     | Used by        |
|--------|--------------------|--------------------------------------------------------------------|-------------------------------------------------------------------------------|----------------|
| POST   | `/subscribe`       | `{ "email": str }`                                                  | `{ "ok": true }`                                                               | `/subscribe`   |
| GET    | `/v1/menu`            | —                                                                    | `{ "items": [{ sku, name, priceCents, description }] }`                       | `/order`       |
| GET    | `/v1/availability`    | —                                                                    | `{ "dates": string[] }` (upcoming orderable Saturdays, YYYY-MM-DD)             | `/order`       |
| POST   | `/v1/delivery-quote`  | `{ street, houseNumber, postalCode, city }`                          | `{ ok, deliverable, feeCents?, distanceKm?, reason?, message? }` (200/400) | `/order`       |
| POST   | `/v1/orders`          | `{ items: [{sku, quantity}], deliveryDate, fulfillmentType: "pickup"\|"delivery", address?, customerName, customerEmail, customerPhone, notes? }` | `{ orderId, deliveryDate, fulfillmentType, distanceKm, subtotalCents, deliveryFeeCents, totalCents, paymentMethod }` (201) | `/order` |

The full OpenAPI 3.0 document (generated from the same schemas the backend
validates requests against, so it can never drift from the real behavior)
is served at `GET /v1/doc` — the authoritative reference for a future app
client, beyond this quick table.

`address` on `POST /v1/orders` is required when `fulfillmentType` is
`"delivery"` and has the same shape as `/v1/delivery-quote`'s body. The
server always re-derives the delivery fee itself from the address — it
never trusts a client-supplied fee, distance, or coordinates, mirroring how
menu prices are re-derived server-side from `{sku, quantity}`. Station-based
delivery (`station`, `GET /stations`) has been retired in favor of two
fulfillment modes: free pickup at the kitchen, or distance-tiered delivery.
Distance is looked up from the customer's own postal code against a German
postal-code dataset bundled with the backend — no geocoding API, no external
account, no cost, and `/v1/delivery-quote` can never fail with a "service
unavailable" error the way a live API dependency could.

The `/v1/menu`, `/v1/availability`, `/v1/delivery-quote`, `/v1/orders`
endpoints are implemented in `worker/` (a Node.js + Postgres backend,
deployed to a VPS — see `worker/README.md`, `worker/CLAUDE.md` and the root
`CLAUDE.md` for the full architecture and ordering system spec). `/subscribe`
is not yet implemented there.

## CORS

Your backend must allow requests from:

- `http://localhost:8080` (local dev)
- The published domain (`https://dhakakacchi.de` and `https://www.dhakakacchi.de`)

Minimum CORS response headers:

```
Access-Control-Allow-Origin: <origin>
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Building the backend with Claude Code

Any HTTP framework works (Hono, Express, FastAPI, Cloudflare Workers…).
The frontend does not care where it runs, only that the endpoints above exist
and CORS is configured. Keep API keys (Mailchimp, Brevo, database secrets)
on the backend — never in `VITE_*` variables.
