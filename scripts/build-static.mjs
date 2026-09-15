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
const ROUTES = [
  "/",
  "/about",
  "/history",
  "/order",
  "/subscribe",
  "/reset-password",
  "/privacy",
  // Admin panel - all three are static/enumerable paths (no dynamic
  // segment). Order detail/discount/status editing is deliberately a
  // panel on /admin driven by a `?order=` search param, not its own
  // /admin/orders/$id route - this static host has no SPA-fallback
  // rewrite configured, so a dynamic path segment can't be reliably
  // deep-linked/hard-refreshed (see routes/admin/_layout.tsx).
  "/admin",
  "/admin/login",
  "/admin/orders/new",
];

const PORT = 4173;
const OUTPUT_DIR = path.resolve("dist-static");

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
    console.log(`\nStatic site written to ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
  } finally {
    kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
