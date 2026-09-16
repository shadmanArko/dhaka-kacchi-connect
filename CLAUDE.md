# Dhaka Kacchi Berlin — Project Context

## Who this is for
Arko runs Dhaka Kacchi, an online kacchi biryani + borhani business in Berlin,
alongside an AI/ML bootcamp. Background in product strategy / B2B SaaS.
Prefers plain, concrete explanations and simple working solutions over clever ones.

## Documentation
This file is the short, general-context entry point — who this is for, the
big decisions, and working preferences. **Everything system-specific (how
localization works, the ordering system's spec, deployment/CI/CD) lives in
[docs/](docs/README.md) as one file per system.** Read the relevant doc
there before working on that system; don't expect this file to have the
details.

## Current state
- Live site is a static HTML/CSS/JS site (no framework), currently hosted on Hostinger
  under a `public_html` structure. Pages: index, about, history, subscribe, order.
- Design: dark background, gold accents, Cormorant Garamond + DM Sans fonts,
  scroll-reveal animations. Strong brand story: a Bangladeshi doctor in Berlin who
  couldn't find real Old Dhaka kacchi, so she started making it herself.
- Ordering today: WhatsApp button only (wa.me link), 48h notice, 2-plate minimum.
- Subscribe form posts to a Google Apps Script URL (no-cors fetch, best-effort).
- Old code lives in GitHub repo: `shadmanArko/dhaka-kacchi-web` (private).
  This repo is being kept as the untouched **archive/backup** of the old static site.

## Decisions made so far
1. **Rebuild, not a re-skin.** Arko is fine restructuring
   the whole project for maintainability. Priority order: (1) ordering system,
   (2) visual polish pass, (3) later: chatbot / agentic AI features.
2. **Rebuilt via Lovable initially, then fully moved off it.** The project
   was originally scaffolded and iterated on through Lovable (an AI website
   builder) connected to this GitHub repo via its two-way sync. Arko later
   decided to stop using Lovable entirely — cost, and Lovable-introduced bugs
   in the frontend — and every trace of it (its vite-config wrapper, error-
   reporting hook, `.lovable/` metadata, boilerplate docs) has since been
   removed from the repo. All frontend work now goes through the same
   Claude-Code-driven workflow the backend already used.
3. **Repo reality check (inherited from the Lovable scaffold):** this
   project is **TanStack Start** (SSR + server functions, Vite, bun), not a
   plain Vite SPA. Default Nitro build target is Cloudflare. This matters for
   hosting — see [docs/deployment.md](docs/deployment.md).
4. **Hosting/deployment is a split architecture** (frontend → Hostinger,
   backend + database → a Contabo VPS, three independently-deployable
   systems) — full details, secrets locations, and the CI/CD pipelines are
   in [docs/deployment.md](docs/deployment.md).
5. **Repo structure:**
   ```
   src/                    (frontend — TanStack Start/React)
     components/
     pages/                (page components, shared by English + translated routes)
     routes/               (English routes: Home, About, History, Order, Subscribe, Privacy)
     routes/$locale/       (translated routes, e.g. /de/... — one file per page)
     locales/              translations.csv (source of truth) + generated/ (git-ignored build output)
     lib/                  (API calls, utils, i18n init, SEO helpers)
   worker/                 (backend — Claude-Code-owned, Node.js + Postgres)
     src/                  (order API route handlers, business logic)
     schema.sql            (Postgres schema, applied via `npm run db:migrate`)
     CLAUDE.md             (how to run/maintain this backend)
     ARCHITECTURE.md       (how it fits together)
   docs/                   (system-specific docs — see docs/README.md)
   public/
     images/
   .github/workflows/      (deploy-frontend.yml → Hostinger)
   ```
   The shared VPS infrastructure (`docker-compose.yml`, `Caddyfile`,
   Postgres-init scripts, backups) lives in `dhaka_kacchi_ai_harness` —
   that repo already hosts the warehouse, the other tenant of the same VPS.

## Frontend / backend split (important — governs how work is divided)
- **Both frontend and backend are Claude-Code-owned.** UI, pages, visual
  polish, and component structure live in `src/`; API design, database
  schema, auth, order logic, and any admin/notification logic live in
  `worker/`. Arko wants both built and maintained like a senior web
  developer would do it — deliberate architecture, proper structure, no
  shortcuts, no auto-generated glue.
- Frontend calls a clearly defined API (REST) that Claude Code designs —
  keep the contract explicit so the two sides can evolve independently
  without breaking each other.
- Secrets, business logic, and anything "production-grade" (payment
  handling, order validation, batch capacity limits, admin auth) live in
  the backend — never hardcoded into the frontend.

## Working preferences
- Arko wants everything set up "the most professional way" — proper CI/CD,
  maintainable structure, not quick hacks — even though the current site started
  as a prototype.
- He's comfortable with technical detail but appreciates concrete step-by-step
  instructions (exact menu paths, exact commands) rather than abstract advice.
- Docs are split one-system-per-file under `docs/` (see
  [docs/README.md](docs/README.md)) rather than piled into this file — keep
  it that way when adding new subsystems.
