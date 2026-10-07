import type { AdminAnalyticsResult, SearchRow } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaChart } from "./charts";
import { decimal, formatDay, num, pathOf, percent, ratio } from "./format";
import { Panel, StatCard, Unavailable } from "./StatCard";

function RowsTable({
  rows,
  heading,
  display,
}: {
  rows: SearchRow[];
  heading: string;
  display: (label: string) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{heading}</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">Position</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="max-w-[16rem] truncate" title={r.label}>
              {display(r.label)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{num(r.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">{num(r.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">{decimal(r.position)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              Nothing to list in this period.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function SearchTab({ analytics }: { analytics: AdminAnalyticsResult }) {
  const { search } = analytics;
  if (search.status === "unavailable") return <Unavailable what="Google Search Console" />;
  const { web, image, topQueries, topPages, pageCoverage, dataThrough } = search.data;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clicks" value={num(web.totals.clicks)} hint="Visits from Google search" />
        <StatCard
          label="Impressions"
          value={num(web.totals.impressions)}
          hint="Times the site appeared in results"
        />
        <StatCard
          label="Click rate"
          value={percent(ratio(web.totals.clicks, web.totals.impressions))}
          hint="Clicks ÷ impressions"
        />
        <StatCard
          label="Average position"
          value={decimal(web.totals.position)}
          hint="1 is the top of the results"
        />
      </div>

      <Panel
        title="Impressions per day"
        note={`Web search${dataThrough ? `, through ${formatDay(dataThrough)}` : ""}. Google publishes final numbers about two days late, so the newest days are not here yet.`}
      >
        <Card className="p-4">
          <AreaChart
            label="impressions"
            points={web.daily.map((d) => ({
              day: d.day,
              value: d.impressions,
              detail: `${num(d.clicks)} clicks`,
            }))}
          />
        </Card>
        {image.totals.impressions > 0 && (
          <p className="font-sans text-xs text-muted-foreground">
            Image search, counted separately: {num(image.totals.impressions)} impressions,{" "}
            {num(image.totals.clicks)} clicks.
          </p>
        )}
      </Panel>

      <Card className="border-dashed p-3 shadow-none">
        <p className="font-sans text-xs text-muted-foreground">
          The two lists below show <strong className="text-foreground">which</strong> searches and
          pages, not <strong className="text-foreground">how many</strong>
          {pageCoverage !== null && <> — they cover only {percent(pageCoverage)} of impressions</>},
          because Google leaves out searches too rare to publish. The totals above are exact.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top searches">
          <RowsTable rows={topQueries} heading="Search" display={(l) => l} />
        </Panel>
        <Panel title="Top pages">
          <RowsTable rows={topPages} heading="Page" display={pathOf} />
        </Panel>
      </div>
    </div>
  );
}
