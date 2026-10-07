import type { AdminAnalyticsResult, AdminReportingResult } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaChart } from "./charts";
import { FollowerCards } from "./FollowerCards";
import { formatDay, num, platformLabel, watchTime } from "./format";
import { SortableHead } from "./sortable";
import { useSort } from "./useSort";
import { Panel, StatCard, Unavailable } from "./StatCard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SocialTab({
  analytics,
  reporting,
}: {
  analytics: AdminAnalyticsResult;
  reporting: AdminReportingResult;
}) {
  const { socialPlatformSummary } = reporting;
  const posts = useSort(reporting.recentSocialPosts);
  const { youtube } = analytics;

  return (
    <div className="space-y-8">
      <Panel
        title="Followers"
        note="Read once a night. Platforms don't keep history, so the trend builds from the first day this started."
      >
        <FollowerCards section={analytics.followers} />
      </Panel>

      <Panel
        title="YouTube channel"
        note={`Views and watch time for the whole channel${youtube.status === "ok" && youtube.data.dataThrough ? `, through ${formatDay(youtube.data.dataThrough)}` : ""}. YouTube reports about 3 days late and counts days in Pacific time.`}
      >
        {youtube.status === "ok" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Views" value={num(youtube.data.totals.views)} />
              <StatCard label="Watch time" value={watchTime(youtube.data.totals.watchMinutes)} />
              <StatCard
                label="Subscribers gained"
                value={num(youtube.data.totals.subscribersGained)}
              />
              <StatCard label="Subscribers lost" value={num(youtube.data.totals.subscribersLost)} />
            </div>
            <Card className="p-4">
              <AreaChart
                label="views"
                points={youtube.data.daily.map((d) => ({
                  day: d.day,
                  value: d.views,
                  detail: `${watchTime(d.watchMinutes)} watched`,
                }))}
              />
            </Card>
          </div>
        ) : (
          <Unavailable what="YouTube analytics" />
        )}
      </Panel>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Organic social performance</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {socialPlatformSummary.map((p) => (
            <Card key={p.platform}>
              <CardHeader className="pb-2">
                <CardTitle className="font-sans text-sm">{platformLabel(p.platform)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 font-sans text-sm text-muted-foreground">
                <p>{p.postCount} posts</p>
                {p.totalImpressions > 0 && <p>{p.totalImpressions.toLocaleString()} impressions</p>}
                {p.totalReach > 0 && <p>{p.totalReach.toLocaleString()} reach</p>}
                <p>{p.totalLikes.toLocaleString()} likes</p>
                <p>{p.totalComments.toLocaleString()} comments</p>
                <p>{p.totalShares.toLocaleString()} shares</p>
              </CardContent>
            </Card>
          ))}
          {socialPlatformSummary.length === 0 && (
            <p className="font-sans text-sm text-muted-foreground">No social posts ingested yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Recent posts</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Platform"
                column="platform"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
              />
              <SortableHead
                label="Posted"
                column="postedAt"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
              />
              <SortableHead
                label="Type"
                column="contentType"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
              />
              <TableHead>Caption</TableHead>
              <SortableHead
                label="Impressions"
                column="impressions"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
                align="right"
              />
              <SortableHead
                label="Reach"
                column="reach"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
                align="right"
              />
              <SortableHead
                label="Likes"
                column="likes"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
                align="right"
              />
              <SortableHead
                label="Comments"
                column="comments"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
                align="right"
              />
              <SortableHead
                label="Shares"
                column="shares"
                sortKey={posts.sortKey}
                direction={posts.direction}
                onSort={posts.requestSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.sorted.map((post) => (
              <TableRow key={`${post.platform}-${post.externalId}`}>
                <TableCell>{platformLabel(post.platform)}</TableCell>
                <TableCell>{formatDate(post.postedAt)}</TableCell>
                <TableCell>{post.contentType ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate" title={post.caption ?? undefined}>
                  {post.permalink ? (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {post.caption ?? post.permalink}
                    </a>
                  ) : (
                    (post.caption ?? "—")
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {post.impressions > 0 ? post.impressions.toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {post.reach > 0 ? post.reach.toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right">{post.likes.toLocaleString()}</TableCell>
                <TableCell className="text-right">{post.comments.toLocaleString()}</TableCell>
                <TableCell className="text-right">{post.shares.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {posts.sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No posts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
