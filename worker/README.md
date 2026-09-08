# Dhaka Kacchi order backend

Owns all order logic: menu pricing, delivery-date/cutoff validation,
distance-tiered delivery pricing (or free pickup), order storage (Postgres),
customer confirmation email, and Arko's WhatsApp alert. For how it's
structured and why, see [ARCHITECTURE.md](./ARCHITECTURE.md). For how to
run it and make common changes, see [CLAUDE.md](./CLAUDE.md).

Delivery pricing needs **no API key and no external account** — distance is
looked up from a German postal-code dataset bundled directly with this
service (`src/data/postal-code-coordinates.json`,
`src/data/berlin-postal-codes.json`, `src/lib/plzLookup.ts`). It's free,
works offline, and has nothing that can go down or need billing set up.

## One-time setup

```bash
cd worker
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum — see src/config.ts
                        # for the full list of required/optional vars
npm run db:migrate     # applies schema.sql to the database in DATABASE_URL
```

Until the SMTP/Twilio vars are set, orders still save correctly —
`sendConfirmationEmail` and `sendWhatsAppAlert` just log a warning and skip
sending, so nothing blocks going live with ordering before those are wired up.

## Local development

```bash
npm run dev   # http://localhost:8787, auto-restarts on file changes
```

Point the frontend at it with `VITE_API_BASE_URL=http://localhost:8787` in
the repo root's `.env.local`.

API docs (OpenAPI 3.0, generated from the route schemas) are served at
`http://localhost:8787/v1/doc`.

## Deploy

Built and run as a Docker container (see `Dockerfile`) on the Contabo VPS,
behind Caddy for HTTPS. See the shared VPS infrastructure docs in the
sibling `dhaka_kacchi_ai_harness` repo for the full setup and provisioning
steps.
