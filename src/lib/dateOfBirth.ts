/**
 * Date-of-birth rules for the sign-up form. The same rules are enforced
 * server-side in worker/src/lib/dateOfBirth.ts - the server is the authority
 * (client checks are only there to give instant, specific feedback), so keep
 * the two in step.
 *
 * Rules: a real calendar date, not in the future, not more than 120 years ago.
 */

export const MAX_AGE_YEARS = 120;

export type DobErrors = { day?: string; month?: string; year?: string; date?: string };

export function validateDateOfBirth(
  day: string,
  month: string,
  year: string,
  today: Date = new Date(),
): { iso: string; errors: DobErrors } {
  const errors: DobErrors = {};
  const thisYear = today.getFullYear();
  const earliestYear = thisYear - MAX_AGE_YEARS;

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (!day) errors.day = "Enter the day.";
  else if (!Number.isInteger(d) || d < 1 || d > 31) errors.day = "Day must be between 1 and 31.";

  if (!month) errors.month = "Enter the month.";
  else if (!Number.isInteger(m) || m < 1 || m > 12)
    errors.month = "Month must be between 1 and 12.";

  if (!year) errors.year = "Enter the year.";
  else if (year.length !== 4) errors.year = "Enter a 4-digit year, e.g. 1990.";
  else if (y > thisYear) errors.year = "Date of birth can't be in the future.";
  else if (y < earliestYear) errors.year = `Year must be ${earliestYear} or later.`;

  if (errors.day || errors.month || errors.year) return { iso: "", errors };

  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!isRealDate) {
    errors.date = "That date doesn't exist. Please check the day and month.";
    return { iso: "", errors };
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) {
    errors.date = "Date of birth can't be in the future.";
    return { iso: "", errors };
  }

  return {
    iso: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    errors,
  };
}
