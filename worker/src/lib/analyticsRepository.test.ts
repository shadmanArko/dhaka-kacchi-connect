import { describe, expect, it } from "bun:test";
import type { Pool } from "pg";
import { AdminAnalyticsResultSchema } from "../schemas";
import {
  addDays,
  coverageShares,
  coveredRange,
  createPostgresAnalyticsRepository,
  fillDays,
  followerTrend,
  isStale,
  weightedPosition,
  windowFor,
} from "./analyticsRepository";

describe("windowFor", () => {
  it("is inclusive of today and `days` long", () => {
    expect(windowFor("2026-10-07", 28)).toEqual({ from: "2026-09-10", to: "2026-10-07" });
    expect(windowFor("2026-10-07", 7)).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });

  it("crosses month, year and leap-day boundaries by calendar, not by 30 days", () => {
    expect(windowFor("2026-01-03", 7).from).toBe("2025-12-28");
    expect(windowFor("2028-03-01", 2).from).toBe("2028-02-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // Berlin DST switch is not a 23h trap
  });
});

describe("fillDays", () => {
  const zero = (day: string) => ({ day, n: 0 });

  it("fills gaps inside the range and keeps real rows", () => {
    const out = fillDays(
      [
        { day: "2026-10-01", n: 5 },
        { day: "2026-10-03", n: 2 },
      ],
      "2026-10-01",
      "2026-10-04",
      zero,
    );
    expect(out.map((r) => r.n)).toEqual([5, 0, 2, 0]);
    expect(out.map((r) => r.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("returns nothing for an inverted range", () => {
    expect(fillDays([], "2026-10-05", "2026-10-01", zero)).toEqual([]);
  });
});

describe("coveredRange", () => {
  it("clips the source's own coverage to the window", () => {
    expect(coveredRange("2026-09-14", "2026-10-04", "2026-09-10", "2026-10-07")).toEqual({
      from: "2026-09-14",
      to: "2026-10-04", // newer days are unknown, NOT zero
    });
  });

  it("is null when the source has no data or none inside the window", () => {
    expect(coveredRange(null, null, "2026-09-10", "2026-10-07")).toBeNull();
    expect(coveredRange("2026-01-01", "2026-02-01", "2026-09-10", "2026-10-07")).toBeNull();
  });
});

describe("weightedPosition", () => {
  it("weights by impressions rather than averaging averages", () => {
    // 100 impressions at position 2, 1 at position 50: the plain mean is 26, the truth is ~2.5.
    const p = weightedPosition([
      { impressions: 100, position: 2 },
      { impressions: 1, position: 50 },
    ]);
    expect(p).toBeCloseTo(2.475, 3);
  });

  it("is null with no impressions", () => {
    expect(weightedPosition([])).toBeNull();
    expect(weightedPosition([{ impressions: 0, position: 3 }])).toBeNull();
  });
});

describe("followerTrend", () => {
  const at = "2026-10-07T14:00:00Z";

  it("reports the change since the first reading, whatever the input order", () => {
    const t = followerTrend("instagram", [
      { day: "2026-10-07", followers: 45, fetchedAt: at },
      { day: "2026-10-01", followers: 41, fetchedAt: at },
    ])!;
    expect(t.current).toBe(45);
    expect(t.change).toBe(4);
    expect(t.since).toBe("2026-10-01");
    expect(t.history.map((h) => h.day)).toEqual(["2026-10-01", "2026-10-07"]);
  });

  it("gives no change from a single reading (history cannot be backfilled)", () => {
    expect(
      followerTrend("facebook", [{ day: "2026-10-07", followers: 355, fetchedAt: at }])!.change,
    ).toBeNull();
  });

  it("treats a hidden count as not reported, never as zero", () => {
    const t = followerTrend("youtube", [
      { day: "2026-10-01", followers: 3, fetchedAt: at },
      { day: "2026-10-07", followers: null, fetchedAt: at },
    ])!;
    expect(t.current).toBeNull();
    expect(t.change).toBeNull();
  });

  it("is null with no readings", () => {
    expect(followerTrend("threads", [])).toBeNull();
  });
});

describe("coverageShares", () => {
  it("divides each bucket by all visits", () => {
    expect(
      coverageShares({ total: 200, linked: 50, otherTagged: 10, referral: 40, direct: 100 }),
    ).toEqual({
      linked: 0.25,
      otherTagged: 0.05,
      referral: 0.2,
      direct: 0.5,
    });
  });

  it("is null, not 0%, when there were no visits", () => {
    expect(
      coverageShares({ total: 0, linked: 0, otherTagged: 0, referral: 0, direct: 0 }).linked,
    ).toBeNull();
  });
});

describe("isStale", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("flags a build older than 36h, or none at all", () => {
    expect(isStale("2026-10-07T03:25:00Z", now)).toBe(false);
    expect(isStale("2026-10-05T03:25:00Z", now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});

// A pool that answers by recognising the table in the SQL. `failOn` makes every
// query touching that table reject, as if the table did not exist yet.
function fakePool(failOn: string[] = []): Pool {
  const answer = (sql: string): { rows: unknown[] } => {
    if (sql.includes("AS today")) return { rows: [{ today: "2026-10-07" }] };
    if (sql.includes("FROM tracked_link") && sql.includes("GROUP BY utm_source, utm_content")) {
      return {
        rows: [
          {
            id: "lnk_1",
            label: "Reel - kacchi pot",
            source: "instagram",
            medium: "organic_social",
            campaign: "batch-2026-10-10",
            content: "reel-kacchi-pot",
            post_url: "https://instagram.com/p/AAA",
            created_at: "2026-10-02T09:00:00Z",
            sessions: "12",
            purchases: "3",
            orders: "2",
            revenue: "58.50",
          },
          {
            id: "lnk_2",
            label: "Story",
            source: "whatsapp",
            medium: "message",
            campaign: "batch-2026-10-10",
            content: "broadcast-friday",
            post_url: null,
            created_at: "2026-10-03T09:00:00Z",
            sessions: "0",
            purchases: "0",
            orders: "0",
            revenue: "0",
          },
        ],
      };
    }
    if (sql.includes("WITH a AS")) {
      return {
        rows: [{ total: "100", linked: "20", other_tagged: "10", referral: "30", direct: "40" }],
      };
    }
    if (sql.includes("count(*)::text AS n FROM tracked_link")) return { rows: [{ n: "7" }] };
    if (sql.includes("FROM social_account_daily") && sql.includes("followers_fetched_at")) {
      return {
        rows: [
          {
            platform: "instagram",
            day: "2026-10-01",
            followers: "41",
            fetched_at: "2026-10-01T14:00:00Z",
          },
          {
            platform: "instagram",
            day: "2026-10-07",
            followers: "44",
            fetched_at: "2026-10-07T14:00:00Z",
          },
          {
            platform: "youtube",
            day: "2026-10-07",
            followers: null,
            fetched_at: "2026-10-07T14:00:00Z",
          },
        ],
      };
    }
    if (sql.includes("FROM web_traffic_daily") && sql.includes("min(day)")) {
      return {
        rows: [
          { first_day: "2026-10-04", last_day: "2026-10-07", built_at: "2026-10-07T03:25:00Z" },
        ],
      };
    }
    if (sql.includes("FROM web_traffic_daily")) {
      return {
        rows: [
          { day: "2026-10-04", pageviews: "10", sessions: "4", visitors: "3" },
          { day: "2026-10-07", pageviews: "6", sessions: "2", visitors: "2" },
        ],
      };
    }
    if (sql.includes("FROM web_page_daily"))
      return { rows: [{ path: "/order", pageviews: "9", sessions: "5" }] };
    if (sql.includes("FROM web_acquisition_daily")) {
      return { rows: [{ source: "instagram", medium: "social", campaign: "", sessions: "3" }] };
    }
    if (sql.includes("FROM web_event_daily")) {
      return { rows: [{ event_name: "order_cart_started", events: "7", sessions: "4" }] };
    }
    if (sql.includes("FROM search_site_daily") && sql.includes("min(day)")) {
      return {
        rows: [
          { first_day: "2026-10-01", last_day: "2026-10-03", fetched_at: "2026-10-06T05:30:00Z" },
        ],
      };
    }
    if (sql.includes("FROM search_site_daily")) {
      return {
        rows: [
          {
            search_type: "web",
            day: "2026-10-01",
            clicks: "1",
            impressions: "10",
            position: "4.5",
          },
          {
            search_type: "web",
            day: "2026-10-03",
            clicks: "0",
            impressions: "30",
            position: "8.5",
          },
          {
            search_type: "image",
            day: "2026-10-02",
            clicks: "0",
            impressions: "5",
            position: "20",
          },
        ],
      };
    }
    if (sql.includes("FROM search_query_daily")) {
      return {
        rows: [{ label: "dhaka kacchi berlin", clicks: "1", impressions: "9", position: "3.2" }],
      };
    }
    if (sql.includes("FROM search_page_daily") && sql.includes("GROUP BY page")) {
      return {
        rows: [
          { label: "https://dhakakacchi.com/", clicks: "1", impressions: "10", position: null },
        ],
      };
    }
    if (sql.includes("FROM search_page_daily")) return { rows: [{ impressions: "10" }] };
    if (sql.includes("platform = 'youtube'")) {
      return {
        rows: [
          {
            day: "2026-10-03",
            views: "1",
            watch_minutes: "0",
            subscribers_gained: "0",
            subscribers_lost: null,
            fetched_at: "2026-10-07T05:20:00Z",
          },
          {
            day: "2026-10-05",
            views: "4",
            watch_minutes: "2",
            subscribers_gained: "1",
            subscribers_lost: "0",
            fetched_at: "2026-10-07T05:20:00Z",
          },
        ],
      };
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  };
  return {
    query: async (sql: string) => {
      if (failOn.some((t) => sql.includes(t)))
        throw new Error(`relation "${failOn[0]}" does not exist`);
      return answer(sql);
    },
  } as unknown as Pool;
}

describe("createPostgresAnalyticsRepository", () => {
  const now = () => new Date("2026-10-07T12:00:00Z");

  it("assembles every section and satisfies the response schema", async () => {
    const result = await createPostgresAnalyticsRepository(fakePool(), now).getAnalytics(28);
    expect(AdminAnalyticsResultSchema.safeParse(result).success).toBe(true);
    expect(result.from).toBe("2026-09-10");
    expect(result.to).toBe("2026-10-07");

    if (result.web.status !== "ok") throw new Error("web unavailable");
    // Gaps inside the covered range become zero rows; nothing is invented beyond it.
    expect(result.web.data.daily.map((d) => d.day)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(result.web.data.totals).toEqual({ pageviews: 16, sessions: 6, avgVisitorsPerDay: 1.25 });
    expect(result.web.data.isStale).toBe(false);

    if (result.search.status !== "ok") throw new Error("search unavailable");
    expect(result.search.data.web.daily.map((d) => d.day)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(result.search.data.web.totals).toMatchObject({ clicks: 1, impressions: 40 });
    expect(result.search.data.web.totals.position).toBeCloseTo((4.5 * 10 + 8.5 * 30) / 40, 6);
    expect(result.search.data.image.totals.impressions).toBe(5);
    expect(result.search.data.pageCoverage).toBeCloseTo(10 / 40, 6);
    expect(result.search.data.dataThrough).toBe("2026-10-03");

    if (result.youtube.status !== "ok") throw new Error("youtube unavailable");
    expect(result.youtube.data.daily.map((d) => d.views)).toEqual([1, 0, 4]);
    expect(result.youtube.data.totals).toMatchObject({
      views: 5,
      watchMinutes: 2,
      subscribersGained: 1,
    });

    if (result.followers.status !== "ok") throw new Error("followers unavailable");
    const ig = result.followers.data.find((p) => p.platform === "instagram")!;
    expect(ig).toMatchObject({ current: 44, change: 3 });
    expect(result.followers.data.find((p) => p.platform === "youtube")!.current).toBeNull();
  });

  it("isolates a failing source: the rest of the page still loads", async () => {
    const repo = createPostgresAnalyticsRepository(fakePool(["search_site_daily"]), now);
    const originalError = console.error;
    console.error = () => {}; // the failure is logged by design; keep test output clean
    try {
      const result = await repo.getAnalytics(7);
      expect(result.search.status).toBe("unavailable");
      expect(result.web.status).toBe("ok");
      expect(result.followers.status).toBe("ok");
      expect(result.youtube.status).toBe("ok");
      expect(AdminAnalyticsResultSchema.safeParse(result).success).toBe(true);
    } finally {
      console.error = originalError;
    }
  });

  it("reports which visits came from tagged links, and each link's results", async () => {
    const result = await createPostgresAnalyticsRepository(fakePool(), now).getAnalytics(28);
    if (result.links.status !== "ok") throw new Error("links unavailable");
    expect(result.links.data.coverage).toEqual({
      total: 100,
      linked: 20,
      otherTagged: 10,
      referral: 30,
      direct: 40,
    });
    expect(result.links.data.totalLinks).toBe(7);
    expect(result.links.data.links[0]).toMatchObject({ sessions: 12, orders: 2, revenue: 58.5 });
    // A link nobody visited is still listed - "this post drove nothing" is an answer.
    expect(result.links.data.links[1]).toMatchObject({ sessions: 0, revenue: 0, postUrl: null });
  });

  it("a missing links table blanks only that block", async () => {
    const repo = createPostgresAnalyticsRepository(fakePool(["tracked_link"]), now);
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await repo.getAnalytics(28);
      expect(result.links.status).toBe("unavailable");
      expect(result.web.status).toBe("ok");
      expect(AdminAnalyticsResultSchema.safeParse(result).success).toBe(true);
    } finally {
      console.error = originalError;
    }
  });

  it("reports a stale website build", async () => {
    const late = () => new Date("2026-10-09T12:00:00Z");
    const result = await createPostgresAnalyticsRepository(fakePool(), late).getAnalytics(28);
    if (result.web.status !== "ok") throw new Error("web unavailable");
    expect(result.web.data.isStale).toBe(true);
  });
});
