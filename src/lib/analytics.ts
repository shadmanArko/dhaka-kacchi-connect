/**
 * Single seam for every PostHog call the app makes - analogous to
 * src/lib/api.ts's "single fetch seam." Every exported function no-ops
 * safely if VITE_POSTHOG_KEY isn't set, so local dev needs zero PostHog
 * account (same "optional integration degrades gracefully" rule
 * worker/src/config.ts already follows for Telegram/BerlinSMS).
 *
 * GDPR/consent model (see ConsentBanner.tsx for the UI):
 *   - Before an explicit choice, capture is ANONYMOUS AND COOKIELESS, not
 *     silent. opt_out_capturing_by_default makes a still-pending visitor
 *     count as rejected, and cookieless_mode "on_reject" turns rejection
 *     into un-identifiable capture rather than no capture. So a visitor who
 *     never touches the banner is treated exactly like one who pressed
 *     Reject. (This file previously claimed the SDK "starts fully silent" -
 *     it does not, and the distinction matters for what /privacy says.)
 *   - Reject -> opt_out_capturing() only. Because cookieless_mode is
 *     "on_reject", PostHog itself downgrades this to anonymous,
 *     non-persistent, un-identifiable event capture instead of stopping
 *     entirely - still enough for aggregate funnel/heatmap reports, with
 *     no cookie and no way to link the visitor across days.
 *   - Accept -> opt_in_capturing() AND startSessionRecording(). Session
 *     recording never auto-starts (disable_session_recording: true at
 *     init) and PostHog's own docs describe no automatic link between
 *     cookieless_mode and session recording, so it's wired here
 *     explicitly, gated on full acceptance only.
 *   - identifyCustomer() intentionally sends only the customer id, never
 *     name/email/phone/DOB/address - data minimization: the only reason to
 *     identify at all is linking a returning customer's sessions for
 *     funnel continuity, not building a PII profile inside a third-party
 *     tool.
 *
 * WHY POSTHOG IS LOADED LAZILY, AND WHAT THAT COST
 *
 * `import posthog from "posthog-js"` at module scope put the whole SDK in
 * the entry chunk, because __root.tsx imports this file - so every visitor
 * downloaded and parsed it before the first paint of a page that may never
 * capture anything. It is now a dynamic import, which moves it into its own
 * chunk fetched after the app is interactive.
 *
 * That forced one real design change. `hasRespondedToConsent()` decides
 * whether the cookie banner renders, and it is called synchronously from an
 * effect on mount - it cannot await a chunk without the banner flashing in
 * and out on every load. So THIS MODULE now owns the consent decision in its
 * own localStorage key rather than asking the SDK for it.
 *
 * The behaviour a visitor experiences is unchanged - pending still means
 * anonymous cookieless capture, Accept still opts in and starts recording,
 * Reject still opts out - because the stored decision is re-applied to the
 * SDK as soon as it finishes loading. What changed is only WHERE the
 * decision is remembered, and ours is now the authority: it is written
 * before the SDK is even loaded and re-applied on every init, so the two can
 * no longer silently disagree the way they could when posthog.reset()
 * cleared consent behind our back (see resetAnalyticsIdentity below).
 *
 * The one accepted cost: a visitor who answered the banner BEFORE this
 * change has their choice recorded only inside PostHog, so they are asked
 * once more. Deliberately not worked around - reading PostHog's internal
 * storage format to back-fill would couple us to an undocumented key shape
 * to save a single extra click, one time, for a site that had no meaningful
 * traffic when this shipped.
 */

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/** Distinct from the two session keys and the cart key, same reasoning
 * adminSession.ts documents: one key, one owner, no shared blob. */
const CONSENT_KEY = "dhaka-kacchi-consent";

type ConsentChoice = "granted" | "denied";
type PostHog = typeof import("posthog-js").default;

let posthog: PostHog | null = null;
let loading: Promise<void> | null = null;

/**
 * Calls made before the SDK finishes loading. Bounded because the load can
 * fail permanently (offline, a blocked chunk) and an unbounded queue of
 * every pageview and click for the rest of the visit is a memory leak in
 * the one case nobody is watching. Analytics is the thing that gets dropped
 * when analytics is broken.
 */
