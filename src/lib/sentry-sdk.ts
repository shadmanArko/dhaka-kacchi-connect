/**
 * The only module that imports the Sentry SDK on the lazy path. It is loaded
 * with a dynamic import() from lib/sentry.ts (see the LOADING STRATEGY note
 * there) and holds the SDK configuration.
 *
 * Why a separate module rather than `await import("@sentry/react")` inline:
 * a dynamic import of a package returns its whole namespace, so the bundler
 * must keep EVERY export of @sentry/react (feedback, replay, profiling, ...)
 * - measured at ~470 KB raw / ~150 KB gzipped instead of the ~30 KB the app
 * actually uses. Static named imports here let it tree-shake to what is used.
 * Keep this the only place that names the SDK's exports; add a new Sentry
 * call by exporting a wrapper from here, not by importing the package
 * elsewhere.
 */
import { captureException, init, type Breadcrumb } from "@sentry/react";

/** Default fetch/xhr breadcrumbs record the FULL url, query string included.
 * On this app that means /v1/admin/customers/search?identifier=+4917... (a
 * real customer's phone or email) and /v1/postal-code-check?postalCode=...
 * (a partial address) would be attached to every error report.
 * sendDefaultPii:false does not touch query strings - this does. */
function beforeBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "fetch" || crumb.category === "xhr") {
    const url = crumb.data?.url;
    if (typeof url === "string") {
      crumb.data = { ...crumb.data, url: url.split("?")[0] };
    }
  }
  // Console breadcrumbs re-capture whatever was logged, which includes
  // __root.tsx's ErrorComponent console.error(error) and would include any
  // future console.log of a form value. The exception itself carries the
  // stack; the console echo adds only risk.
  if (crumb.category === "console") return null;
  return crumb;
}

export type CaptureHint = Parameters<typeof captureException>[1];

/** Initialises the SDK and returns the capture function. */
export function startSentry(dsn: string): typeof captureException {
  init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "development",
    // Set from the deploy commit SHA in CI, and matched by the source-map
    // upload in vite.config.ts. If the two ever disagree, every stack frame
    // silently stays minified - see the note in that file.
    release: import.meta.env.VITE_SENTRY_RELEASE,
    sendDefaultPii: false,
    beforeBreadcrumb,
    ignoreErrors: [
      // Browser-extension and embedded-webview noise, never this app's code.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Non-Error promise rejection captured/,
      // Specific to this deployment model: the FTP sync replaces hashed
      // chunks under open tabs, so anyone mid-session during a deploy hits
      // this on their next client-side navigation. It's real, but it means
      // "we just deployed", not "there is a bug", and it would drown
      // everything else. Revisit if it ever becomes a support problem.
      /Failed to fetch dynamically imported module/,
      /Importing a module script failed/,
    ],
  });
  return captureException;
}
