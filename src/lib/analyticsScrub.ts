/**
 * Strips secrets and identifiers out of PostHog events BEFORE they leave the
 * browser. Wired in as PostHog's `before_send` hook (see initAnalytics).
 *
 * WHY THIS EXISTS. PostHog records the full page URL on every event, and some
 * of this site's URLs carry things that must never be stored by a third party:
 *
 *   /reset-password?token=...   the secret from a password-reset email
 *   /orders?order=ord_...       one specific order's id
 *   ?fbclid=... / ?gclid=...    an ad network's per-click identifier
 *
 * Found in production on 2026-10-07: 15 events held a live reset token, 88 an
 * order id, 71 a Facebook click id. Anyone with PostHog access could read an
 * unexpired token and take over that account.
 *
 * AN ALLOWLIST, NOT A DENYLIST. Only the UTM parameters survive. A denylist
 * ("remove `token`") fails the day someone adds `?code=` or `?key=` to a new
 * link; an allowlist fails safe, losing a harmless parameter instead of
 * leaking a secret. The fragment (#...) goes too, since SPAs sometimes carry
 * state or tokens there. The UTM keys are kept because they are the whole point
 * of attribution (utmCapture.ts) and are marketing labels, not identifiers.
 *
 * WHAT IT DOES NOT COVER, honestly: it rewrites URL-shaped properties on the
 * event, on its person-property blobs, on autocapture element links, and the
 * page address recorded in session-replay metadata. It does not inspect free
 * text a developer puts in a custom event property, so don't put a URL, token
 * or order id there.
 */

/** The only query parameters allowed to reach PostHog. */
const KEEP_PARAMS: ReadonlySet<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

/** Property names that hold a URL: $current_url, $referrer, $initial_referrer,
 * $session_entry_url, attr__href ... Matched by suffix rather than listed, so a
 * URL property PostHog adds in a later SDK version is covered without an edit
 * here. A false positive costs nothing: a non-URL string passes through
 * scrubUrl unchanged. */
const URL_KEY = /(url|referrer|href)$/i;

/** Ad-network click identifiers. PostHog's "campaign params" feature lifts these
 * out of the URL into event properties NAMED AFTER the parameter (`fbclid`,
 * `$initial_fbclid`, ...) - so removing them from the URL, as scrubUrl does, is
 * not enough: the same id is still sent as a property. Found by capturing the
 * SDK's real traffic. The list is PostHog's own campaign-parameter list minus
 * the UTM keys, which are deliberately kept. Matched with an optional
 * `$initial_` prefix. A real click id is a per-click identifier that ad
 * networks can join back to a person, which is exactly what must not leave.
 *
 * MATCHED BY THE END OF THE NAME, not by a list of prefixes. PostHog derives
 * variants such as `$initial_fbclid` and `$session_entry_fbclid` (the click id of
 * the visit's landing page), and a prefix list missed the second one: it reached
 * production on 2026-10-07 and was caught by asking PostHog what the live site
 * had actually sent. Suffix matching also covers a variant not yet invented.
 *
 * `fbc` / `fbp` are Facebook's cookies, which PostHog copies into person
 * properties as `$fbc` / `$fbp`. `$fbc` was observed carrying the click id
 * inside its value ("fb.1.<time>.<fbclid>"); `$fbp` is Facebook's persistent
 * browser id - same family, not observed, dropped for the same reason. The
 * optional `$` prefix is why the pattern allows `$` as well as `$initial_`. */
const CLICK_ID_KEY =
  /(?:^|[$_])(gclid|gad_source|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|twclid|li_fat_id|mc_cid|igshid|ttclid|rdt_cid|epik|qclid|sccid|kx|irclid|fbc|fbp)$/i;

/** Returns `raw` with every query parameter outside the allowlist removed, plus
 * any #fragment and any user:password@ part. Anything that is not a string, or
 * is PostHog's own "$direct" marker, comes back untouched. */
export function scrubUrl(raw: unknown): unknown {
  if (typeof raw !== "string" || raw === "" || raw === "$direct") return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not an absolute URL (a relative href, or garbage). Without a parser the
    // safe move is to cut at the first ? or # - losing a harmless suffix is
    // better than guessing which part is secret.
    return raw.split(/[?#]/, 1)[0];
  }

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEEP_PARAMS.has(key.toLowerCase())) kept.append(key, value);
  }
  url.search = kept.toString();
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.toString();
}

type Bag = Record<string, unknown>;

function scrubBag(bag: Bag): Bag {
  const out: Bag = {};
  for (const [key, value] of Object.entries(bag)) {
    if (CLICK_ID_KEY.test(key)) continue; // dropped entirely, not blanked
    if (URL_KEY.test(key)) out[key] = scrubUrl(value);
    else if (key === "$elements" && Array.isArray(value)) out[key] = value.map(scrubElement);
    else if ((key === "$set" || key === "$set_once") && isBag(value)) out[key] = scrubBag(value);
    else out[key] = value;
  }
  return out;
}

function isBag(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An autocapture element: its link target can carry the same secrets. */
function scrubElement(element: unknown): unknown {
  return isBag(element) ? scrubBag(element) : element;
}

/**
 * Session replay records the page address inside an rrweb "Meta" event
 * (type 4, data.href). Best effort: how the SDK packages and compresses
 * snapshot data differs between versions, so this rewrites only the shape it
 * recognises and leaves everything else alone rather than corrupt a recording.
 */
function scrubSnapshot(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((item) => {
    if (isBag(item) && item.type === 4 && isBag(item.data) && "href" in item.data) {
      return { ...item, data: { ...item.data, href: scrubUrl(item.data.href) } };
    }
    return item;
  });
}

/** The parts of a PostHog event this touches. Deliberately NOT given an index
 * signature: PostHog's own CaptureResult has none, and adding one here would
 * make this function unassignable to its `before_send` option. */
export type Scrubbable = {
  event?: string;
  properties?: Bag;
  $set?: Bag;
  $set_once?: Bag;
};

/** PostHog's `before_send`: returns a scrubbed COPY (the input is not mutated),
 * or null if given null - which PostHog treats as "drop this event". */
export function scrubEvent<T extends Scrubbable | null>(event: T): T {
  if (event === null || event === undefined) return event;

  const out: Scrubbable = { ...event };
  if (isBag(event.properties)) {
    const props = scrubBag(event.properties);
    if ("$snapshot_data" in props) props.$snapshot_data = scrubSnapshot(props.$snapshot_data);
    out.properties = props;
  }
  if (isBag(event.$set)) out.$set = scrubBag(event.$set);
  if (isBag(event.$set_once)) out.$set_once = scrubBag(event.$set_once);
  return out as T;
}
