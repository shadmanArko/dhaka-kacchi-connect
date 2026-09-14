/**
 * Single seam for every PostHog call the app makes - analogous to
 * src/lib/api.ts's "single fetch seam." Every exported function no-ops
 * safely if VITE_POSTHOG_KEY isn't set, so local dev needs zero PostHog
 * account (same "optional integration degrades gracefully" rule
 * worker/src/config.ts already follows for Telegram/BerlinSMS).
 *
 * GDPR/consent model (see ConsentBanner.tsx for the UI):
 *   - Nothing is captured before an explicit choice - initAnalytics() sets
 *     opt_out_capturing_by_default, so the SDK starts fully silent.
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
}

export function withdrawConsent(): void {
  if (!POSTHOG_KEY) return;
  posthog.opt_out_capturing();
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  posthog.capture(name, properties);
}

export function trackPageview(): void {
  if (!POSTHOG_KEY) return;
  posthog.capture("$pageview");
}

export function identifyCustomer(customerId: string): void {
  if (!POSTHOG_KEY) return;
  posthog.identify(customerId);
}

export function resetAnalyticsIdentity(): void {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
