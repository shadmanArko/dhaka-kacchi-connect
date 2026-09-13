import { defineConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// This project was originally scaffolded by Lovable, which supplied this
// entire config via its own `@lovable.dev/vite-tanstack-config` wrapper.
// That wrapper is gone now; this file wires the same plugins by hand.
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
  }

  plugins.push(viteReact());

  return {
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
