/**
 * Captures marketing UTM parameters (utm_source/utm_medium/utm_campaign/
 * utm_content/utm_term) from the URL and attaches them to every warehouse
 * event fired afterward - see analytics.ts's trackWarehouseEvent. This is
 * the write-side half of dhaka_kacchi_ai_harness's ARCHITECTURE.md section
 * 4.7 attribution backbone: without this, event.channel_id/campaign_id/
 * campaign_variant_id can never resolve to anything at ingest time, no
 * matter what channel/campaign rows exist in the warehouse.
 *
 * FIRST-TOUCH-PER-SESSION, not lifetime multi-touch: whichever UTM values
 * were present on the FIRST page a visitor's browser tab loaded win for
 * every event in that tab's session (sessionStorage - same lifetime as
 * beaconIdentity.ts's getBeaconSessionId, cleared when the tab closes). A
 * visitor who arrives via an Instagram bio link, browses for 20 minutes,
 * then orders, has that Instagram touch correctly attributed to the
 * eventual purchase. A visitor who returns two days later via a plain
 * bookmark gets a fresh session with no UTM values - correctly
 * unattributed (NULL channel_id/campaign_id/campaign_variant_id at
 * ingest), not incorrectly re-attributed to a two-day-old touch. A real,
 * accepted scope decision, not multi-touch/last-non-direct modeling -
 * revisit if the business ever needs a longer attribution window.
 */

const UTM_KEY = "dhaka-kacchi-utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type UtmParamName = (typeof UTM_PARAMS)[number];
type UtmParams = Partial<Record<UtmParamName, string>>;

/** Reads whatever UTM values were captured for this session, if any. Never
 * throws: storage can be unavailable in private mode, and this sits on the
 * hot path of every tracked event. */
export function getSessionUtm(): UtmParams | null {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as UtmParams) : null;
  } catch {
    return null;
  }
}

/**
 * Call once per app mount. If the URL carries any utm_* param AND this
 * session hasn't already captured one, stores it for the rest of the
 * session. Deliberately does NOT overwrite an existing capture - see the
 * module docstring's first-touch-per-session reasoning: a mid-session
 * internal link or a second campaign click shouldn't steal credit from
 * whatever actually brought this visitor in.
 *
 * Independent of analytics consent on purpose: this only reads the URL and
 * writes sessionStorage, it makes no network call. trackWarehouseEvent's
 * own consent gate is what decides whether the captured values ever leave
 * the browser.
 */
export function captureUtmFromLocation(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(UTM_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const found: UtmParams = {};
    for (const key of UTM_PARAMS) {
      const value = params.get(key);
      if (value) found[key] = value;
    }
    if (Object.keys(found).length > 0) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(found));
    }
  } catch {
    // Storage unavailable (private mode, quota) - this visit is simply
    // unattributed, same as a visitor without JS running at all.
  }
}
