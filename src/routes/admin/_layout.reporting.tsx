import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminApi, ApiError, type AdminReportingResult } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/_layout/reporting")({
  head: () => ({ meta: [{ title: "Reporting — Dhaka Kacchi Admin" }] }),
  component: AdminReportingPage,
});

type LoadState = "loading" | "ready" | "error" | "not_configured";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type SortDirection = "asc" | "desc";

/**
 * Generic client-side table sort - every reporting table here is small
 * (dozens to a few hundred rows, already capped server-side), so there's no
 * need for server-side sorting/pagination. `key` is nullable so a table can
 * start unsorted (server order - most recent first for posts, GROUP BY
 * order for the aggregate tables).
 */
function useSort<T>(rows: T[], initialKey: keyof T | null = null) {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey);
  const [direction, setDirection] = useState<SortDirection>("asc");

  function requestSort(key: keyof T) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numbers default to descending first click (biggest first is almost
      // always what "sort by likes" means); strings/dates default ascending.
      setDirection(typeof rows[0]?.[key] === "number" ? "desc" : "asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const sign = direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [rows, sortKey, direction]);

  return { sorted, sortKey, direction, requestSort };
}

function SortableHead<T>({
  label,
  column,
  sortKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: keyof T;
  sortKey: keyof T | null;
  direction: SortDirection;
  onSort: (column: keyof T) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none whitespace-nowrap hover:text-foreground",
        align === "right" && "text-right",
      )}
      onClick={() => onSort(column)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-xs">
        {active ? (direction === "asc" ? "▲" : "▼") : ""}
      </span>
    </TableHead>
  );
}

function AdminReportingPage() {
  const session = useAdminSession();
  const [data, setData] = useState<AdminReportingResult | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoadState("loading");
    adminApi
      .getReporting(session.token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 503 means WAREHOUSE_DATABASE_URL isn't set on this deployment
        // (e.g. local dev) - a distinct, expected state, not a failure to
        // retry - see reportingRepository.ts's own doc comment.
        setLoadState(err instanceof ApiError && err.status === 503 ? "not_configured" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, retryCount]);

  const posts = useSort(data?.recentSocialPosts ?? []);
  const funnel = useSort(data?.channelFunnel ?? []);
  const revenue = useSort(data?.channelRevenue ?? []);

  if (loadState === "loading") {
    return <p className="font-sans text-sm text-muted-foreground">Loading…</p>;
  }

  if (loadState === "not_configured") {
    return (
      <div className="space-y-2">
        <h1 className="font-sans text-xl font-medium">Reporting</h1>
        <p className="font-sans text-sm text-muted-foreground">
          This deployment isn&apos;t connected to the warehouse database yet (WAREHOUSE_DATABASE_URL
          isn&apos;t set).
        </p>
      </div>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <div className="space-y-2">
        <p className="font-sans text-sm text-destructive">Couldn&apos;t load reporting data.</p>
        <button className="font-sans text-sm underline" onClick={() => setRetryCount((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  }

  const { socialPlatformSummary, attributionCoverage } = data;

  return (
    <div className="space-y-8">
      <h1 className="font-sans text-xl font-medium">Reporting</h1>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Organic social performance</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {socialPlatformSummary.map((p) => (
            <Card key={p.platform}>
              <CardHeader className="pb-2">
                <CardTitle className="font-sans text-sm capitalize">{p.platform}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 font-sans text-sm text-muted-foreground">
                <p>{p.postCount} posts</p>
                <p>{p.totalLikes.toLocaleString()} likes</p>
                <p>{p.totalComments.toLocaleString()} comments</p>
                <p>{p.totalShares.toLocaleString()} shares</p>
                {p.totalImpressions > 0 && <p>{p.totalImpressions.toLocaleString()} impressions</p>}
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
                <TableCell className="capitalize">{post.platform}</TableCell>
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
                <TableCell className="text-right">{post.likes.toLocaleString()}</TableCell>
                <TableCell className="text-right">{post.comments.toLocaleString()}</TableCell>
                <TableCell className="text-right">{post.shares.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {posts.sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No posts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-sans text-base font-medium">Website traffic by channel</h2>
          <Badge variant="outline" className="font-sans text-xs">
            {attributionCoverage.attributed} attributed · {attributionCoverage.unattributed}{" "}
            direct/unattributed
          </Badge>
        </div>
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
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Revenue by channel</h2>
        <p className="font-sans text-xs text-muted-foreground">
          Best-effort: matches an attributed purchase event to its real order by id. Not full
          multi-touch attribution — a channel only shows here once a real order has been placed
          after clicking through from it.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Channel"
                column="channel"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
              />
              <SortableHead
                label="Campaign"
                column="campaign"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
              />
              <SortableHead
                label="Purchase events"
                column="purchaseEvents"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
              <SortableHead
                label="Matched orders"
                column="matchedOrders"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
              <SortableHead
                label="Gross revenue"
                column="grossRevenue"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenue.sorted.map((row) => (
              <TableRow key={`${row.channel}-${row.campaign}`}>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.campaign}</TableCell>
                <TableCell className="text-right">{row.purchaseEvents}</TableCell>
                <TableCell className="text-right">{row.matchedOrders}</TableCell>
                <TableCell className="text-right">{EUR.format(row.grossRevenue)}</TableCell>
              </TableRow>
            ))}
            {revenue.sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No attributed purchases yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
