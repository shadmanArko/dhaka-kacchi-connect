import { todayIsoDate } from "./dates";

/**
 * Authoritative date-of-birth check (the sign-up form runs the same rules in
 * src/lib/dateOfBirth.ts for instant feedback, but a browser check can be
 * bypassed, so this one decides). Returns an error message, or null if valid.
 *
 * Rules: strict YYYY-MM-DD, a real calendar date, not in the future (Berlin
 * today), not more than 120 years ago.
 */
export const MAX_AGE_YEARS = 120;

export function dateOfBirthError(value: string, now: Date = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Date of birth must be in YYYY-MM-DD format.";

  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!isRealDate) return "Date of birth is not a real calendar date.";

  const today = todayIsoDate(now);
  if (value > today) return "Date of birth can't be in the future.";

  const earliestYear = Number(today.slice(0, 4)) - MAX_AGE_YEARS;
  if (y < earliestYear) return `Date of birth can't be before ${earliestYear}.`;

  return null;
}
