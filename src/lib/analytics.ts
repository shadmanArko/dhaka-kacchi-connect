/**
 * Single seam for every analytics call the app makes: PostHog, and the
 * first-party event beacon that feeds the warehouse (POST /v1/events).
 * Every PostHog function no-ops safely if VITE_POSTHOG_KEY isn't set, so local
 * dev needs no PostHog account.
 *
 * OWNER DECISION (2026-10): collection does NOT depend on the cookie banner.
 * PostHog (persistent identity, heatmaps, session recording) and the
 * first-party beacon run for every visitor, whatever they click. The banner
 * and the stored choice still exist, but they only decide whether the banner
 * is shown - they never switch collection on or off. Legal responsibility for
 * this sits with the business owner.
 *
 * Two deliberate exclusions remain:
 *   - A device that opened any page with ?internal=1 sends nothing
 *     (?internal=0 turns it back on). Per browser, stored in localStorage.
 *   - Nothing is sent while the owner is inside /admin.
 *
 * identifyCustomer() sends only the customer id - never name, email, phone,
 * date of birth or address - to keep personal data out of the third-party tool.
 *
 * Every event is passed through scrubEvent (analyticsScrub.ts) before it
 * leaves the browser: PostHog records the full page URL, and ours carry a
 * password-reset token (/reset-password?token=), order ids (/orders?order=) and
 * ad-click ids. Only UTM parameters survive. Without this, anyone with PostHog
 * access could read a live reset token.
 *
 * PostHog is loaded lazily (dynamic import) so its ~90 KB chunk is fetched
 * after the app is interactive instead of delaying first paint. Calls made
 * before it arrives are queued (bounded) and replayed once it has loaded.
 */

import { api, type WarehouseEventName } from "./api";
import { scrubEvent } from "./analyticsScrub";
import { getAnonymousId, getBeaconSessionId } from "./beaconIdentity";
import { getSessionUtm } from "./utmCapture";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/** The banner choice. Own key, same reasoning as the session and cart keys:
 * one key, one owner, no shared blob. */
const CONSENT_KEY = "dhaka-kacchi-consent";

/** Set by visiting any page with ?internal=1; cleared by ?internal=0. */
const INTERNAL_KEY = "dhaka-kacchi-internal";

type ConsentChoice = "granted" | "denied";
type PostHog = typeof import("posthog-js").default;

let posthog: PostHog | null = null;
let loading: Promise<void> | null = null;

/** True while the owner is inside /admin. Nothing is captured until they leave. */
let adminPaused = false;

/**
 * Calls made before the SDK finishes loading. Bounded because the load can
 * fail permanently (offline, a blocked chunk) and an unbounded queue of every
 * pageview and click for the rest of the visit would be a memory leak in the
 * one case nobody is watching.
 */
const pending: ((ph: PostHog) => void)[] = [];
const MAX_PENDING = 50;

// --- Storage helpers (never throw: storage can be unavailable in private mode)

function isInternalDevice(): boolean {
  try {
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Reads ?internal=1|0 from the URL and persists it. Call before initAnalytics(). */
export function captureInternalFlag(): void {
  try {
    const flag = new URLSearchParams(window.location.search).get("internal");
    if (flag === "1") localStorage.setItem(INTERNAL_KEY, "1");
    else if (flag === "0") localStorage.removeItem(INTERNAL_KEY);
  } catch {
    // Storage unavailable - the device simply isn't excluded.
  }
}

function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    return null;
  }
}

function writeConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Quota or private mode: the visitor is simply asked again next time.
  }
}

// --- PostHog plumbing

/**
 * Makes sure PostHog is capturing and recording. A visitor who pressed Reject
 * before collection stopped depending on the banner still has an opt-out
 * stored by PostHog itself, so clear it (captureEventName:false - this is not
 * a consent event). Guarded: opt_in_capturing() resets the visitor to a fresh
 * identity, so it must only run on a genuine transition, never on every call.
 * startSessionRecording() is idempotent, and needed because
 * disable_session_recording:true at init means nothing starts it implicitly.
 */
function ensureCapturing(ph: PostHog): void {
  if (ph.has_opted_out_capturing()) ph.opt_in_capturing({ captureEventName: false });
  ph.startSessionRecording();
}

/** Queues until the SDK is ready, then runs. A no-op when analytics isn't
 * configured (all of local dev), on an excluded device, or inside /admin. */
function withPostHog(fn: (ph: PostHog) => void): void {
  if (!POSTHOG_KEY || isInternalDevice() || adminPaused) return;
  if (posthog) {
    fn(posthog);
    return;
  }
  if (pending.length < MAX_PENDING) pending.push(fn);
}

export function initAnalytics(): void {
  if (loading || !POSTHOG_KEY || isInternalDevice()) return;

  // Fire-and-forget: every caller is an effect that must not block paint.
  loading = import("posthog-js")
    .then(({ default: ph }) => {
      ph.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Copy the current dated default from PostHog's own project-creation
        // snippet when standing up a new project; PostHog versions it.
        defaults: "2026-05-30",
        // __root.tsx's Analytics() fires a manual $pageview per navigation, so
        // the SDK's own pageview capture stays off (it would double-count).
        capture_pageview: false,
        // Must be explicit: its default ("if_capture_pageview") would turn
        // $pageleave off together with the line above, and with it bounce
        // rate and time-on-page.
        capture_pageleave: true,
        capture_heatmaps: true,
        // Recording is started explicitly (ensureCapturing) so the /admin
        // pause can stop and restart it.
        disable_session_recording: true,
        opt_out_capturing_by_default: false,
        // Runs on EVERY event (pageviews, clicks, custom events, replay
        // metadata) before it is sent. See analyticsScrub.ts for why; a test
        // fails if this line is ever removed.
        before_send: scrubEvent,
        // The site uses no feature flags, surveys or experiments, and this is
        // the one PostHog request before_send cannot reach: the flag lookup
        // posts the visitor's FULL current URL (reset token and all) as
        // "person properties". Found by capturing the SDK's real traffic.
        // Switching it off removes that leak and saves a request per page load.
        // If flags are ever adopted, scrub that payload first.
        advanced_disable_feature_flags: true,
      });

      // Before the queue drains, so a queued $pageview lands inside the
      // recording rather than just outside it.
      ensureCapturing(ph);

      posthog = ph;
      syncAdminPause(ph);
      for (const fn of pending.splice(0)) fn(ph);
    })
    .catch(() => {
      // The chunk didn't load. Drop the queue and stay silent for the rest of
      // the visit - analytics must never take the page down with it.
      pending.length = 0;
    });
}

