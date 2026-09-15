/**
 * Display formatting for money and delivery dates. These were copy-pasted
 * into five components, which is how the admin order table quietly ended up
 * with a different date format from everything else.
 */

/** Money is stored as integer cents everywhere (see worker/src/lib/money.ts);
 * this is the only place that turns it into something a customer reads.
 *
 * Deliberately NOT Intl.NumberFormat("de-DE"), which would render "12,50 €".
 * The whole UI is English, every date already uses en-GB, and the worker's
 * confirmation email and Telegram messages emit this same "€12.50" shape - a
 * frontend-only switch would make the site disagree with its own emails.
 * Revisit as part of a real German-localization decision, not before. */
export function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/**
 * A delivery date ("YYYY-MM-DD") as a human-readable Saturday.
 *
 * Parsed as T12:00:00Z and rendered in UTC on purpose: a bare `new Date("2026-09-19")`
 * is midnight UTC, which in any timezone behind UTC renders as the previous
 * day - i.e. the customer would be told Friday for a Saturday order. Midday
 * is far enough from both boundaries that no timezone can shift the date.
 *
 * `style: "short"` exists because the admin order table is a dense grid where
 * "Saturday, 19 September" would blow out the column - that divergence was
 * already there, just undocumented.
 */
export function formatDate(iso: string, style: "long" | "short" = "long"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(
    "en-GB",
    style === "short"
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  );
}
