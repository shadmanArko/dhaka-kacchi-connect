import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import { routeTree } from "./routeTree.gen";
import { initSentry } from "./lib/sentry";

// Module scope, before any component renders - see the comment in
// lib/sentry.ts for why this can't wait for an effect. Called as a named
// export rather than a bare `import "./lib/sentry"` side-effect import
// because package.json declares "sideEffects": false, which licenses Rollup
// to drop a module whose exports are never used.
initSentry();

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // React 19's error boundaries do NOT rethrow to window.onerror, so
    // Sentry's globalHandlers integration never sees an error caught during
    // render or in a route loader - this hook is the only thing that does.
    // (Everything else is already covered by Sentry.init's default
    // integrations: event handlers, async throws, unhandled rejections, and
    // anything outside the router tree. Don't add manual window listeners.)
    //
    // This fires only because __root.tsx defines errorComponent: TanStack
    // mounts a CatchBoundary per match ONLY where an errorComponent exists
    // (Match.js: `routeErrorComponent ? CatchBoundary : SafeFragment`), so
    // every non-root match is unguarded and everything bubbles to the root.
    // Do NOT add defaultErrorComponent to "improve" this - it would mount a
    // boundary on every match and change which UI renders on error.
    defaultOnCatch: (error, errorInfo) => {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    },
  });

  return router;
};
