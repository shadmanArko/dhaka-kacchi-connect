import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { captureException, initSentry } from "./lib/sentry";

// Module scope, before any component renders - see the comment in
// lib/sentry.ts for why this can't wait for an effect. That call only
// installs two tiny error listeners and schedules the SDK to load when the
// page is idle; the SDK itself is not in this chunk. Called as a named
// export rather than a bare `import "./lib/sentry"` side-effect import
// because package.json declares "sideEffects": false, which licenses Rollup
// to drop a module whose exports are never used.
initSentry();

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // React 19's error boundaries do NOT rethrow to window.onerror, so
    // Sentry's globalHandlers integration never sees an error caught during
    // render or in a route loader - this hook is the only thing that does.
    // (Everything else is already covered by the SDK's default integrations
    // - event handlers, async throws, unhandled rejections, anything outside
    // the router tree - and, before the SDK has loaded, by the buffering
    // listeners in lib/sentry.ts. Don't add more window listeners here.)
    //
    // Goes through lib/sentry's captureException, not the SDK directly, so an
    // error that happens before the (deferred) SDK has loaded is buffered
    // rather than dropped.
    //
    // This fires only because __root.tsx defines errorComponent: TanStack
    // mounts a CatchBoundary per match ONLY where an errorComponent exists
    // (Match.js: `routeErrorComponent ? CatchBoundary : SafeFragment`), so
    // every non-root match is unguarded and everything bubbles to the root.
    // Do NOT add defaultErrorComponent to "improve" this - it would mount a
    // boundary on every match and change which UI renders on error.
    defaultOnCatch: (error, errorInfo) => {
      captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    },
  });

  return router;
};
