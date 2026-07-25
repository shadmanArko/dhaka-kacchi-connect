
# Port Dhaka Kacchi Berlin into this Lovable project

Rebuild the existing static site (Old/) as a proper TanStack Start + Tailwind v4 app. Keep the visual design **exactly as-is** — dark theme, gold accents, Cormorant Garamond + DM Sans typography, film-grain overlay, gold hairlines, ring animations, product cards, story sections, timeline, WhatsApp CTA. All strings and imagery come straight from Old/.

## What I learned from your Old site

**Structure** — 5 pages: Home, About, History, Subscribe, Order. Shared nav + footer injected via `js/nav.js`. Floating Instagram/Facebook buttons. Nav becomes solid on scroll, hamburger on mobile.

**Design system**
- Colors: `--black #07070A`, `--deep #0F0E0B`, `--surface #161510`, `--gold #C8A96E`, `--gold2 #E4CEAA`, `--gold3 #8B6914`, `--cream #F0E6D0`, `--muted #7A7060`, `--line rgba(200,169,110,0.18)`
- Fonts: Cormorant Garamond (serif, italic emphasis in gold), DM Sans (uppercase tracked labels)
- Motifs: hairline dividers, thin gold underline (50×1px), corner numbers "01 —", eyebrow labels (letter-spacing 3–5px), radial gold glow, film-grain SVG noise overlay, subtle image zoom, ring pulses, IntersectionObserver reveal-on-scroll

**Home sections** — split hero (copy + kacchi photo), Berlin banner, product grid (Kacchi + Borhani), 6-card "Why Us", story teaser, food spotlight w/ specs bar, timeline "How to order", subscribe CTA, social section, footer.

**Content** — Berlin-based, Bangladeshi doctor's story, 48h advance / 2-plate minimum, WhatsApp `wa.me/4915563583687`, email `hello@dhakakacchi.com`, socials `@dhakakacchi`.

## Target architecture

```text
src/
├── routes/
│   ├── __root.tsx              → <link> for Google Fonts, <SiteHeader/> + <Outlet/> + <SiteFooter/> + <FloatingSocial/>
│   ├── index.tsx               → Home
│   ├── about.tsx               → About
│   ├── history.tsx             → History
│   ├── subscribe.tsx           → Subscribe
│   └── order.tsx               → Order
├── components/
│   ├── layout/                 SiteHeader, SiteFooter, FloatingSocial
│   ├── sections/               Hero, BerlinBanner, ProductGrid, WhyUs,
│   │                           StoryBlock, FoodSpotlight, SpecsBar,
│   │                           Timeline, QuoteBlock, CTASection,
│   │                           SocialSection, PageHero, ProseSection
│   └── ui/                     Eyebrow, SectionTitle, GoldRule, Tag,
│                               Card, PullQuote, RingsDecoration,
│                               GoldButton, GhostButton, Reveal
├── content/                    site.ts (nav/footer/social/WA number/email),
│                               products.ts, whyUs.ts, timeline.ts,
│                               values.ts, history.ts, story.ts
├── hooks/                      useReveal.ts (IntersectionObserver),
│                               useScrolled.ts (nav bg toggle)
├── lib/
│   └── whatsapp.ts             buildWaLink({ text }) helper
├── assets/                     kacchi.jpg, borhani-*.jpg, logo, favicons
│                               (uploaded via lovable-assets CDN)
└── styles.css                  design tokens under @theme + shadcn tokens
```

**Design tokens** — port every color/font/spacing constant into `src/styles.css`:
- CSS vars for palette in `:root` (converted to `oklch`).
- `@theme inline` exposes them as Tailwind utilities (`bg-black-ink`, `text-gold`, `border-line`, `font-serif`, `font-sans`, etc.).
- Global `body::before` film-grain and `@keyframes fu / rp / imgZoom` kept in styles.css.

**Content data over hard-coded JSX** — every list (products, why-us cards, timeline steps, values, tags, history sections) lives in `src/content/*.ts` as typed data. Sections receive props; no copy is duplicated. Changing the WhatsApp number, email, or a product tag is a one-file edit.

**Fonts** — loaded via `<link>` in `__root.tsx` head (Cormorant Garamond + DM Sans). Never `@import`ed in CSS (Tailwind v4 rule).

**Images** — uploaded through `lovable-assets` CLI so binaries live on CDN, not in the repo. Each `.asset.json` imported by the component that uses it. Alt text preserved.

**Navigation** — replace `js/nav.js` DOM injection with `<SiteHeader>` using TanStack `<Link>` for type-safe routing, `useScrolled()` for background toggle, and a proper accessible mobile menu.

**Reveal-on-scroll** — one `useReveal` hook + `<Reveal>` wrapper replicates the IntersectionObserver behavior with cascading delay for card grids.

**SEO** — every route defines its own `head()` with title, description, og:title, og:description. Home route gets og:image (asset URL) once real photos are uploaded.

**Accessibility** — semantic `<header>/<nav>/<main>/<footer>`, single `<h1>` per route, aria labels on nav toggle, focus states on gold buttons, `prefers-reduced-motion` disables ring/zoom/fade animations.

## Frontend polish beyond a 1:1 copy

- Sharper responsive rules using the grid + `min-w-0` + `shrink-0` pattern for the Berlin banner and product cards on mobile.
- Consistent focus rings (gold, 2px offset) for keyboard users.
- Smoother reveal timing (respect reduced motion).
- Proper `<picture>` / `loading="lazy"` / `decoding="async"` on all photos.
- Subscribe form as a real controlled form component with a loading + success state (posts to a placeholder endpoint you swap out later).

## Connecting your future Claude-Code backend

The frontend stays a **pure client** and calls your backend over HTTP. Two clean seams:

1. **Subscribe form** — `POST` to `VITE_API_BASE_URL + "/subscribe"` with `{ email }`. Backend returns `{ ok: true }`. All logic (Mailchimp/Brevo/DB insert) lives in your Claude-built API.
2. **Order flow** — currently just deep-links WhatsApp. If you later want form-based orders, add `POST /orders` with `{ name, plates, date, notes }` returning an order id. Frontend already isolates this in `lib/orders.ts`.

Config:
- `.env` → `VITE_API_BASE_URL=https://your-backend.example.com`
- All `fetch` calls go through `src/lib/api.ts` (one place to add auth headers/CORS handling).
- CORS: your backend must allow the Lovable preview + production origins.
- No secrets in the frontend — API keys stay on your backend.

If you'd rather keep everything in one Lovable project later, we can move those endpoints into TanStack `createServerFn` handlers without touching the components — the `lib/api.ts` layer keeps the swap trivial.

## Build order

1. Tokens + fonts + film grain in `styles.css`; `<link>` fonts in `__root.tsx`.
2. `SiteHeader`, `SiteFooter`, `FloatingSocial`, `Reveal`, `RingsDecoration`, shared UI atoms.
3. Content files under `src/content/`.
4. Upload images via `lovable-assets`.
5. Home page (all sections).
6. About, History, Subscribe, Order pages.
7. Per-route `head()` metadata.
8. `lib/api.ts` + wire the Subscribe form to `VITE_API_BASE_URL`.
9. Responsive + reduced-motion + a11y pass.

Result: identical look and feel, but organized as small typed components with data-driven content and one clear place to plug in Claude Code's backend.
