// Generates a fully static export of the site for Hostinger (plain shared
// hosting - no Node/edge runtime). Nitro's own `static` preset would
// normally do this via prerendering, but it's broken for TanStack Start in
// this dependency combo (confirmed open upstream bug:
// https://github.com/TanStack/router/issues/4369 - either 404s during its
// own crawl, or crashes entirely). Workaround: build with the `node-server`
// preset (works cleanly - see vite.config.ts), boot that server briefly,
// fetch each known route directly, and save the real rendered HTML as
// static files. Run `vite build` before this script - it expects
// `.output/server/index.mjs` and `.output/public/` to already exist.
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Every route this app has. There's no automatic discovery (that's exactly
// the broken feature this script works around) - add a new entry here
// whenever a new route is added under src/routes/. checkRoutesComplete()
// below catches a forgotten entry at build time instead of a silent
// production 404 (which is exactly how /privacy went live 404ing for a
// while - it existed as a real route and just never made it into this list).
// Every English route this app has, plus the translated pages again under
// each of TRANSLATED_ROUTES.map(route => `/${locale}${route}`) below - kept
// as one flat list (not routes × locales nested) so checkRoutesComplete()
// below can still diff it directly against routeTree.gen.ts's full path set.
const ROUTES = [
  "/",
  "/about",
  "/history",
  "/order",
  "/subscribe",
  "/reset-password",
  "/privacy",
  // Signed-in-only, but still a real static path that must exist on the host -
  // the gate is client-side (see the route's own comment), so the HTML has to
  // be there for the redirect to be able to run at all. Not localized - a
  // customer's own order history isn't marketing copy, and translating it
  // would need its own scoping pass.
  "/orders",
  // Admin panel - all three are static/enumerable paths (no dynamic
  // segment). Order detail/discount/status editing is deliberately a
  // panel on /admin driven by a `?order=` search param, not its own
  // /admin/orders/$id route - this static host has no SPA-fallback
  // rewrite configured, so a dynamic path segment can't be reliably
  // deep-linked/hard-refreshed (see routes/admin/_layout.tsx). English-only
  // per Arko's own instruction - the admin panel is his tool, not a
  // customer-facing page.
  "/admin",
  "/admin/login",
  "/admin/orders/new",
  "/admin/reporting",
  "/admin/cockpit",
  "/admin/post-predict",
  // Every locale in src/lib/i18n.ts's SUPPORTED_LOCALES, prefixed onto the
  // subset of ROUTES above that's actually translated (src/routes/$locale/
  // has one file per entry here - see that directory for the full list).
  // Adding a language later is: add it to SUPPORTED_LOCALES, add its column
  // to src/locales/translations.csv, and this array grows on its own.
  ...["de"].flatMap((locale) =>
    ["/", "/about", "/history", "/order", "/subscribe", "/privacy"].map((route) =>
      route === "/" ? `/${locale}` : `/${locale}${route}`,
    ),
  ),
];

const PORT = 4173;
const OUTPUT_DIR = path.resolve("dist-static");

const SITE_URL = "https://dhakakacchi.com";

// Routes that are real pages but must never enter the sitemap. Exclude them
// here rather than by editing ROUTES - ROUTES has to stay a complete mirror of
// routeTree.gen.ts or checkRoutesComplete() below stops working.
//   /admin*         - internal tooling, also noindexed (routes/admin/_layout.tsx)
//   /reset-password - reachable only from an emailed token link, also noindexed
//   /orders         - a signed-in customer's own history, also noindexed
const isExcludedFromSitemap = (route) =>
  route.startsWith("/admin") || route === "/reset-password" || route === "/orders";

