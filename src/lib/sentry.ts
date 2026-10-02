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
 * here - with no DSN set, initSentry() returns before anything is loaded and
 * every call in this file is an inert no-op, so local dev needs no account.
 *
 * LOADING STRATEGY. The SDK is ~32 KB gzipped, which is a lot to put in the
 * entry chunk of a marketing page for something that fires on a tiny
 * fraction of visits. So it is NOT imported statically: initSentry() installs
 * two tiny window listeners ('error', 'unhandledrejection'), schedules the
 * real SDK to load after the page has finished loading and the browser is
 * idle, and buffers whatever goes wrong in the meantime. When the SDK
 * arrives it is initialised with exactly the same config as before, the
 * listeners are removed (the SDK installs its own), and the buffered errors
 * are replayed into it. If an error is buffered before the SDK has started
 * loading, loading starts immediately instead of waiting for idle - errors
 * are rare, so the cost is only ever paid by a visit that actually needs it,
 * and the report is not left to race the tab being closed.
 *
 * What is lost compared with initialising at module scope: breadcrumbs from
 * before the SDK loaded (clicks, fetches in the first second or two). The
 * errors themselves, with stacks, are not lost.
 *
 * Application code must therefore report through captureException() below,
 * not `import * as Sentry from "@sentry/react"` - a static import of the SDK
 * anywhere on the entry path would put it straight back in the entry chunk,
 * and a direct Sentry.captureException() before the SDK is initialised is a
 * silent no-op. (src/pages/OrderPage.tsx still imports the SDK directly; see
 * the note on captureException.) The SDK and its configuration live in
 * ./sentry-sdk.ts, the one module this file lazy-loads.
 */
import type { CaptureHint } from "./sentry-sdk";

const DSN = import.meta.env.VITE_SENTRY_DSN;

type Hint = CaptureHint;
type Pending = { error: unknown; hint?: Hint };
type Capture = (error: unknown, hint?: Hint) => unknown;

/** Enough to keep the first few errors of a bad page load, small enough that
 * a render loop throwing every frame cannot grow memory while the SDK loads.
 * The earliest errors are kept (they are usually the root cause). */
const MAX_BUFFERED = 10;
/** Hard ceiling on how long the SDK load waits for the browser to go idle. */
const IDLE_TIMEOUT_MS = 3000;
/** If the window 'load' event hasn't fired by now (a very slow image), load
 * the SDK anyway rather than waiting on it. */
const LOAD_EVENT_GRACE_MS = 6000;

let state: "idle" | "scheduled" | "loading" | "ready" | "failed" = "idle";
let sdk: Capture | undefined;
const buffer: Pending[] = [];

function push(error: unknown, hint?: Hint): void {
  if (buffer.length < MAX_BUFFERED) buffer.push({ error, hint });
}

/** Report an error. Safe to call at any time, including before the SDK has
 * loaded (the error is buffered and replayed) and with no DSN (no-op).
 *
 * NOTE: src/pages/OrderPage.tsx currently calls Sentry.captureException
 * directly. That works once this module has loaded the SDK (it is the same
 * module instance) but silently drops anything reported before then; it
 * should be switched to this function. */
export function captureException(error: unknown, hint?: Hint): void {
  if (sdk) {
    sdk(error, hint);
    return;
  }
  if (!DSN || typeof window === "undefined" || state === "failed") return;
  push(error, hint);
  // First error before the SDK is on its way: stop waiting for idle.
  if (state === "idle" || state === "scheduled") void loadSdk();
}

// --- early-error listeners -------------------------------------------------

function onWindowError(event: ErrorEvent): void {
  let error: unknown = event.error;
  if (!(error instanceof Error)) {
    // Resource/cross-origin errors arrive as a bare message. The SDK's own
    // handler would build an exception from message + location; do the same,
    // and let ignoreErrors (ResizeObserver noise etc.) filter it as usual.
    const message = event.message || "Unknown error";
    const synthetic = new Error(message);
    synthetic.stack = `Error: ${message}\n    at ${event.filename}:${event.lineno}:${event.colno}`;
    error = synthetic;
  }
  captureException(error, {
    mechanism: { type: "auto.browser.global_handlers.onerror", handled: false },
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  // Non-Error rejections are dropped here. The SDK would wrap them as
  // "Non-Error promise rejection captured ...", which ignoreErrors in
  // loadSdk() already discards - same outcome, without buffering noise.
  if (!(event.reason instanceof Error)) return;
  captureException(event.reason, {
    mechanism: { type: "auto.browser.global_handlers.onunhandledrejection", handled: false },
  });
}

function removeEarlyListeners(): void {
  window.removeEventListener("error", onWindowError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
}

// --- deferred SDK load -----------------------------------------------------

async function loadSdk(): Promise<void> {
  if (!DSN || state === "loading" || state === "ready" || state === "failed") return;
  state = "loading";
  try {
    // The SDK and its configuration (DSN, release, PII scrubbing,
    // ignoreErrors) live in sentry-sdk.ts - a separate module so the bundler
    // can tree-shake the SDK down to the calls we use.
    const { startSentry } = await import("./sentry-sdk");
    const capture = startSentry(DSN);
    sdk = capture;
    state = "ready";
    // The SDK's globalHandlers integration now owns these events; keeping ours
    // would report every subsequent error twice.
    removeEarlyListeners();
    for (const { error, hint } of buffer.splice(0)) capture(error, hint);
  } catch {
    // Offline, blocked by an extension, or a stale chunk after a deploy. Error
    // tracking is best-effort: drop the buffer rather than retry in a loop.
    state = "failed";
    buffer.length = 0;
    removeEarlyListeners();
  }
}

/** Run `fn` once the page has finished loading and the main thread is idle. */
function whenIdle(fn: () => void): void {
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(fn, 1500);
    }
  };
  if (document.readyState === "complete") {
    idle();
    return;
  }
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    idle();
  };
  window.addEventListener("load", start, { once: true });
  setTimeout(start, LOAD_EVENT_GRACE_MS);
}

export function initSentry(): void {
  // Guarded on `window` so this stays out of the Node prerender pass in
  // scripts/build-static.mjs. Called from router.tsx at module scope, before
  // React hydrates: the listeners below must exist before the first thing can
  // go wrong, which is why this is not deferred to a useEffect.
  if (state !== "idle" || typeof window === "undefined" || !DSN) return;
  state = "scheduled";
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  whenIdle(() => void loadSdk());
}
