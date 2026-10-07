import type { AdminAnalyticsResult, AdminReportingResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaChart, BarList } from "./charts";
import { LinksTable } from "./LinksTable";
import { ago, decimal, formatDay, humanizeEvent, num } from "./format";
import { SortableHead } from "./sortable";
import { useSort } from "./useSort";
import { Panel, StatCard, Unavailable } from "./StatCard";

export function WebsiteTab({
  analytics,
  reporting,
}: {
  analytics: AdminAnalyticsResult;
  reporting: AdminReportingResult;
}) {
  const { web } = analytics;
  const funnel = useSort(reporting.channelFunnel);
  const { attributionCoverage } = reporting;

  return (
    <div className="space-y-8">
      {web.status === "unavailable" ? (
        <Unavailable what="Website traffic" />
      ) : (
        <>
          {web.data.isStale && (
            <Card className="border-destructive/50 bg-destructive/5 p-3 shadow-none">
              <p className="font-sans text-sm">
                Website numbers were last updated {ago(web.data.builtAt)}. The nightly job normally
                refreshes them every morning, so recent days may be missing.
              </p>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Sessions"
              value={num(web.data.totals.sessions)}
              hint="Separate visits"
            />
            <StatCard
              label="Pageviews"
              value={num(web.data.totals.pageviews)}
              hint="Pages opened"
            />
            <StatCard
              label="Visitors a day"
              value={decimal(web.data.totals.avgVisitorsPerDay)}
              hint="Daily average of anonymous visitors"
              className="col-span-2 lg:col-span-1"
            />
          </div>

          <Panel
            title="Sessions per day"
            note={`Berlin days${web.data.dataThrough ? `, through ${formatDay(web.data.dataThrough)}` : ""}. Visitors are anonymous and counted per day, so they are averaged here rather than added up across days.`}
          >
            <Card className="p-4">
              <AreaChart
                label="sessions"
                points={web.data.daily.map((d) => ({
                  day: d.day,
                  value: d.sessions,
                  detail: `${num(d.pageviews)} pageviews · ${num(d.visitors)} visitors`,
                }))}
              />
            </Card>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top pages">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Pageviews</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {web.data.topPages.map((p) => (
                    <TableRow key={p.path}>
                      <TableCell className="max-w-[16rem] truncate" title={p.path}>
                        {p.path}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(p.pageviews)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(p.sessions)}</TableCell>
                    </TableRow>
                  ))}
                  {web.data.topPages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No page views in this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Panel>

            <Panel
              title="Where visitors come from"
              note="Sessions by campaign tag (utm) or, without one, by the site that sent them."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {web.data.sources.map((s) => (
                    <TableRow key={`${s.source}|${s.medium}|${s.campaign}`}>
                      <TableCell className="max-w-[12rem] truncate" title={s.source}>
                        {s.source}
                        {s.campaign && (
                          <span className="ml-2 text-xs text-muted-foreground">{s.campaign}</span>
                        )}
                      </TableCell>
                      <TableCell>{s.medium || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(s.sessions)}</TableCell>
                    </TableRow>
                  ))}
                  {web.data.sources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No sessions in this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Panel>
          </div>

          <Panel title="What visitors did" note="Sessions that did each action, most common first.">
            <Card className="p-4">
              {web.data.actions.length > 0 ? (
                <BarList
                  rows={web.data.actions.map((a) => ({
                    label: humanizeEvent(a.eventName),
                    value: a.sessions,
                    detail: `${num(a.events)} ${a.events === 1 ? "time" : "times"}`,
                  }))}
                />
              ) : (
                <p className="font-sans text-sm text-muted-foreground">No actions recorded yet.</p>
              )}
            </Card>
          </Panel>
        </>
      )}

      <Panel
        title="Posts and links"
        note="Every link made in the Link builder, with the visits and orders it brought."
      >
        {analytics.links.status === "ok" ? (
          <LinksTable data={analytics.links.data} />
        ) : (
          <Unavailable what="Link tracking" />
        )}
      </Panel>

      <Panel
        title="Order-funnel activity by channel"
        action={
          <Badge variant="outline" className="font-sans text-xs">
            {attributionCoverage.attributed} attributed · {attributionCoverage.unattributed}{" "}
            direct/unattributed
          </Badge>
        }
        note="Steps taken on the order page that carry a channel and campaign (all time)."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Channel"
                column="channel"
                sortKey={funnel.sortKey}
                direction={funnel.direction}
                onSort={funnel.requestSort}
              />
              <SortableHead
                label="Campaign"
                column="campaign"
                sortKey={funnel.sortKey}
                direction={funnel.direction}
                onSort={funnel.requestSort}
              />
              <SortableHead
                label="Event"
                column="eventName"
                sortKey={funnel.sortKey}
                direction={funnel.direction}
                onSort={funnel.requestSort}
              />
              <SortableHead
                label="Count"
                column="eventCount"
                sortKey={funnel.sortKey}
                direction={funnel.direction}
                onSort={funnel.requestSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {funnel.sorted.map((row) => (
              <TableRow key={`${row.channel}-${row.campaign}-${row.eventName}`}>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.campaign}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell className="text-right">{row.eventCount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {funnel.sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No attributed website visits yet — check that a bio link with
                  utm_source/utm_content has been clicked.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
