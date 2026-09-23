import { useEffect, useState } from "react";
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

  const {
    socialPlatformSummary,
    recentSocialPosts,
    channelFunnel,
    channelRevenue,
    attributionCoverage,
  } = data;

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
              <TableHead>Platform</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Caption</TableHead>
              <TableHead className="text-right">Likes</TableHead>
              <TableHead className="text-right">Comments</TableHead>
              <TableHead className="text-right">Shares</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentSocialPosts.map((post) => (
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
            {recentSocialPosts.length === 0 && (
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
              <TableHead>Channel</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channelFunnel.map((row) => (
              <TableRow key={`${row.channel}-${row.campaign}-${row.eventName}`}>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.campaign}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell className="text-right">{row.eventCount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {channelFunnel.length === 0 && (
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
              <TableHead>Channel</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Purchase events</TableHead>
              <TableHead className="text-right">Matched orders</TableHead>
              <TableHead className="text-right">Gross revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channelRevenue.map((row) => (
              <TableRow key={`${row.channel}-${row.campaign}`}>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.campaign}</TableCell>
                <TableCell className="text-right">{row.purchaseEvents}</TableCell>
                <TableCell className="text-right">{row.matchedOrders}</TableCell>
                <TableCell className="text-right">{EUR.format(row.grossRevenue)}</TableCell>
              </TableRow>
            ))}
            {channelRevenue.length === 0 && (
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
