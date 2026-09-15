import { defineConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// This project was originally scaffolded by Lovable, which supplied this
// entire config via its own `@lovable.dev/vite-tanstack-config` wrapper.
// That wrapper is gone now; this file wires the same plugins by hand.
// Source maps exist ONLY to be uploaded to Sentry and then deleted from the
// build output - they are never deployed, because dist-static/ is FTP'd
// verbatim into a public docroot and shipping maps would publish the source.
// Generation and deletion are gated on this ONE condition so there is no
// reachable state where maps are produced but not cleaned up; deploy-frontend.yml
// additionally hard-fails the job if any .map survives into dist-static/.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT ?? "dhaka-kacchi-frontend";
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN && SENTRY_ORG);

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const plugins: UserConfig["plugins"] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      server: { entry: "server" },
    }),
  ];

  if (command === "build") {
    // Hostinger (the frontend's host) is plain shared hosting - static
    // files only, no Node/edge runtime. Nothing in src/ needs a live server
    // at request time (every data fetch is a client-side call to the
    // separately-deployed worker/ backend), so in principle Nitro's `static`
    // preset (prerendering every route to its own HTML file) is exactly
    // what's wanted. In practice, that preset is broken for TanStack Start
    // in this dependency combo - it either 404s during its own crawl or
    // crashes with "rollupOptions.input should not be an html file when
    // building for SSR" (confirmed as a known, still-open upstream bug:
    // https://github.com/TanStack/router/issues/4369). `node-server` is the
    // one preset that builds cleanly and serves correct, fully-rendered
    // per-route HTML - see scripts/build-static.mjs, which boots this
    // server, fetches each route directly, and saves the HTML as static
    // files. Nothing under this preset ships to Hostinger; it only exists
    // as a build-time intermediate.
    plugins.push(nitro({ preset: "node-server" }));

    if (uploadSourceMaps) {
      plugins.push(
        sentryVitePlugin({
          org: SENTRY_ORG,
          project: SENTRY_PROJECT,
          authToken: SENTRY_AUTH_TOKEN,
          // EU region, matching the DSN (ingest.de.sentry.io) and worker/'s
          // own Sentry project. sentry-cli defaults to the US region and will
          // 401 against an EU org - omitting this is the most likely
          // first-run failure, and it fails by leaving frames minified rather
          // than by erroring loudly.
          url: "https://de.sentry.io/",
          telemetry: false,
          // Must match Sentry.init's `release` in src/lib/sentry.ts exactly.
          // Deliberately NOT letting the plugin auto-detect from git:
          // actions/checkout does a depth-1 clone, and a build/runtime
          // mismatch silently leaves every stack frame minified.
          release: { name: process.env.VITE_SENTRY_RELEASE },
          sourcemaps: {
            // Nitro points the client build's outDir straight at
            // .output/public (nitro/dist/vite.mjs), which is exactly what
            // scripts/build-static.mjs copies into dist-static/.
            assets: [".output/public/assets/**"],
            filesToDeleteAfterUpload: [".output/public/assets/**/*.map"],
          },
        }),
      );
    }
  }

  plugins.push(viteReact());

  return {
    // "hidden", not true: `true` appends a //# sourceMappingURL comment to
    // every chunk, which after filesToDeleteAfterUpload would 404 for any
    // visitor with devtools open and advertise that maps once existed.
    // Sentry resolves frames via injected debug IDs, not that comment.
    build: { sourcemap: uploadSourceMaps ? "hidden" : false },
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
      watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
    },
    plugins,
  };
});
