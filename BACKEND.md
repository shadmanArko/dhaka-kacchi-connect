# Frontend ↔ Backend integration

The frontend is a pure client. All server calls go through `src/lib/api.ts`.

## Environment

Create `.env` (or `.env.local`) in the project root:

```
VITE_API_BASE_URL=https://your-backend.example.com
```

Restart the dev server after changing env vars.

## Endpoints the frontend expects

| Method | Path         | Body                | Response       | Used by            |
|--------|--------------|---------------------|----------------|--------------------|
| POST   | `/subscribe` | `{ "email": str }`  | `{ "ok": true}`| `/subscribe` page  |

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