// Slash-terminated, because LiteSpeed's DirectorySlash 301s /about -> /about/
// and that redirect target is the URL Google actually lands on. Must stay
// byte-compatible with canonical() in src/lib/seo.ts, so the sitemap and the
// canonical tags can never disagree.
function canonicalUrl(route) {
  return route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}/`;
}

// No lastmod/changefreq/priority: the only timestamp available here is the
// deploy time, which is not a content-modification date, and Google discards
// lastmod values it judges untrustworthy. changefreq and priority are ignored
// outright.
function buildSitemap(routes) {
  const urls = routes.map((route) => `  <url><loc>${canonicalUrl(route)}</loc></url>`).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

// An index route inside a directory (e.g. routes/admin/index.tsx) gets a
// trailing-slash path ("/admin/") distinct from a pathless layout sharing
// the same directory ("/admin") - the dev/prerender server 307-redirects
// the former to the latter, and that's the one this script actually
// fetches/prerenders, so this normalizes both to the same string before
// comparing (never touching the root "/" itself).
function normalizePath(routePath) {
  return routePath.length > 1 && routePath.endsWith("/") ? routePath.slice(0, -1) : routePath;
}

// Fails the build loudly if a real (non-dynamic) route in
// src/routeTree.gen.ts has no matching entry above, instead of silently
// shipping a page that 404s on Hostinger despite building/typechecking
// fine - see the ROUTES comment above for the real bug this already caused
// once. Dynamic ($param), optional ({-$param}), and splat ($) segments are
// skipped - those can never be a fixed list of static paths, by design.
//
// Reads `fullPath`, not `path` - for a route nested under a pathless
// layout (e.g. routes/admin/_layout.login.tsx), `path` is relative to its
// parent ('/login'), while `fullPath` is the real absolute URL
// ('/admin/login') this script actually needs to fetch.
async function checkRoutesComplete() {
  const routeTree = await readFile(path.resolve("src/routeTree.gen.ts"), "utf8");
  const found = new Set();
  for (const match of routeTree.matchAll(/fullPath:\s*'([^']*)'/g)) {
    found.add(normalizePath(match[1]));
  }

  const missing = [...found].filter(
    (routePath) => !routePath.includes("$") && !ROUTES.includes(routePath),
  );
  if (missing.length > 0) {
    throw new Error(
      `These routes exist in src/routeTree.gen.ts but are missing from ROUTES in ` +
        `scripts/build-static.mjs, so they'd 404 in production: ${missing.join(", ")}`,
    );
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server didn't respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  await checkRoutesComplete();

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit",
  });
  let killed = false;
  const kill = () => {
    if (!killed) {
      killed = true;
      server.kill();
    }
  };
  process.on("exit", kill);

  try {
    await waitForServer(`http://localhost:${PORT}/`);

    for (const route of ROUTES) {
      const res = await fetch(`http://localhost:${PORT}${route}`);
      if (!res.ok) {
        throw new Error(
          `Route ${route} returned HTTP ${res.status} - refusing to ship a broken page`,
        );
      }
      const html = await res.text();
      const dir = route === "/" ? OUTPUT_DIR : path.join(OUTPUT_DIR, route);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), html, "utf8");
      console.log(`  ${route} -> ${path.relative(process.cwd(), path.join(dir, "index.html"))}`);
    }

    await cp(".output/public", OUTPUT_DIR, { recursive: true });

    // Everything below is written AFTER the cp above, deliberately: fs.cp
    // defaults to force:true, so anything .output/public happens to contain
    // would silently clobber a file written before it. Nothing collides today
    // - the ordering is the invariant, not the current absence of collisions.
    // The prerender server is still alive here; kill() only runs in `finally`.

    const sitemapRoutes = ROUTES.filter((route) => !isExcludedFromSitemap(route));
    await writeFile(path.join(OUTPUT_DIR, "sitemap.xml"), buildSitemap(sitemapRoutes), "utf8");
    console.log(`  sitemap.xml -> ${sitemapRoutes.length} urls`);

    // Capture the app's own branded 404 so Hostinger can serve it via
    // `ErrorDocument 404 /404.html` (see public/.htaccess). Fetched outside
    // the ROUTES loop on purpose - that loop throws on any non-ok status, and
    // here a 404 is exactly the response we want.
    const notFoundRes = await fetch(`http://localhost:${PORT}/__not-found__`);
    const notFoundHtml = await notFoundRes.text();
    // Guard hard: once .htaccess points ErrorDocument at this file, shipping
    // the wrong body replaces every 404 on the live site with it. A 200 here
    // would mean the server started answering unknown paths with an SPA shell,
    // which would silently turn 404.html into a copy of the homepage.
    if (notFoundRes.status !== 404 || !notFoundHtml.includes("Page not found")) {
      throw new Error(
        `Expected HTTP 404 with the branded NotFoundComponent at /__not-found__, got HTTP ` +
          `${notFoundRes.status} (${notFoundHtml.length} bytes). Refusing to ship a 404.html ` +
          `that isn't the real not-found page.`,
      );
    }
    // Apache serves this body with a real 404 status via ErrorDocument, which
    // Google won't index - but the file is ALSO directly reachable at
    // /404.html with a 200, and that copy is thin, duplicate content. The
    // not-found page is rendered by __root.tsx's notFoundComponent rather than
    // a route with its own head(), so there's nowhere upstream to declare this;
    // inject it here instead.
    const notFoundWithNoindex = notFoundHtml.replace(
      "<head>",
      '<head><meta name="robots" content="noindex, nofollow"/>',
    );
    if (notFoundWithNoindex === notFoundHtml) {
      throw new Error("Could not inject noindex into 404.html - no <head> tag found.");
    }
    await writeFile(path.join(OUTPUT_DIR, "404.html"), notFoundWithNoindex, "utf8");
    console.log(`  404.html -> branded not-found page`);

    console.log(`\nStatic site written to ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
  } finally {
    kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
