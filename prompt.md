# Prompt: Build a Dark‑Luxury Food Brand Website

Copy the prompt below into Lovable (or any capable AI coder) to generate a website with the **same look, feel, and architecture** as *Dhaka Kacchi Berlin*. Swap the brand-specific details (name, cuisine, location, contact) for your own.

---

## 1. How to use this file

1. Read the whole prompt once.
2. Replace every `[[BRACKETED]]` placeholder with your brand's info.
3. Paste it as a **single message** into a fresh Lovable project.
4. After the first build, iterate section by section ("refine the hero", "tighten the product grid on mobile", etc.).

Tip: Long prompts work best when they explicitly forbid things you don't want (default fonts, purple gradients, generic hero layouts, etc.).

---

## 2. The prompt (copy from here ⬇)

> **Project:** Build a premium, editorial, dark‑luxury marketing website for **[[BRAND NAME]]**, a **[[CUISINE / PRODUCT TYPE]]** based in **[[CITY, COUNTRY]]**. The site sells **[[PRODUCT 1]]** and **[[PRODUCT 2]]** on a pre‑order model (customers order via WhatsApp, minimum **[[MIN QTY]]**, **[[LEAD TIME]]** advance notice).
>
> ### Stack (do not change)
> - TanStack Start v1 + React 19 + Vite 7
> - Tailwind CSS v4 (tokens in `src/styles.css` via `@theme`, no `tailwind.config.js`)
> - File‑based routing under `src/routes/`
> - No react‑router‑dom, no Next.js/Remix conventions
>
> ### Pages / routes
> Create these routes, each with its **own** `head()` metadata (unique title, description, og:title, og:description):
> 1. `/` — Home
> 2. `/about` — Founder story
> 3. `/history` — Origin/history of the dish/product
> 4. `/subscribe` — Email capture for launches
> 5. `/order` — How to order + WhatsApp deep link
>
> Do NOT put sections behind hash anchors — every major section is its own route so it's SSR‑ and SEO‑friendly.
>
> ### Design system
> **Vibe:** dark, editorial, luxury magazine. Think Aesop × fine‑dining menu. Zero generic SaaS. **Reject** Inter, Poppins, purple/indigo gradients, and centered "hero + 3 feature cards" layouts.
>
> **Color tokens** (define as CSS custom properties in `:root` inside `src/styles.css`, converted to `oklch()`, then expose via `@theme inline`):
> - `--black-ink` `#07070A` — page background
> - `--deep` `#0F0E0B` — alternate section background
> - `--surface` `#161510` — card surfaces
> - `--gold` `#C8A96E` — primary accent
> - `--gold-2` `#E4CEAA` — highlight
> - `--gold-3` `#8B6914` — deep accent / numbers
> - `--cream` `#F0E6D0` — headline text
> - `--muted-warm` `#7A7060` — body copy
> - `--line` `rgba(200,169,110,0.18)` — hairline dividers
>
> Rename `[[gold]]` to your brand accent if you want (e.g. emerald, copper, oxblood) but keep the same **role** for each token.
>
> **Typography:**
> - Serif headline: **Cormorant Garamond** (light 300, italic for emphasis in accent color)
> - Sans label / body: **DM Sans** (uppercase, letter‑spacing `0.25em`–`0.4em` for eyebrows)
> - Load both via `<link>` in `src/routes/__root.tsx` head — **never** `@import` a remote URL in `styles.css` (Tailwind v4 rule).
>
> **Motifs — recreate all of these:**
> - Full‑page **film‑grain SVG noise overlay** (`body::before`, `pointer-events:none`, opacity ~0.04)
> - **Hairline gold dividers** between every section (`border-t border-line`)
> - **Eyebrow labels**: 0.68rem, uppercase, tracking‑[0.4em], gold
> - **Section titles**: serif, `clamp(2.5rem, 5vw, 4.2rem)`, light weight, italic emphasis in gold via `<em class="text-gold not-italic italic">`
> - **50×1px gold underline** after eyebrow labels
> - **Corner step numbers** ("01 —", "02 —") in serif gold for card grids
> - **Radial gold glow** behind heroes: `radial-gradient(ellipse at center 40%, rgba(200,169,110,0.07) 0%, transparent 70%)`
> - **Concentric pulsing ring decoration** behind hero product images (SVG, 3 rings, staggered `@keyframes rp` scale + fade)
> - **Subtle image zoom** on hero photos (`@keyframes imgZoom` 20s ease‑in‑out infinite alternate)
> - **Reveal‑on‑scroll** via `IntersectionObserver` in a `useReveal` hook + `<Reveal>` wrapper, with cascading `delayMs` for card grids
> - **Respect `prefers-reduced-motion`** — disable rings, zoom, and fade animations
>
> ### Home page composition (in this order)
> 1. **Split hero** — left: eyebrow + serif headline with italic gold emphasis + short body + primary gold button + ghost button; right: square photo of hero product with pulsing rings behind it and slow zoom animation
> 2. **Info banner** — thin horizontal bar with 4 icon+label pairs (Location, Halal/Quality claim, Lead time, Made‑to‑order)
> 3. **Product grid** — 2 large product cards (image + eyebrow + serif title + description + tags + "Order via WhatsApp" link). Hover: image zoom + gold underline slide.
> 4. **Why us** — 6‑card grid, 3 columns × 2 rows, each card has: "01 —" corner number, emoji/icon, serif title, body. Hover: gold top border fills across (`w-0 → w-full`), subtle background tint.
> 5. **Story teaser** — asymmetric two‑column: photo left with a floating gold‑bordered badge ("48h / Advance Order"), story text right with pull quote and tags.
> 6. **Food spotlight** — full‑bleed background photo, dark gradient overlay, centered serif headline "Kacchi. *Borhani.* Berlin." + tagline. Below: 4‑column specs bar (numbers in serif gold, labels uppercase muted).
> 7. **Timeline** — vertical timeline "How to order in [City]", 4–5 steps, gold gradient line, gold dots, step label + serif title + body.
> 8. **CTA section** — centered eyebrow + big serif line + body + primary button → `/subscribe`
> 9. **Social section** — Instagram + Facebook branded cards linking out
>
> ### Sub‑pages
> Each sub‑page starts with a `<PageHero>` (centered eyebrow, serif h1 with italic gold accent, optional 50×1 gold rule + body). Then a series of `<StoryBlock>` (alternating image/text sides) and/or `<CardGrid>` (values, principles). End every sub‑page with a `<CTASection>`.
>
> - **/about** — founder's story, 3–4 paragraphs, pull quote, values card grid
> - **/history** — origin of the dish/product, 4 story blocks with historical photos, ending in "…and now in [City]"
> - **/subscribe** — real controlled form (email input, submit button, loading + success states) that POSTs to `VITE_API_BASE_URL + "/subscribe"`
> - **/order** — three steps: choose plates → WhatsApp deep link (`wa.me/[[WHATSAPP_INTL_NUMBER]]` with pre‑filled message) → confirmation info. Minimum quantity + lead time clearly stated.
>
> ### Architecture rules (non‑negotiable)
>
> ```text
> src/
> ├── routes/                 one file per URL; __root.tsx wraps everything
> ├── components/
> │   ├── layout/             SiteHeader, SiteFooter, FloatingSocial
> │   ├── sections/           Hero, ProductGrid, StoryBlock, Timeline, CTASection, …
> │   └── ui/                 Reveal, Typography atoms, DkButton, Rings
> ├── content/                site.ts, products.ts, whyUs.ts, timeline.ts,
> │                           values.ts, history.ts  ← ALL COPY LIVES HERE
> ├── hooks/                  useReveal.ts, useScrolled.ts
> ├── lib/                    api.ts (single fetch seam), whatsapp.ts, utils.ts
> ├── assets/                 photos uploaded via lovable-assets (CDN)
> └── styles.css              @theme tokens + global animations + film grain
> ```
>
> **Rules:**
> - **All copy lives in `src/content/*.ts`** as typed data. Sections take props. Changing a product tag or the WhatsApp number is a one‑file edit.
> - **No hardcoded colors** in components — only `text-gold`, `bg-black-ink`, `border-line`, etc. from `@theme` tokens.
> - **`<SiteHeader>`** uses TanStack `<Link>`, becomes solid on scroll (via `useScrolled`), collapses to accessible hamburger below `md`.
> - **`<FloatingSocial>`** — fixed Instagram + Facebook buttons bottom‑right, desktop only.
> - **All images**: `loading="lazy"`, `decoding="async"`, real `alt` text.
> - Every route defines its own `head()` — never reuse the home metadata. Only the home route gets an `og:image`.
> - **Accessibility**: semantic `<header>/<nav>/<main>/<footer>`, one `<h1>` per route, `aria-label` on the nav toggle, visible 2px gold focus rings on interactive elements.
>
> ### Backend seam (frontend stays a pure client)
> - Create `src/lib/api.ts` exporting a single `apiFetch(path, init)` that prefixes `import.meta.env.VITE_API_BASE_URL`.
> - `Subscribe` form calls `apiFetch("/subscribe", { method: "POST", body: JSON.stringify({ email }) })`.
> - No secrets in the frontend. The backend is built separately (I'll wire it later).
>
> ### Brand data to inject (fill these in)
>
> ```ts
> // src/content/site.ts
> export const site = {
>   name: "[[BRAND NAME]]",
>   tagline: "[[SHORT TAGLINE]]",
>   location: "[[CITY, COUNTRY]]",
>   email: "[[hello@brand.com]]",
>   website: "[[www.brand.com]]",
>   whatsappNumber: "[[COUNTRY_CODE + NUMBER, no +]]",
>   socials: {
>     instagram: "https://instagram.com/[[HANDLE]]",
>     facebook:  "https://facebook.com/[[HANDLE]]",
>   },
> };
> ```
>
> Products (2 items): `[[PRODUCT 1 name, blurb, tags, image]]`, `[[PRODUCT 2 name, blurb, tags, image]]`.
>
> Why‑us 6 cards: `[[6 short titles + one‑line body each]]`.
>
> Timeline steps (4): `[[Step 1..4 titles + bodies]]`.
>
> ### Deliverable checklist
> - [ ] All 5 routes render, each with unique `head()`
> - [ ] Design tokens in `styles.css` via `@theme`
> - [ ] Google Fonts loaded via `<link>` in `__root.tsx`
> - [ ] Film grain overlay visible site‑wide
> - [ ] Reveal‑on‑scroll works, respects reduced motion
> - [ ] WhatsApp button opens `wa.me/…` with pre‑filled text
> - [ ] Subscribe form has loading + success states and calls `VITE_API_BASE_URL`
> - [ ] Mobile: hamburger menu, product cards stack, banner wraps, timeline still readable
> - [ ] Lighthouse: no console errors, images lazy‑loaded, semantic HTML
>
> Build in this order: **tokens → layout shell → content files → home sections → sub‑pages → metadata → responsive & a11y pass.**

## 3. After the first generation

Iterate with focused follow‑ups:

- "Tighten the hero — the headline should be one line at `md` and above."
- "Make the product cards align to a 4/3 image ratio and add a hover underline on the CTA."
- "The timeline gold line disappears on Safari — fix the background gradient."
- "Add an `og:image` to `/` once I upload the hero photo."

## 4. Variations

Swap these to reskin the same architecture:

| Brand type | Accent color | Serif headline | Sans body |
|---|---|---|---|
| Fine dining | Gold `#C8A96E` | Cormorant Garamond | DM Sans |
| Specialty coffee | Copper `#B87333` | Fraunces | Inter Tight |
| Natural wine | Oxblood `#6B1E1E` | Instrument Serif | Work Sans |
| Artisan bakery | Sage `#7A8B6F` | Libre Caslon Text | IBM Plex Sans |

Keep the **structure and motifs** the same — only tokens and photography change.
