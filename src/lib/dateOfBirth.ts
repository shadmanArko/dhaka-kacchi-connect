/**
 * Date-of-birth rules for the sign-up form. The same rules are enforced
 * server-side in worker/src/lib/dateOfBirth.ts - the server is the authority
 * (client checks are only there to give instant, specific feedback), so keep
 * the two in step.
 *
 * Rules: a real calendar date, not in the future, not more than 120 years ago.
 *
 * Errors are translation keys (+ values), not English text, so the German
 * form shows German messages.
 */

export const MAX_AGE_YEARS = 120;

export type DobError = { key: string; values?: Record<string, unknown> };
export type DobErrors = { day?: DobError; month?: DobError; year?: DobError; date?: DobError };

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

  if (!day) errors.day = { key: "auth.dob.dayRequired" };
  else if (!Number.isInteger(d) || d < 1 || d > 31) errors.day = { key: "auth.dob.dayRange" };

  if (!month) errors.month = { key: "auth.dob.monthRequired" };
  else if (!Number.isInteger(m) || m < 1 || m > 12) errors.month = { key: "auth.dob.monthRange" };

  if (!year) errors.year = { key: "auth.dob.yearRequired" };
  else if (year.length !== 4) errors.year = { key: "auth.dob.yearFormat" };
  else if (y > thisYear) errors.year = { key: "auth.dob.future" };
  else if (y < earliestYear)
    errors.year = { key: "auth.dob.tooOld", values: { year: earliestYear } };

  if (errors.day || errors.month || errors.year) return { iso: "", errors };

  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!isRealDate) {
    errors.date = { key: "auth.dob.notReal" };
    return { iso: "", errors };
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) {
    errors.date = { key: "auth.dob.future" };
    return { iso: "", errors };
  }

  return {
    iso: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    errors,
  };
}