const pending: ((ph: PostHog) => void)[] = [];
const MAX_PENDING = 50;

/** Never throws: storage can be unavailable in private mode, and a consent
 * read sits on the render path of every page. */
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
    // Quota or private mode. The in-memory decision below still applies for
    // this page view; the visitor is simply asked again next time.
  }
}

/**
 * Applies the stored decision to a freshly loaded (or just-reset) SDK.
 *
 * Both calls are guarded on the SDK's CURRENT state, and that guard is
 * load-bearing rather than a micro-optimisation: opt_in_capturing() resets
 * the visitor to a fresh cookie-backed identity, so calling it
 * unconditionally on every page load would give a returning visitor a new
 * identity every time and shatter their funnel into single-pageview
 * sessions. It must fire only on a genuine transition.
 *
 * "pending" needs no call at all: opt_out_capturing_by_default already puts
 * the SDK in exactly the state a pending visitor should be in.
 */
function applyConsent(ph: PostHog, choice: ConsentChoice | null): void {
  if (choice === "granted") {
    if (!ph.has_opted_in_capturing()) {
      // captureEventName:false - this is restoring a decision the visitor
      // already made, not a new one. Firing $opt_in on every page load would
      // corrupt the consent audit trail.
      ph.opt_in_capturing({ captureEventName: false });
    }
    // Safe to call repeatedly - PostHog no-ops if recording is already
    // running - and necessary because disable_session_recording:true at init
    // means nothing ever starts it implicitly.
    ph.startSessionRecording();
  } else if (choice === "denied") {
    if (!ph.has_opted_out_capturing()) ph.opt_out_capturing();
  }
}

/** Queues until the SDK is ready, then runs. A no-op when analytics isn't
 * configured, which is the whole of local dev. */
function withPostHog(fn: (ph: PostHog) => void): void {
  if (!POSTHOG_KEY) return;
  if (posthog) {
    fn(posthog);
    return;
  }
  if (pending.length < MAX_PENDING) pending.push(fn);
}

export function initAnalytics(): void {
  if (loading || !POSTHOG_KEY) return;

  // Deliberately fire-and-forget rather than async: every caller is an
  // effect that must not block paint, and the signature stays synchronous
  // so nothing downstream has to become async to use it.
  loading = import("posthog-js")
    .then(({ default: ph }) => {
      ph.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Copy the current dated default from PostHog's own project-creation
        // setup snippet when standing up a new project - this value is
        // versioned by PostHog itself and will drift over time.
        defaults: "2026-05-30",
        // Autocapture is OFF because __root.tsx's Analytics() already fires a
        // manual $pageview per navigation. With `defaults` at 2025-05-24 or
        // later, capture_pageview resolves to "history_change", so leaving it
        // unset double-counted every navigation AND bypassed the deliberate
        // /admin exclusion in Analytics() (autocapture doesn't know about it).
        capture_pageview: false,
        // Required, not optional. capture_pageleave defaults to
        // "if_capture_pageview", whose runtime gate is literally
        //   capture_pageleave === true || ("if_capture_pageview" && !!capture_pageview)
        // so turning the line above off would silently take $pageleave with it -
        // and with it bounce rate and time-on-page.
        capture_pageleave: true,
        capture_heatmaps: true,
        disable_session_recording: true,
        cookieless_mode: "on_reject",
        opt_out_capturing_by_default: true,
      });

      // Before the queue drains, so a queued $pageview lands under the right
      // identity and inside the recording rather than just outside it.
      applyConsent(ph, readConsent());

      posthog = ph;
      for (const fn of pending.splice(0)) fn(ph);
    })
    .catch(() => {
      // The chunk didn't load. Drop the queue and stay silent for the rest
      // of the visit - analytics must never take the page down with it.
      pending.length = 0;
    });
}

/** Whether the visitor has made an explicit accept/reject choice yet -
 * drives whether ConsentBanner shows itself. Returns true (nothing to ask)
 * if analytics isn't configured at all.
 *
 * Synchronous on purpose: see the header. It reads our own key, never the
 * SDK, so it answers correctly before PostHog has loaded. */
