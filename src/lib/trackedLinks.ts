/**
 * Helpers for the admin Link builder form. The SERVER is the authority on what a
 * valid link is (worker/src/lib/trackedLinks.ts) and on the final URL it returns;
 * this file only offers the choices, suggests tidy names and previews the result
 * while the form is being filled in. Its expectations are pinned by a test that
 * uses the same example as the server's test, so the two cannot drift silently.
 */

export type SourceChoice = {
  /** Sent to the server as-is for a fixed place; a prefix ("creator") needs a name. */
  value: string;
  label: string;
  /** True when the person must also type a name (creator-ayesha). */
  named: boolean;
  defaultMedium: MediumValue;
};

export type MediumValue =
  | "organic_social"
  | "story"
  | "bio"
  | "message"
  | "creator"
  | "community"
  | "print"
  | "email";

export const SOURCE_CHOICES: SourceChoice[] = [
  { value: "instagram", label: "Instagram", named: false, defaultMedium: "organic_social" },
  { value: "facebook", label: "Facebook", named: false, defaultMedium: "organic_social" },
  { value: "threads", label: "Threads", named: false, defaultMedium: "organic_social" },
  { value: "youtube", label: "YouTube", named: false, defaultMedium: "organic_social" },
  { value: "whatsapp", label: "WhatsApp", named: false, defaultMedium: "message" },
  { value: "email", label: "Email", named: false, defaultMedium: "email" },
  { value: "creator", label: "A creator", named: true, defaultMedium: "creator" },
  { value: "community", label: "A community or group", named: true, defaultMedium: "community" },
  { value: "qr", label: "A QR code (printed)", named: true, defaultMedium: "print" },
];

export const MEDIUM_CHOICES: { value: MediumValue; label: string }[] = [
  { value: "organic_social", label: "Post or reel" },
  { value: "story", label: "Story" },
  { value: "bio", label: "Profile bio link" },
  { value: "message", label: "Message or broadcast" },
  { value: "creator", label: "Creator's own post" },
  { value: "community", label: "Community or group post" },
  { value: "print", label: "Printed material" },
  { value: "email", label: "Email" },
];

export const DESTINATIONS: { value: string; label: string }[] = [
  { value: "/", label: "Home page" },
  { value: "/order", label: "Order page" },
];

/** "Reel - Kacchi Pot!" -> "reel-kacchi-pot": lowercase words joined by hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** The source value to send: "instagram", or "creator-ayesha" for a named place. */
export function sourceValue(choice: SourceChoice, name: string): string {
  return choice.named ? `${choice.value}-${slugify(name)}` : choice.value;
}

/**
 * The campaign name for the next Saturday batch (the business only delivers on
 * Saturdays): "batch-2026-10-10". `from` is a calendar day (YYYY-MM-DD) in Berlin;
 * a Saturday returns itself, since that batch is the current one.
 */
export function nextBatchCampaign(from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const untilSaturday = (6 - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + untilSaturday);
  return `batch-${date.toISOString().slice(0, 10)}`;
}

/** Today's calendar day in Berlin as YYYY-MM-DD (en-CA formats as ISO). */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type LinkTags = { source: string; medium: string; campaign: string; content: string };

/** A preview of the finished link; the server's answer replaces it once created. */
export function previewUrl(siteUrl: string, tags: LinkTags, destinationPath: string): string {
  const url = new URL(destinationPath, `${siteUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("utm_source", tags.source);
  url.searchParams.set("utm_medium", tags.medium);
  url.searchParams.set("utm_campaign", tags.campaign);
  url.searchParams.set("utm_content", tags.content);
  return url.toString();
}
