const BERLIN_TZ = "Europe/Berlin";
const DAY_MS = 24 * 60 * 60 * 1000;
const CUTOFF_HOUR = 18; // Friday 18:00 Berlin time

// We only ever compare Berlin wall-clock moments to other Berlin wall-clock
// moments, so we represent them as fake UTC timestamps (via Date.UTC) built
// from the Berlin-local calendar fields. This sidesteps real UTC/DST offset
// math entirely — calendar-day arithmetic is unaffected by DST because
// Berlin's DST transitions happen at 2-3am, never at midnight.
function berlinWallClockFakeMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl can report hour "24" for midnight with hour12:false; normalize to 0.
  const hour = get("hour") % 24;

  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

function toIsoDate(fakeMs: number): string {
  const d = new Date(fakeMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cutoffForSaturday(saturdayFakeMs: number): number {
  const fridayMidnight = saturdayFakeMs - DAY_MS;
  return fridayMidnight + CUTOFF_HOUR * 60 * 60 * 1000;
}

/**
 * Returns the next `count` Saturdays (as "YYYY-MM-DD") that are still
 * orderable — i.e. the Friday-18:00-Berlin cutoff for that Saturday hasn't
 * passed yet, relative to `now`.
 */
export function getAvailableDeliveryDates(now: Date, count = 4): string[] {
  const nowFakeMs = berlinWallClockFakeMs(now);
  const todayFakeMs = Date.UTC(
    new Date(nowFakeMs).getUTCFullYear(),
    new Date(nowFakeMs).getUTCMonth(),
    new Date(nowFakeMs).getUTCDate(),
  );

  const todayWeekday = new Date(todayFakeMs).getUTCDay(); // 0 = Sun ... 6 = Sat
  const daysUntilSaturday = (6 - todayWeekday + 7) % 7;
  const firstSaturdayFakeMs = todayFakeMs + daysUntilSaturday * DAY_MS;

  const valid: string[] = [];
  for (let i = 0; valid.length < count && i < count + 4; i++) {
    const saturdayFakeMs = firstSaturdayFakeMs + i * 7 * DAY_MS;
    if (nowFakeMs < cutoffForSaturday(saturdayFakeMs)) {
      valid.push(toIsoDate(saturdayFakeMs));
    }
  }
  return valid;
}

/**
 * The upcoming Saturday (today, if today already is one) as "YYYY-MM-DD" -
 * NO cutoff filtering, unlike getAvailableDeliveryDates. Used by the weekly
 * digest script (scripts/weeklyDigest.ts), which runs AT the Friday 18:00
 * cutoff and needs the Saturday whose ordering window has just closed, not
 * one still open for new orders.
 */
export function nextSaturday(now: Date): string {
  const nowFakeMs = berlinWallClockFakeMs(now);
  const todayFakeMs = Date.UTC(
    new Date(nowFakeMs).getUTCFullYear(),
    new Date(nowFakeMs).getUTCMonth(),
    new Date(nowFakeMs).getUTCDate(),
  );
  const todayWeekday = new Date(todayFakeMs).getUTCDay();
  const daysUntilSaturday = (6 - todayWeekday + 7) % 7;
  return toIsoDate(todayFakeMs + daysUntilSaturday * DAY_MS);
}

/** Today's date in Berlin, as "YYYY-MM-DD" - same Berlin-wall-clock approach
 * as nextSaturday/getAvailableDeliveryDates, not a naive UTC slice, so a
 * "from today forward" query never has an off-by-one day around midnight. */
export function todayIsoDate(now: Date): string {
  const nowFakeMs = berlinWallClockFakeMs(now);
  const todayFakeMs = Date.UTC(
    new Date(nowFakeMs).getUTCFullYear(),
    new Date(nowFakeMs).getUTCMonth(),
    new Date(nowFakeMs).getUTCDate(),
  );
  return toIsoDate(todayFakeMs);
}

/** Validates that `dateStr` (YYYY-MM-DD) is a Saturday whose order cutoff hasn't passed. */
export function isDeliveryDateStillOrderable(dateStr: string, now: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const [, y, m, d] = match;
  const candidateFakeMs = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const weekday = new Date(candidateFakeMs).getUTCDay();
  if (weekday !== 6) return false; // must be a Saturday

  const nowFakeMs = berlinWallClockFakeMs(now);
  return nowFakeMs < cutoffForSaturday(candidateFakeMs);
}