export function hasRespondedToConsent(): boolean {
  if (!POSTHOG_KEY) return true;
  return readConsent() !== null;
}

export function giveConsent(): void {
  if (!POSTHOG_KEY) return;
  // Written first, and synchronously: if the SDK is still in flight, this is
  // what applyConsent() will find when it lands, and what survives a reload
  // the visitor triggers a moment later.
  writeConsent("granted");
  withPostHog((ph) => {
    ph.opt_in_capturing();
    ph.startSessionRecording();
  });
  // opt_in_capturing() internally resets to a fresh, cookie-backed identity,
  // and it used to fire that new identity's first $pageview itself - but only
  // when config.capture_pageview is truthy, which it no longer is. Without
  // this the accepting visitor's identity starts with zero pageviews until
  // their next navigation, losing funnel entry attribution. Ordered last so
  // the pageview lands on the new identity and inside the recording.
  trackPageview();
}

export function withdrawConsent(): void {
  if (!POSTHOG_KEY) return;
  writeConsent("denied");
  withPostHog((ph) => ph.opt_out_capturing());
  // Same reason as giveConsent(): under cookieless_mode "on_reject" this call
  // re-registers an anonymous distinct_id and tears down the pageViewManager,
  // then used to fire a pageview for the new identity.
  trackPageview();
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.capture(name, properties));
}

export function trackPageview(): void {
  // `title` is read HERE rather than inside the queued callback, so a
  // pageview queued during load records the page it actually happened on
  // instead of whatever the visitor navigated to while the chunk was in
  // flight.
  //
  // `title` is the one useful property PostHog's own autocapture attached
  // that a bare capture("$pageview") doesn't - its web-analytics views key
  // off it. Caveat: on a client-side navigation this effect and the one
  // TanStack Router uses to write <title> have no guaranteed order, so an
  // in-app navigation can record the previous page's title. Full page loads
  // are always correct. Don't "fix" that with a setTimeout.
  const title = typeof document === "undefined" ? undefined : document.title;
  withPostHog((ph) => ph.capture("$pageview", { title }));
}

export function identifyCustomer(customerId: string): void {
  withPostHog((ph) => ph.identify(customerId));
}

/**
 * Detaches the current browser from the customer who just logged out, without
 * destroying their consent decision.
 *
 * posthog.reset() calls consent.reset() internally, dropping the SDK back to
 * "pending" - which, with opt_out_capturing_by_default, silently downgrades
 * someone who had ACCEPTED to anonymous cookieless capture with session
 * recording stopped. The SDK's own "reset() cleared the stored consent"
 * warning does NOT fire in this config (under cookieless_mode "on_reject" a
 * pending visitor still counts as capturing), so this was completely silent.
 *
 * Since the decision now lives in our own key, reset() can no longer destroy
 * it - but it still resets the SDK's in-memory consent, so it must still be
 * re-applied here. Re-read and re-apply, exactly as before.
 *
 * Two alternatives were considered and are both wrong here:
 *   - Not resetting at all leaves the ex-customer's distinct_id and
 *     $user_state:"identified" on the device, so the next person to use it -
 *     or the same browser logged out - is attributed to them.
 *   - identify(someRandomId) mints a bogus *identified* person on every
 *     logout; after a real login $user_state is already "identified", so
 *     identify() takes neither of its merge branches.
 */
export function resetAnalyticsIdentity(): void {
  if (!POSTHOG_KEY) return;

  const choice = readConsent();

  withPostHog((ph) => {
    ph.reset();
    // captureEventName:false suppresses the $opt_in event - this is a logout,
    // not a new consent decision, and firing $opt_in per logout would corrupt
    // the consent audit trail. disable_session_recording:true at init means
    // opt_in_capturing() rebuilds the recorder but never starts it, which is
    // why applyConsent starts it explicitly.
    applyConsent(ph, choice);
  });

  // "pending" needs nothing: reset() already left it pending, and the banner
  // is still on screen asking.
  //
  // Deliberately no trackPageview() here, unlike giveConsent()/withdrawConsent():
  // a logout is not a page view, and firing one would inflate pageview counts
  // on whatever page the customer logged out from.
}
