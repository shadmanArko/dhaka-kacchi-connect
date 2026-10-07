import type { AdminAnalyticsResult } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { AreaChart } from "./charts";
import { FollowerCards } from "./FollowerCards";
import { totalFollowers } from "./followers";
import {
  ago,
  decimal,
  formatDay,
  MISSING,
  num,
  percent,
  ratio,
  signed,
  watchTime,
  changeOf,
} from "./format";
import { Panel, StatCard, Unavailable } from "./StatCard";

export function OverviewTab({ analytics }: { analytics: AdminAnalyticsResult }) {
  const { web, search, youtube, followers } = analytics;
  const followerTotal = totalFollowers(followers);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Website sessions"
          value={web.status === "ok" ? num(web.data.totals.sessions) : MISSING}
          hint={
            web.status === "ok"
              ? `${num(web.data.totals.pageviews)} pageviews · ~${decimal(web.data.totals.avgVisitorsPerDay)} visitors a day`
              : "Not available yet"
          }
        />
        <StatCard
          label="Google search clicks"
          value={search.status === "ok" ? num(search.data.web.totals.clicks) : MISSING}
          hint={
            search.status === "ok"
              ? `${num(search.data.web.totals.impressions)} impressions · ${percent(ratio(search.data.web.totals.clicks, search.data.web.totals.impressions))} click rate`
              : "Not available yet"
          }
        />
        <StatCard
          label="Followers"
          value={followerTotal ? num(followerTotal.total) : MISSING}
          change={
            followerTotal ? changeOf(followerTotal.change, signed(followerTotal.change)) : undefined
          }
          hint={
            followerTotal
              ? `across ${followerTotal.platforms} platform${followerTotal.platforms === 1 ? "" : "s"}`
              : "Not available yet"
          }
        />
        <StatCard
          label="YouTube views"
          value={youtube.status === "ok" ? num(youtube.data.totals.views) : MISSING}
          hint={
            youtube.status === "ok"
              ? `${watchTime(youtube.data.totals.watchMinutes)} watched`
              : "Not available yet"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Website sessions per day" note="Visits to dhakakacchi.com (Berlin days).">
          {web.status === "ok" ? (
            <Card className="p-4">
              <AreaChart
                label="sessions"
                points={web.data.daily.map((d) => ({
                  day: d.day,
                  value: d.sessions,
                  detail: `${num(d.pageviews)} pageviews`,
                }))}
              />
            </Card>
          ) : (
            <Unavailable what="Website traffic" />
          )}
        </Panel>
        <Panel
          title="Google search impressions per day"
          note="How often the site appeared in Google results."
        >
          {search.status === "ok" ? (
            <Card className="p-4">
              <AreaChart
                label="impressions"
                points={search.data.web.daily.map((d) => ({
                  day: d.day,
                  value: d.impressions,
                  detail: `${num(d.clicks)} clicks`,
                }))}
              />
            </Card>
          ) : (
            <Unavailable what="Search Console" />
          )}
        </Panel>
      </div>

      <Panel
        title="Followers"
        note="Read once a night. Platforms don't keep history, so the trend builds from the first day this started."
      >
        <FollowerCards section={followers} />
      </Panel>

      <Freshness analytics={analytics} />
    </div>
  );
}

/** When each source was last refreshed, and how far its data reaches. */
function Freshness({ analytics }: { analytics: AdminAnalyticsResult }) {
  const { web, search, youtube, followers } = analytics;
  const rows: { name: string; text: string }[] = [
    {
      name: "Website",
      text:
        web.status === "ok"
          ? `data through ${web.data.dataThrough ? formatDay(web.data.dataThrough) : "—"} · updated ${ago(web.data.builtAt)}`
          : "unavailable",
    },
    {
      name: "Google search",
      text:
        search.status === "ok"
          ? `data through ${search.data.dataThrough ? formatDay(search.data.dataThrough) : "—"} · Google publishes final numbers about 2 days late`
          : "unavailable",
    },
    {
      name: "YouTube",
      text:
        youtube.status === "ok"
          ? `data through ${youtube.data.dataThrough ? formatDay(youtube.data.dataThrough) : "—"} · YouTube reports about 3 days late`
          : "unavailable",
    },
    {
      name: "Followers",
      text:
        followers.status === "ok" && followers.data.length > 0
          ? `last read ${ago(
              followers.data
                .map((p) => p.currentAt)
                .sort()
                .at(-1) ?? null,
            )}`
          : followers.status === "ok"
            ? "no reading yet"
            : "unavailable",
    },
  ];
  return (
    <section className="space-y-2 border-t pt-4">
      <h2 className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
        How fresh is this?
      </h2>
      <dl className="grid gap-x-6 gap-y-1 font-sans text-xs text-muted-foreground sm:grid-cols-[max-content_1fr]">
        {rows.map((r) => (
          <div key={r.name} className="contents">
            <dt className="font-medium text-foreground">{r.name}</dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
