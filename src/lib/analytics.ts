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
 */
import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
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
}

/** Whether the visitor has made an explicit accept/reject choice yet -
 * drives whether ConsentBanner shows itself. Returns true (nothing to ask)
 * if analytics isn't configured at all. */
export function hasRespondedToConsent(): boolean {
  if (!POSTHOG_KEY) return true;
  return posthog.get_explicit_consent_status() !== "pending";
}

export function giveConsent(): void {
  if (!POSTHOG_KEY) return;
  posthog.opt_in_capturing();
  posthog.startSessionRecording();
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
  posthog.opt_out_capturing();
  // Same reason as giveConsent(): under cookieless_mode "on_reject" this call
  // re-registers an anonymous distinct_id and tears down the pageViewManager,
  // then used to fire a pageview for the new identity.
  trackPageview();
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  posthog.capture(name, properties);
}

export function trackPageview(): void {
  if (!POSTHOG_KEY) return;
  // `title` is the one useful property PostHog's own autocapture attached
  // that a bare capture("$pageview") doesn't - its web-analytics views key
  // off it. Caveat: on a client-side navigation this effect and the one
  // TanStack Router uses to write <title> have no guaranteed order, so an
  // in-app navigation can record the previous page's title. Full page loads
  // are always correct. Don't "fix" that with a setTimeout.
  posthog.capture("$pageview", { title: document.title });
}

export function identifyCustomer(customerId: string): void {
  if (!POSTHOG_KEY) return;
  posthog.identify(customerId);
}

/**
 * Detaches the current browser from the customer who just logged out, without
 * destroying their consent decision.
 *
 * posthog.reset() calls consent.reset() internally, dropping the visitor back
 * to "pending" - which, with opt_out_capturing_by_default, silently downgrades
 * someone who had ACCEPTED to anonymous cookieless capture with session
 * recording stopped, and re-asks them on their next page load. The SDK's own
 * "reset() cleared the stored consent" warning does NOT fire in this config
 * (under cookieless_mode "on_reject" a pending visitor still counts as
 * capturing), so this was completely silent. Read the choice first, re-apply
 * it after.
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

  const consent = posthog.get_explicit_consent_status();

  posthog.reset();

  if (consent === "granted") {
    // captureEventName:false suppresses the $opt_in event - this is a logout,
    // not a new consent decision, and firing $opt_in per logout would corrupt
    // the consent audit trail.
    posthog.opt_in_capturing({ captureEventName: false });
    // disable_session_recording:true at init means opt_in_capturing() rebuilds
    // the recorder but never starts it, exactly as in giveConsent().
    posthog.startSessionRecording();
  } else if (consent === "denied") {
    posthog.opt_out_capturing();
  }
  // "pending" needs nothing: reset() already left it pending, and the banner
  // is still on screen asking.
  //
  // Deliberately no trackPageview() here, unlike giveConsent()/withdrawConsent():
  // a logout is not a page view, and firing one would inflate pageview counts
  // on whatever page the customer logged out from.
}
