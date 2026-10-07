/**
 * Rules for tagged ("tracked") links: the one place that decides what a valid
 * source/medium/campaign/content is and how the final URL is built.
 *
 * WHY THIS IS STRICT: a visit is attributed by exact string match. "Instagram",
 * "instagram" and "insta" are three different sources to the warehouse, so one
 * typo silently splits a post's numbers in two. The link builder therefore offers
 * closed lists and rejects anything else, rather than trusting a person to spell
 * the same word the same way for a year.
 *
 * The tags are read by the site (src/lib/utmCapture.ts) and resolved in the
 * warehouse by `channel.platform = utm_source` plus `campaign_variant.utm_content`
 * (dhaka_kacchi_ai_harness warehouse/ingest/events.py), which is why
 * (source, content) - not the four-tuple - is the unique key: one content value
 * under one source must mean exactly one link.
 */

/** Places a link can live that are one fixed thing. */
export const FIXED_SOURCES = [
  "instagram",
  "facebook",
  "threads",
  "youtube",
  "whatsapp",
  "email",
] as const;

/** Places that are "one of many": creator-ayesha, community-dhaka-berlin, qr-menu-card. */
export const NAMED_SOURCE_PREFIXES = ["creator", "community", "qr"] as const;

export const LINK_MEDIUMS = [
  "organic_social",
  "story",
  "bio",
  "message",
  "creator",
  "community",
  "print",
  "email",
] as const;

export type LinkMedium = (typeof LINK_MEDIUMS)[number];

// Lowercase letters/digits in words joined by - or _ (the existing seeded value
// is "bio_link", so underscore must stay legal).
const WORD = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_WORD = 48;

const PATH = /^\/[a-z0-9\-_/]*$/;
const MAX_PATH = 100;

/** Trim and lowercase - the only normalisation; anything else is rejected, not "fixed". */
export function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidWord(value: string): boolean {
  return value.length >= 2 && value.length <= MAX_WORD && WORD.test(value);
}

export function isValidSource(source: string): boolean {
  if ((FIXED_SOURCES as readonly string[]).includes(source)) return true;
  for (const prefix of NAMED_SOURCE_PREFIXES) {
    if (source.startsWith(`${prefix}-`)) return isValidWord(source.slice(prefix.length + 1));
  }
  return false;
}

export function isValidMedium(medium: string): medium is LinkMedium {
  return (LINK_MEDIUMS as readonly string[]).includes(medium);
}

export function isValidPath(path: string): boolean {
  return path.length <= MAX_PATH && PATH.test(path) && !path.includes("//");
}

export interface LinkTags {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

/** Problems with a set of (already normalised) tags; empty when valid. */
export function validateTags(tags: LinkTags, destinationPath: string): string[] {
  const problems: string[] = [];
  if (!isValidSource(tags.source)) {
    problems.push(
      `source "${tags.source}" is not allowed. Use one of ${FIXED_SOURCES.join(", ")}, or ` +
        `${NAMED_SOURCE_PREFIXES.join("-<name>, ")}-<name> (for example creator-ayesha).`,
    );
  }
  if (!isValidMedium(tags.medium)) {
    problems.push(`medium "${tags.medium}" is not allowed. Use one of ${LINK_MEDIUMS.join(", ")}.`);
  }
  if (!isValidWord(tags.campaign)) {
    problems.push(
      "campaign must be 2-48 lowercase letters/digits joined by - or _ (for example batch-2026-10-10).",
    );
  }
  if (!isValidWord(tags.content)) {
    problems.push(
      "content must be 2-48 lowercase letters/digits joined by - or _ (for example reel-kacchi-pot).",
    );
  }
  if (!isValidPath(destinationPath)) {
    problems.push("destination must be a site path such as / or /order (lowercase, no query).");
  }
  return problems;
}

/** The finished link. Key order is fixed so the same inputs always give the same string. */
export function buildTrackedUrl(siteUrl: string, tags: LinkTags, destinationPath: string): string {
  const url = new URL(destinationPath, `${siteUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("utm_source", tags.source);
  url.searchParams.set("utm_medium", tags.medium);
  url.searchParams.set("utm_campaign", tags.campaign);
  url.searchParams.set("utm_content", tags.content);
  return url.toString();
}

const POST_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.watch",
  "threads.net",
  "threads.com",
  "youtube.com",
  "youtu.be",
];

/**
 * A post URL reduced to the form the warehouse matches against social_post.permalink:
 * https, no "www.", no query or fragment, no trailing slash. KEEP IN SYNC with
 * normalize_post_url() in dhaka_kacchi_ai_harness warehouse/ingest/links.py - both
 * sides are tested against the same cases. Returns null when it is not a link to
 * one of the platforms we track.
 */
export function normalizePostUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|web|mbasic)\./, "");
  if (!POST_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") return null; // a bare profile host is not a post
  return `https://${host}${path}`;
}
