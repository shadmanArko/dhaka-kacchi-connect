# Dhaka Kacchi order backend (Cloudflare Worker)

Owns all order logic: menu pricing, delivery-date/cutoff validation,
distance-tiered delivery pricing (or free pickup), order storage (D1),
customer confirmation email, and Arko's WhatsApp alert. See the root
`CLAUDE.md` for the full architecture decision and ordering system spec, and
`../BACKEND.md` for the API contract the frontend expects.

Delivery pricing needs **no API key and no external account** — distance is
looked up from a German postal-code dataset bundled directly with the Worker
(`src/data/postal-code-coordinates.json`, `src/data/berlin-postal-codes.json`,
`src/lib/plzLookup.ts`). It's free, works offline, and has nothing that can
go down or need billing set up.

## One-time setup

```bash
cd worker
npm install

# Create the D1 database (only once, ever)
npx wrangler d1 create dhaka-kacchi
# Copy the returned database_id into wrangler.toml (REPLACE_WITH_D1_DATABASE_ID)

# Apply the schema
npm run db:migrate:remote

# Set secrets (never commit these — see .dev.vars.example for the full list)
npx wrangler secret put HOSTINGER_SMTP_HOST
npx wrangler secret put HOSTINGER_SMTP_PORT
npx wrangler secret put HOSTINGER_SMTP_USER
npx wrangler secret put HOSTINGER_SMTP_PASS
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WHATSAPP_FROM
npx wrangler secret put ARKO_WHATSAPP_TO
```

Until the email/WhatsApp secrets are set, orders still save correctly —
`sendConfirmationEmail` and `sendWhatsAppAlert` just log a warning and skip
sending, so nothing blocks going live with ordering before those are wired up.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in real values, or leave blank to skip notifications
npm run db:migrate:local
npm run dev                      # wrangler dev on http://localhost:8787
```

Point the frontend at it with `VITE_API_BASE_URL=http://localhost:8787` in
the repo root's `.env.local`.

## Deploy

```bash
npm run deploy
```

In CI, this should run via a GitHub Actions workflow using a
`CLOUDFLARE_API_TOKEN` repo secret (not yet created — see CLAUDE.md's "Still
open" list).
