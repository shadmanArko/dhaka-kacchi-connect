import type { Pool } from "pg";

/**
 * Read-only analytics for the admin reporting page: follower counts, website
 * traffic (PostHog, scrubbed), Google Search Console and YouTube Analytics -
 * all read from the sibling dhaka_kacchi_ai_harness warehouse through the same
 * structurally read-only `warehouse_reader` connection as reportingRepository.ts.
 *
 * WHAT EACH NUMBER IS, because the tables are subtler than their names:
 *
 *  - FOLLOWERS are a level read once a night, not a daily flow, and cannot be
 *    backfilled: a day the job missed is simply absent. A YouTube count can be
 *    NULL (the channel hides it), which is "not reported", never zero.
 *  - WEBSITE figures come from PostHog events the warehouse scrubbed on the way
 *    in. Days are Berlin calendar days. `visitors` is distinct pseudonymous ids
 *    PER DAY: a cookieless visitor's id rotates daily, so visitors must never be
 *    summed across days - only sessions and pageviews are totalled here. Summing
 *    the per-locale rows of one day is exact today (the site is one language);
 *    once locales go live a person reading /de and /en pages the same day would
 *    count twice in `visitors`, so revisit then.
 *  - SEARCH totals come ONLY from search_site_daily. The page and query tables
 *    omit every row Google considers too small or anonymized to publish (about a
 *    third of impressions on this site), so they say WHICH pages and searches,
 *    never HOW MANY. Google's final data trails ~2 days: the newest days are
 *    absent, not zero.
 *  - YOUTUBE Analytics uses YouTube's own reporting day and trails ~3 days.
 *
 * Every section is read independently and reports `unavailable` on failure, so
 * one table that does not exist yet (the harness migrations ship separately from
 * this worker) cannot take the rest of the page down.
 */

export const ANALYTICS_RANGES = [7, 28, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export type Section<T> = { status: "ok"; data: T } | { status: "unavailable" };

export interface FollowerPlatform {
  platform: string;
  /** Latest count; null = the platform did not report one (e.g. hidden). */
  current: number | null;
  currentAt: string;
  /** Change since the first reading inside the window; null with <2 readings. */
  change: number | null;
  /** The earliest reading in the window (the baseline for `change`). */
  since: string;
  history: { day: string; followers: number | null }[];
}

export interface DayPoint {
  day: string;
  pageviews: number;
  sessions: number;
  visitors: number;
}

export interface WebAnalytics {
  daily: DayPoint[];
  totals: { pageviews: number; sessions: number; avgVisitorsPerDay: number };
  topPages: { path: string; pageviews: number; sessions: number }[];
  sources: { source: string; medium: string; campaign: string; sessions: number }[];
  actions: { eventName: string; events: number; sessions: number }[];
  dataThrough: string | null;
  builtAt: string | null;
  isStale: boolean;
}

export interface SearchDayPoint {
  day: string;
  clicks: number;
  impressions: number;
}

export interface SearchRow {
  label: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average ranking (1 = top). */
  position: number | null;
}

export interface SearchTotals {
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface SearchAnalytics {
  web: { daily: SearchDayPoint[]; totals: SearchTotals };
  image: { totals: SearchTotals };
  topQueries: SearchRow[];
  topPages: SearchRow[];
  /** Share of the site's web impressions that the page table accounts for. */
  pageCoverage: number | null;
  dataThrough: string | null;
  fetchedAt: string | null;
}

export interface YoutubeDayPoint {
  day: string;
  views: number;
  watchMinutes: number;
}

export interface YoutubeAnalytics {
  daily: YoutubeDayPoint[];
  totals: {
    views: number;
    watchMinutes: number;
    subscribersGained: number;
    subscribersLost: number;
  };
  dataThrough: string | null;
  fetchedAt: string | null;
}

export interface AnalyticsResult {
  days: AnalyticsRange;
  from: string;
  to: string;
  followers: Section<FollowerPlatform[]>;
  web: Section<WebAnalytics>;
  search: Section<SearchAnalytics>;
  youtube: Section<YoutubeAnalytics>;
}

export interface AnalyticsRepository {
  getAnalytics(days: AnalyticsRange): Promise<AnalyticsResult>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in analyticsRepository.test.ts)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number): string {
  return toIso(toUtcMs(iso) + delta * DAY_MS);
}

/** The inclusive Berlin-day window ending on `today`, `days` long. */
export function windowFor(today: string, days: number): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today };
}

