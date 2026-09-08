# Frontend ↔ Backend integration

The frontend is a pure client. All server calls go through `src/lib/api.ts`.

## Environment

Create `.env` (or `.env.local`) in the project root:

```
VITE_API_BASE_URL=https://your-backend.example.com
```

Restart the dev server after changing env vars.

## Endpoints the frontend expects

| Method | Path               | Body                                                              | Response                                                                     | Used by        |
|--------|--------------------|--------------------------------------------------------------------|-------------------------------------------------------------------------------|----------------|
| POST   | `/subscribe`       | `{ "email": str }`                                                  | `{ "ok": true }`                                                               | `/subscribe`   |
| GET    | `/menu`            | —                                                                    | `{ "items": [{ sku, name, priceCents, description }] }`                       | `/order`       |
| GET    | `/availability`    | —                                                                    | `{ "dates": string[] }` (upcoming orderable Saturdays, YYYY-MM-DD)             | `/order`       |
| POST   | `/delivery-quote`  | `{ street, houseNumber, postalCode, city }`                          | `{ ok, deliverable, feeCents?, distanceKm?, reason?, message? }` (200/400) | `/order`       |
| POST   | `/orders`          | `{ items: [{sku, quantity}], deliveryDate, fulfillmentType: "pickup"\|"delivery", address?, customerName, customerEmail, customerPhone, notes? }` | `{ orderId, deliveryDate, fulfillmentType, distanceKm, subtotalCents, deliveryFeeCents, totalCents, paymentMethod }` (201) | `/order` |

`address` on `POST /orders` is required when `fulfillmentType` is `"delivery"`
and has the same shape as `/delivery-quote`'s body. The server always
re-derives the delivery fee itself from the address — it never trusts a
client-supplied fee, distance, or coordinates, mirroring how menu prices are
re-derived server-side from `{sku, quantity}`. Station-based delivery
(`station`, `GET /stations`) has been retired in favor of two fulfillment
modes: free pickup at the kitchen, or distance-tiered delivery. Distance is
looked up from the customer's own postal code against a German postal-code
dataset bundled with the Worker — no geocoding API, no external account, no
cost, and `/delivery-quote` can never fail with a "service unavailable"
error the way a live API dependency could.

The `/menu`, `/availability`, `/delivery-quote`, `/orders` endpoints are
implemented in `worker/` (a separate Cloudflare Worker + D1 backend — see
`worker/README.md` and the root `CLAUDE.md` for the full architecture and
ordering system spec). `/subscribe` is not yet implemented there.

## CORS

Your backend must allow requests from:

- The Lovable preview URL (shown in the top of the editor)
- The published domain once you publish (`*.lovable.app` or your custom domain)

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

## If you later want to keep it all in Lovable

Move each endpoint into a TanStack `createServerFn` handler and swap
`api.subscribe` in `src/lib/api.ts` to call it via `useServerFn`. Components
don't change.
