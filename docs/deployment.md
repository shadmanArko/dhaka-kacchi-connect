# Deployment — hosting, CI/CD, secrets

## Split architecture (decided 2026-09-07)

Arko's explicit decision: frontend, backend, and database must be three
separately-deployable systems that stay connected, so a future second
backend can plug in later without redesigning any of this.

- **Frontend**: this repo's `src/`, built as a static SPA, deployed to
  Hostinger via **GitHub Actions**: build on push to `main` → FTP the
  built output into `public_html`. Uses Arko's existing Hostinger
  subscription. Only ever talks to the backend over HTTPS via
  `VITE_API_BASE_URL` — no backend code or secrets ship in this bundle.
- **Backend (order API)**: `worker/` — plain **Node.js + Postgres**
  (moved off Cloudflare Workers/D1 2026-09-07/08; the original
  Cloudflare version lives on only in git history). Runs in Docker on a
  **Contabo VPS**, behind Caddy for automatic HTTPS. Owns all order
  logic — validation, cutoff enforcement, email confirmation, WhatsApp
  alert, storage. See [worker/CLAUDE.md](../worker/CLAUDE.md) and
  [worker/ARCHITECTURE.md](../worker/ARCHITECTURE.md) for how it works and
  how to change it.
- **Data storage**: **Postgres 16**, one instance on the VPS, two
  databases (`ordering` for this backend, `warehouse` for the separate
  AI/analytics system in the sibling `dhaka_kacchi_ai_harness` repo) —
  a real database boundary, not just separate schemas, so each backend
  gets its own least-privilege role.
- **Why moved off Cloudflare**: D1 is only reachable from a Cloudflare
  Worker or the `wrangler` CLI — a future second backend on the VPS
  couldn't share that database. Postgres on the VPS can be shared by
  any number of backends.

The shared VPS infrastructure (`docker-compose.yml`, `Caddyfile`,
Postgres-init scripts, backups) lives in `dhaka_kacchi_ai_harness` — that
repo already hosts the warehouse, the other tenant of the same VPS.

## Secrets

- SSH host/user/key for Hostinger, Twilio credentials, email service
  credentials, `DATABASE_URL`, later `ANTHROPIC_API_KEY` for chatbot
  features → GitHub repo → Settings → Secrets and variables → Actions
  (frontend pipeline reads these).
- Backend secrets → a `.env` file on the VPS, never committed.
- Never in code, either repo.

## CI/CD pipelines

Both pipelines exist. Path filters keep them independent, so a
backend-only push never rebuilds the site and vice versa.

- **`.github/workflows/deploy-frontend.yml`**: typecheck → lint → test →
  build translations (`scripts/i18n/build-locales.mjs` — see
  [localization.md](localization.md)) → prerender (`bun run build:static`)
  → refuse-if-source-maps → archive the bundle for rollback → FTP to
  Hostinger.
- **`deploy-backend.yml`**: typecheck → test → SSH + `docker compose up -d
  --build`.

### Frontend transfer: FTP/FTPS tradeoff

The frontend transfer is **explicit FTPS** (`AUTH TLS` on port 21, not
plain FTP, not SFTP — this Hostinger plan only exposes port 21). This is
what stops the FTP password crossing the internet in cleartext on every
deploy. Three things were established before switching, because getting
this wrong breaks the one path that puts the site on the server:

1. The server accepts it — probed directly: `AUTH TLS` returns 234 and
   negotiates TLS 1.3.
2. **The certificate can never match.** Hostinger presents its own shared
   certificate (`CN=hostinger.com`, SAN `*.hostinger.com` and country
   siblings) — no value the host secret could hold matches it, whether
   it's a `dhakakacchi.com` name or a bare IP.
3. Which is why `security` is pinned to `loose` **explicitly**, not left
   to the action's default. Honest tradeoff: `loose` still encrypts the
   session (defeats passive interception of the password — the realistic
   threat between a GitHub runner and shared hosting), but does **not**
   reject the mismatched hostname, so it does not defend against an
   active man-in-the-middle. No setting can defend against that on a
   shared cert reached by IP. Do not "harden" this to `strict` — it
   cannot succeed here, and the only outcome is a failed deploy.

`server-dir` is `"./"`, not `"./public_html/"` — this FTP account
(`u669793404.dhakakacchi.com`) is domain-scoped; its connection root IS
already that domain's `public_html`. Using `"./public_html/"` here once
created a nested `public_html/public_html/` one level below the real
docroot and the live site silently never updated — confirmed by comparing
the real site against the file manager. Full reasoning sits beside the FTP
step in `deploy-frontend.yml` itself.

## Not yet done

- Contabo VPS not yet provisioned — `worker/` and Postgres only run
  locally so far. See the VPS infrastructure files and provisioning
  sequence in `dhaka_kacchi_ai_harness` (Docker Compose, Caddy,
  Postgres-init, backups) once written.
- Hostinger business email SMTP credentials not yet set.
- Twilio account + WhatsApp sender not yet set up.

## Rollback

The FTP step overwrites the live docroot in place — there is no previous
version on the server afterwards, and `dist-static/` can't be reproduced
later just by checking the commit out again once a dependency has moved.
So the build artifact is archived **before** the transfer runs:

To roll back: open the last known-good run of `deploy-frontend.yml` in
GitHub Actions, download its `dist-static` artifact (kept 30 days), unzip
it, and upload the contents to the same server directory with any FTP
client.