/**
 * Fills the gaps INSIDE [from, to] with `zero(day)` so a chart's x axis is
 * continuous. Only ever call this for a range the source covers: a day absent
 * from a source's covered range is a real zero (these APIs omit empty days),
 * but a day beyond the source's last fetch is "not known yet" and must be left
 * off, which is why callers pass the covered range, not the requested one.
 */
export function fillDays<T extends { day: string }>(
  rows: T[],
  from: string,
  to: string,
  zero: (day: string) => T,
): T[] {
  if (from > to) return [];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: T[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(byDay.get(d) ?? zero(d));
  return out;
}

/** The range a source covers: from its first row (or the window start) to its last. */
export function coveredRange(
  firstDay: string | null,
  lastDay: string | null,
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (!firstDay || !lastDay) return null;
  const start = firstDay > from ? firstDay : from;
  const end = lastDay < to ? lastDay : to;
  return start > end ? null : { from: start, to: end };
}

/** Impression-weighted mean position; positions are averages, never summed. */
export function weightedPosition(rows: { impressions: number; position: number }[]): number | null {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  if (impressions === 0) return null;
  return rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions;
}

export function followerTrend(
  platform: string,
  readings: { day: string; followers: number | null; fetchedAt: string }[],
): FollowerPlatform | null {
  const sorted = [...readings].sort((a, b) => a.day.localeCompare(b.day));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  if (!latest || !first) return null;
  const comparable = sorted.length >= 2 && latest.followers !== null && first.followers !== null;
  return {
    platform,
    current: latest.followers,
    currentAt: latest.fetchedAt,
    change: comparable ? latest.followers! - first.followers! : null,
    since: first.day,
    history: sorted.map((r) => ({ day: r.day, followers: r.followers })),
  };
}

/** Stale = the nightly build is more than 36h old (one missed run plus slack). */
export function isStale(builtAt: string | null, now: Date): boolean {
  if (!builtAt) return true;
  return now.getTime() - new Date(builtAt).getTime() > 36 * 3_600_000;
}

const n = (v: string | number | null | undefined): number => Number(v ?? 0);
const nOrNull = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

// ---------------------------------------------------------------------------
// Postgres implementation
// ---------------------------------------------------------------------------

export function createPostgresAnalyticsRepository(
  pool: Pool,
  now: () => Date = () => new Date(),
): AnalyticsRepository {
  async function section<T>(read: () => Promise<T>): Promise<Section<T>> {
    try {
      return { status: "ok", data: await read() };
    } catch (err) {
      // Not rethrown: a missing table or revoked grant on one source must not
      // blank the others. Logged, not swallowed.
      console.error("analytics section failed:", err instanceof Error ? err.message : err);
      return { status: "unavailable" };
    }
  }

  return {
    async getAnalytics(days) {
      const todayRow = await pool.query<{ today: string }>(
        `SELECT ((now() AT TIME ZONE 'Europe/Berlin')::date)::text AS today`,
      );
      const { from, to } = windowFor(todayRow.rows[0]!.today, days);

      const followers = section(async () => {
        const res = await pool.query<{
          platform: string;
          day: string;
          followers: string | null;
          fetched_at: string;
        }>(
          `SELECT platform, day::text AS day, followers::text AS followers,
                  to_char(followers_fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fetched_at
           FROM social_account_daily
           WHERE followers_fetched_at IS NOT NULL AND day BETWEEN $1::date AND $2::date
           ORDER BY platform, day`,
          [from, to],
        );
        const byPlatform = new Map<
          string,
          { day: string; followers: number | null; fetchedAt: string }[]
        >();
        for (const r of res.rows) {
          const list = byPlatform.get(r.platform) ?? [];
          list.push({ day: r.day, followers: nOrNull(r.followers), fetchedAt: r.fetched_at });
          byPlatform.set(r.platform, list);
        }
        return [...byPlatform.entries()]
          .map(([platform, readings]) => followerTrend(platform, readings))
          .filter((p): p is FollowerPlatform => p !== null);
      });

      const web = section(async () => {
        const [dailyRes, rangeRes, pagesRes, sourcesRes, actionsRes] = await Promise.all([
          pool.query<{ day: string; pageviews: string; sessions: string; visitors: string }>(
            `SELECT day::text AS day, sum(pageviews)::text AS pageviews,
                    sum(sessions)::text AS sessions, sum(visitors)::text AS visitors
             FROM web_traffic_daily WHERE day BETWEEN $1::date AND $2::date
             GROUP BY day ORDER BY day`,
            [from, to],
          ),
          pool.query<{
            first_day: string | null;
            last_day: string | null;
            built_at: string | null;
          }>(
            `SELECT min(day)::text AS first_day, max(day)::text AS last_day,
                    to_char(max(built_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS built_at FROM web_traffic_daily`,
          ),
          pool.query<{ path: string; pageviews: string; sessions: string }>(
            `SELECT path, sum(pageviews)::text AS pageviews, sum(sessions)::text AS sessions
             FROM web_page_daily WHERE day BETWEEN $1::date AND $2::date
             GROUP BY path ORDER BY sum(pageviews) DESC, path LIMIT 10`,
            [from, to],
          ),
          pool.query<{ source: string; medium: string; campaign: string; sessions: string }>(
            `SELECT coalesce(nullif(utm_source, ''), nullif(referring_domain, ''), '(direct)') AS source,
                    utm_medium AS medium, utm_campaign AS campaign,
                    sum(sessions)::text AS sessions
             FROM web_acquisition_daily WHERE day BETWEEN $1::date AND $2::date
             GROUP BY 1, utm_medium, utm_campaign ORDER BY sum(sessions) DESC, 1 LIMIT 12`,
            [from, to],
          ),
          pool.query<{ event_name: string; events: string; sessions: string }>(
            `SELECT event_name, sum(events)::text AS events, sum(sessions)::text AS sessions
             FROM web_event_daily WHERE day BETWEEN $1::date AND $2::date
             GROUP BY event_name ORDER BY sum(events) DESC, event_name LIMIT 15`,
            [from, to],
          ),
        ]);
        const range = rangeRes.rows[0]!;
        const covered = coveredRange(range.first_day, range.last_day, from, to);
        const filled = covered
          ? fillDays(
              dailyRes.rows.map((r) => ({
                day: r.day,
                pageviews: n(r.pageviews),
                sessions: n(r.sessions),
                visitors: n(r.visitors),
              })),
              covered.from,
              covered.to,
              (day) => ({ day, pageviews: 0, sessions: 0, visitors: 0 }),
            )
          : [];
        const totals = filled.reduce(
          (t, d) => ({
            pageviews: t.pageviews + d.pageviews,
            sessions: t.sessions + d.sessions,
            visitors: t.visitors + d.visitors,
          }),
          { pageviews: 0, sessions: 0, visitors: 0 },
        );
        return {
          daily: filled,
          totals: {
            pageviews: totals.pageviews,
            sessions: totals.sessions,
            // A per-day average is the only honest visitor figure across days.
            avgVisitorsPerDay: filled.length ? totals.visitors / filled.length : 0,
          },
          topPages: pagesRes.rows.map((r) => ({
            path: r.path,
            pageviews: n(r.pageviews),
            sessions: n(r.sessions),
          })),
          sources: sourcesRes.rows.map((r) => ({
            source: r.source,
            medium: r.medium,
            campaign: r.campaign,
            sessions: n(r.sessions),
          })),
          actions: actionsRes.rows.map((r) => ({
            eventName: r.event_name,
            events: n(r.events),
            sessions: n(r.sessions),
          })),
          dataThrough: range.last_day,
          builtAt: range.built_at,
          isStale: isStale(range.built_at, now()),
        } satisfies WebAnalytics;
      });

      const search = section(async () => {
        const [siteRes, rangeRes, queryRes, pageRes, pageTotalRes] = await Promise.all([
          pool.query<{
            search_type: string;
            day: string;
            clicks: string;
            impressions: string;
            position: string;
          }>(
            `SELECT search_type, day::text AS day, clicks::text AS clicks,
                    impressions::text AS impressions, position::text AS position
             FROM search_site_daily
             WHERE search_type IN ('web', 'image') AND day BETWEEN $1::date AND $2::date
             ORDER BY day`,
            [from, to],
          ),
          pool.query<{
            first_day: string | null;
            last_day: string | null;
            fetched_at: string | null;
          }>(
            `SELECT min(day)::text AS first_day, max(day)::text AS last_day,
                    to_char(max(fetched_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fetched_at
             FROM search_site_daily WHERE search_type = 'web'`,
          ),
          pool.query<{
            label: string;
            clicks: string;
            impressions: string;
            position: string | null;
          }>(
            `SELECT query AS label, sum(clicks)::text AS clicks, sum(impressions)::text AS impressions,
                    (sum(position * impressions) / nullif(sum(impressions), 0))::text AS position
             FROM search_query_daily
             WHERE search_type = 'web' AND day BETWEEN $1::date AND $2::date
             GROUP BY query ORDER BY sum(clicks) DESC, sum(impressions) DESC, query LIMIT 10`,
            [from, to],
          ),
          pool.query<{
            label: string;
            clicks: string;
            impressions: string;
            position: string | null;
          }>(
            `SELECT page AS label, sum(clicks)::text AS clicks, sum(impressions)::text AS impressions,
                    (sum(position * impressions) / nullif(sum(impressions), 0))::text AS position
             FROM search_page_daily
             WHERE search_type = 'web' AND day BETWEEN $1::date AND $2::date
             GROUP BY page ORDER BY sum(clicks) DESC, sum(impressions) DESC, page LIMIT 10`,
            [from, to],
          ),
          pool.query<{ impressions: string }>(
            `SELECT coalesce(sum(impressions), 0)::text AS impressions FROM search_page_daily
             WHERE search_type = 'web' AND day BETWEEN $1::date AND $2::date`,
            [from, to],
          ),
        ]);
        const range = rangeRes.rows[0]!;
        const parse = (type: string) =>
          siteRes.rows
            .filter((r) => r.search_type === type)
            .map((r) => ({
              day: r.day,
              clicks: n(r.clicks),
              impressions: n(r.impressions),
              position: n(r.position),
            }));
        const totalsOf = (rows: ReturnType<typeof parse>): SearchTotals => ({
          clicks: rows.reduce((s, r) => s + r.clicks, 0),
          impressions: rows.reduce((s, r) => s + r.impressions, 0),
          position: weightedPosition(rows),
        });
        const webRows = parse("web");
        const covered = coveredRange(range.first_day, range.last_day, from, to);
        const daily = covered
          ? fillDays(
              webRows.map((r) => ({ day: r.day, clicks: r.clicks, impressions: r.impressions })),
              covered.from,
              covered.to,
              (day) => ({ day, clicks: 0, impressions: 0 }),
            )
          : [];
        const webTotals = totalsOf(webRows);
        const toRow = (r: {
          label: string;
          clicks: string;
          impressions: string;
          position: string | null;
        }) => ({
          label: r.label,
          clicks: n(r.clicks),
          impressions: n(r.impressions),
          position: nOrNull(r.position),
        });
        const pageImpressions = n(pageTotalRes.rows[0]?.impressions);
        return {
          web: { daily, totals: webTotals },
          image: { totals: totalsOf(parse("image")) },
          topQueries: queryRes.rows.map(toRow),
          topPages: pageRes.rows.map(toRow),
          pageCoverage: webTotals.impressions > 0 ? pageImpressions / webTotals.impressions : null,
          dataThrough: range.last_day,
          fetchedAt: range.fetched_at,
        } satisfies SearchAnalytics;
      });

      const youtube = section(async () => {
        const res = await pool.query<{
          day: string;
          views: string | null;
          watch_minutes: string | null;
          subscribers_gained: string | null;
          subscribers_lost: string | null;
          fetched_at: string | null;
        }>(
          `SELECT day::text AS day, views::text AS views, watch_minutes::text AS watch_minutes,
                  subscribers_gained::text AS subscribers_gained,
                  subscribers_lost::text AS subscribers_lost,
                  to_char(fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fetched_at
           FROM social_account_daily
           WHERE platform = 'youtube' AND fetched_at IS NOT NULL
             AND day BETWEEN $1::date AND $2::date
           ORDER BY day`,
          [from, to],
        );
        const rows = res.rows;
        const first = rows[0]?.day ?? null;
        const last = rows[rows.length - 1]?.day ?? null;
        const covered = coveredRange(first, last, from, to);
        const daily = covered
          ? fillDays(
              rows.map((r) => ({
                day: r.day,
                views: n(r.views),
                watchMinutes: n(r.watch_minutes),
              })),
              covered.from,
              covered.to,
              (day) => ({ day, views: 0, watchMinutes: 0 }),
            )
          : [];
        return {
          daily,
          totals: {
            views: rows.reduce((s, r) => s + n(r.views), 0),
            watchMinutes: rows.reduce((s, r) => s + n(r.watch_minutes), 0),
            subscribersGained: rows.reduce((s, r) => s + n(r.subscribers_gained), 0),
            subscribersLost: rows.reduce((s, r) => s + n(r.subscribers_lost), 0),
          },
          dataThrough: last,
          fetchedAt: rows.reduce<string | null>(
            (max, r) => (r.fetched_at && (!max || r.fetched_at > max) ? r.fetched_at : max),
            null,
          ),
        } satisfies YoutubeAnalytics;
      });

      const [f, w, s, y] = await Promise.all([followers, web, search, youtube]);
      return { days, from, to, followers: f, web: w, search: s, youtube: y };
    },
  };
}
