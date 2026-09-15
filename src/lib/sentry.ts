/**
 * Frontend error tracking. Deliberately mirrors worker/src/instrument.ts's
 * minimal posture: error tracking, NOT APM. No tracing, no profiling, no
 * session replay.
 *
 * Unlike analytics.ts, this is NOT gated on the cookie banner. Error
 * monitoring runs for everyone, on the reasoning that it is necessary to keep
 * the service working rather than to learn about visitors - and because the
 * errors most worth catching happen before anyone answers the banner, or to
 * the visitors who decline. To keep that defensible the SDK is configured to
 * collect no personal data: sendDefaultPii is off, no replay is loaded, and
 * beforeBreadcrumb below strips the one place PII was still leaking in.
 *
 * Session replay is deliberately absent. PostHog already records sessions,
 * gated on explicit consent; a second recorder running un-consented would
 * undercut that entirely.
 *
 * Same "optional integration degrades gracefully" rule as everything else
 * here - with no DSN set, initSentry() returns before Sentry.init and every
 * Sentry call in the app is an inert no-op, so local dev needs no account.
 */
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

let initialized = false;

/** Default fetch/xhr breadcrumbs record the FULL url, query string included.
 * On this app that means /v1/admin/customers/search?identifier=+4917... (a
 * real customer's phone or email) and /v1/postal-code-check?postalCode=...
 * (a partial address) would be attached to every error report.
 * sendDefaultPii:false does not touch query strings - this does. */
function beforeBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
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

export function initSentry(): void {
  // Guarded on `window`, not deferred to a useEffect. This must run before
  // React renders or hydrates: router.tsx's defaultOnCatch fires from
  // componentDidCatch, which can precede the first effect flush, and
  // captureException on an uninitialised SDK is a silent no-op - so the
  // highest-value errors would be exactly the ones dropped. The window guard
  // is what keeps this out of the Node prerender pass in
  // scripts/build-static.mjs (analytics.ts solves the same constraint with an
  // effect, which is fine there because a pageview has nothing to catch).
  if (initialized || typeof window === "undefined" || !DSN) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
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
}
