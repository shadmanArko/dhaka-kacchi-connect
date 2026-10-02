import i18n from "@/lib/i18n";

/**
 * Display formatting for money and delivery dates. These were copy-pasted
 * into five components, which is how the admin order table quietly ended up
 * with a different date format from everything else.
 *
 * Both follow the visitor's language: English keeps "€12.50" and
 * "Saturday, 19 September", German gets "12,50 €" and "Samstag, 19. September".
 * (Admin pages are English-only, so they always see the English form.)
 */

const intlLocale = () => (i18n.language === "de" ? "de-DE" : "en-GB");

/** Money is stored as integer cents everywhere (see worker/src/lib/money.ts);
 * this is the only place that turns it into something a customer reads.
 * English keeps the "€12.50" shape the worker's confirmation emails and
 * Telegram messages use; German uses the local "12,50 €". */
export function formatEuro(cents: number): string {
  if (i18n.language === "de") {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
      cents / 100,
    );
  }
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
    intlLocale(),
    style === "short"
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  );
}