// --- Banner

/** Whether the visitor has pressed Accept or Reject yet - drives whether
 * ConsentBanner shows itself. Returns true (nothing to ask) if analytics isn't
 * configured at all. Synchronous on purpose: it reads our own key, never the
 * SDK, so it answers correctly before PostHog has loaded. */
export function hasRespondedToConsent(): boolean {
  if (!POSTHOG_KEY) return true;
  return readConsent() !== null;
}

/** Remembers Accept (hides the banner). Does not affect collection. */
export function giveConsent(): void {
  writeConsent("granted");
}

/** Remembers Reject (hides the banner). Does not affect collection. */
export function withdrawConsent(): void {
  writeConsent("denied");
}

// --- /admin pause

/**
 * Silences everything PostHog does on its own while the owner is in /admin:
 * pageleave, heatmaps, autocapture and - the important one - session
 * recording, which would otherwise film the admin panel. Restored when they
 * navigate back to the public site.
 */
export function setAdminMode(inAdmin: boolean): void {
  adminPaused = inAdmin;
  if (posthog) syncAdminPause(posthog);
}

let configBeforeAdmin: { autocapture: unknown } | null = null;

/** Brings the SDK's own background capture in line with `adminPaused`. Also
 * called right after init, so a page load that lands directly on /admin is
 * silenced before ensureCapturing's recording can matter. */
function syncAdminPause(ph: PostHog): void {
  if (adminPaused) {
    configBeforeAdmin ??= { autocapture: ph.config.autocapture };
    ph.stopSessionRecording();
    ph.set_config({ capture_pageleave: false, capture_heatmaps: false, autocapture: false });
  } else if (configBeforeAdmin) {
    ph.set_config({
      capture_pageleave: true,
      capture_heatmaps: true,
      autocapture: configBeforeAdmin.autocapture as boolean,
    });
    configBeforeAdmin = null;
    ph.startSessionRecording();
  }
}

// --- Events

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.capture(name, properties));
}

/**
 * Fires a first-party event to the warehouse's POST /v1/events - a separate
 * pipe from PostHog, with its own identity (beaconIdentity.ts) and its own
 * fixed vocabulary (WarehouseEventName). Sent for every visitor; only an
 * excluded device or the /admin panel is skipped.
 *
 * Fire-and-forget: analytics must never surface an error to the UI, block a
 * caller, or throw. Call sites that also call trackEvent() (PostHog) should
 * call this too, but the two are independent - one failing must never affect
 * the other.
 *
 * Every call carries this session's captured UTM values (see utmCapture.ts),
 * not just page_view: a purchase minutes into the same session still carries
 * the touch that brought the visitor in, which is what lets the warehouse
 * attribute it to a channel and campaign. Caller-supplied properties win on a
 * key collision (spread last).
 */
export function trackWarehouseEvent(
  eventName: WarehouseEventName,
  properties?: Record<string, unknown>,
  orderId?: string,
): void {
  if (isInternalDevice() || adminPaused) return;
  const utm = getSessionUtm();
  api
    .trackEvent({
      eventName,
      anonymousId: getAnonymousId() ?? undefined,
      sessionId: getBeaconSessionId() ?? undefined,
      orderId,
      properties: utm ? { ...utm, ...properties } : properties,
    })
    .catch(() => {
      // Nowhere for this to go; analytics failures are silent by design.
    });
}

export function trackPageview(): void {
  // `title` is read HERE rather than inside the queued callback, so a pageview
  // queued during load records the page it actually happened on instead of
  // whatever the visitor navigated to while the chunk was in flight.
  // Caveat: on a client-side navigation this effect and the one TanStack
  // Router uses to write <title> have no guaranteed order, so an in-app
  // navigation can record the previous page's title. Full page loads are
  // always correct. Don't "fix" that with a setTimeout.
  const title = typeof document === "undefined" ? undefined : document.title;
  withPostHog((ph) => ph.capture("$pageview", { title }));
}

export function identifyCustomer(customerId: string): void {
  withPostHog((ph) => ph.identify(customerId));
}

/**
 * Detaches the current browser from the customer who just logged out.
 *
 * posthog.reset() clears the identified user and the stored opt-in state, so
 * capture and recording are re-established right after. Two alternatives are
 * both wrong:
 *   - Not resetting leaves the ex-customer's distinct_id on the device, so the
 *     next person to use it is attributed to them.
 *   - identify(someRandomId) mints a bogus *identified* person on every logout.
 *
 * Deliberately no trackPageview(): a logout is not a page view, and firing one
 * would inflate pageview counts on whatever page the customer logged out from.
 */
export function resetAnalyticsIdentity(): void {
  if (!POSTHOG_KEY) return;
  withPostHog((ph) => {
    ph.reset();
    ensureCapturing(ph);
  });
}
