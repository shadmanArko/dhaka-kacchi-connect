/**
 * Display helpers for the admin reporting panel. Pure functions, so the awkward
 * cases (a missing count, a one-day-off timezone, a bare URL) are unit-tested
 * rather than discovered on the page.
 */

const INTEGER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

/** "—" for a value the source did not report; never a made-up zero. */
export const MISSING = "—";

export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : INTEGER.format(value);
}

export function decimal(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : DECIMAL.format(value);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : PERCENT.format(value);
}

/** Share of `part` in `whole`; null (not 0%) when there is no whole to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${INTEGER.format(Math.abs(value))}`;
}

/**
 * "2026-10-07" -> "7 Oct". The warehouse sends calendar days with no timezone;
 * parsing them as local midnight would show the previous day for a viewer west
 * of UTC, so they are pinned to noon UTC and formatted in UTC.
 */
export function formatDay(day: string, withYear = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Watch time in the unit that reads naturally: "35 min", "2 h 5 min". */
export function watchTime(minutes: number): string {
  if (minutes < 60) return `${INTEGER.format(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${INTEGER.format(h)} h` : `${INTEGER.format(h)} h ${m} min`;
}

/** The path of a page URL; a non-URL string is returned as it is. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  youtube: "YouTube",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** "3 h ago", "2 d ago" - for how fresh a source is. */
export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Event names are snake_case identifiers; the panel shows them as words. */
export function humanizeEvent(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A change chip for a StatCard: toned by sign, absent when the change is unknown. */
export function changeOf(
  delta: number | null,
  text: string,
): { text: string; tone: "up" | "down" | "flat" } | undefined {
  if (delta === null) return undefined;
  return { text, tone: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}
