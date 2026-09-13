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
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Every route this app has. There's no automatic discovery (that's exactly
// the broken feature this script works around) - add a new entry here
// whenever a new route is added under src/routes/.
const ROUTES = ["/", "/about", "/history", "/order", "/subscribe", "/reset-password"];

const PORT = 4173;
const OUTPUT_DIR = path.resolve("dist-static");

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
