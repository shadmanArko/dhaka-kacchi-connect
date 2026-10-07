import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  adminApi,
  ApiError,
  type AdminAnalyticsResult,
  type AdminReportingResult,
  type AnalyticsDays,
} from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { OverviewTab } from "@/components/admin/reporting/OverviewTab";
import { RevenueTab } from "@/components/admin/reporting/RevenueTab";
import { SearchTab } from "@/components/admin/reporting/SearchTab";
import { SocialTab } from "@/components/admin/reporting/SocialTab";
import { WebsiteTab } from "@/components/admin/reporting/WebsiteTab";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "social", label: "Social" },
  { id: "website", label: "Website" },
  { id: "search", label: "Search" },
  { id: "revenue", label: "Revenue" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RANGES: AnalyticsDays[] = [7, 28, 90];
const DEFAULT_DAYS: AnalyticsDays = 28;

// Absent (not defaulted) when missing or invalid, so a plain link to /admin/reporting
// stays valid and a mangled URL falls back to the defaults instead of an error page.
function parseTab(value: unknown): TabId | undefined {
  return TABS.find((t) => t.id === value)?.id;
}

function parseDays(value: unknown): AnalyticsDays | undefined {
  const n = Number(value);
  return RANGES.find((d) => d === n);
}

export const Route = createFileRoute("/admin/_layout/reporting")({
  head: () => ({ meta: [{ title: "Reporting — Dhaka Kacchi Admin" }] }),
  // Both live in the URL so a view can be bookmarked or sent to someone.
  validateSearch: (search: Record<string, unknown>): { tab?: TabId; days?: AnalyticsDays } => ({
    tab: parseTab(search.tab),
    days: parseDays(search.days),
  }),
  component: AdminReportingPage,
});

type LoadState = "loading" | "ready" | "error" | "not_configured";

type Loaded<T> = {
  state: LoadState;
  /** The last successful result, kept while a newer one loads. */
  data: T | null;
  retry: () => void;
};

/**
 * Loads one source. A 503 means WAREHOUSE_DATABASE_URL isn't set on this deployment
 * (local dev) - an expected state, not a failure to retry. The previous result stays
 * on screen while the next one loads, so changing the range does not blank the page.
 */
function useLoad<T>(load: (token: string) => Promise<T>, key: string): Loaded<T> {
  const session = useAdminSession();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setState("loading");
    load(session.token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 503 ? "not_configured" : "error");
      });
    return () => {
      cancelled = true;
    };
    // `load` is rebuilt every render; `key` is what identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, data, retry };
}

function Problem({ loaded, what }: { loaded: Loaded<unknown>; what: string }) {
  if (loaded.state === "not_configured") {
    return (
      <p className="font-sans text-sm text-muted-foreground">
        This deployment isn&apos;t connected to the warehouse database yet (WAREHOUSE_DATABASE_URL
        isn&apos;t set).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="font-sans text-sm text-destructive">Couldn&apos;t load {what}.</p>
      <button className="font-sans text-sm underline" onClick={loaded.retry}>
        Retry
      </button>
    </div>
  );
}

/** Renders `children` once the source has loaded; dims the old result while a new one loads. */
function Gate<T>({
  loaded,
  what,
  children,
}: {
  loaded: Loaded<T>;
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (loaded.data) {
    return (
      <div
        className={cn("transition-opacity", loaded.state === "loading" && "opacity-50")}
        aria-busy={loaded.state === "loading"}
      >
        {children(loaded.data)}
      </div>
    );
  }
  if (loaded.state === "loading") {
    return <p className="font-sans text-sm text-muted-foreground">Loading…</p>;
  }
  return <Problem loaded={loaded} what={what} />;
}

const PILL =
  "rounded-md px-3 py-1.5 font-sans text-sm transition-colors text-muted-foreground hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground";

function AdminReportingPage() {
  const search = Route.useSearch();
  const tab: TabId = search.tab ?? "overview";
  const days: AnalyticsDays = search.days ?? DEFAULT_DAYS;
  const reporting = useLoad<AdminReportingResult>((t) => adminApi.getReporting(t), "reporting");
  const analytics = useLoad<AdminAnalyticsResult>(
    (t) => adminApi.getAnalytics(t, days),
    `analytics-${days}`,
  );

  const showRange = tab !== "revenue";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-medium">Reporting</h1>
          {analytics.data && showRange && (
            <p className="font-sans text-xs text-muted-foreground">
              Last {analytics.data.days} days · Berlin time
            </p>
          )}
        </div>

        {showRange && (
          <nav aria-label="Time range" className="flex gap-1 rounded-lg border p-1">
            {RANGES.map((d) => (
              <Link
                key={d}
                to="/admin/reporting"
                search={{ tab, days: d }}
                replace
                aria-current={d === days ? "page" : undefined}
                className={PILL}
              >
                {d} days
              </Link>
            ))}
          </nav>
        )}
      </div>

      <nav aria-label="Report" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to="/admin/reporting"
            search={{ tab: t.id, days }}
            replace
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(PILL, "whitespace-nowrap")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <Gate loaded={analytics} what="analytics">
          {(a) => <OverviewTab analytics={a} />}
        </Gate>
      )}
      {tab === "search" && (
        <Gate loaded={analytics} what="search data">
          {(a) => <SearchTab analytics={a} />}
        </Gate>
      )}
      {tab === "social" && (
        <Gate loaded={reporting} what="social reporting">
          {(r) => (
            <Gate loaded={analytics} what="analytics">
              {(a) => <SocialTab analytics={a} reporting={r} />}
            </Gate>
          )}
        </Gate>
      )}
      {tab === "website" && (
        <Gate loaded={reporting} what="website reporting">
          {(r) => (
            <Gate loaded={analytics} what="analytics">
              {(a) => <WebsiteTab analytics={a} reporting={r} />}
            </Gate>
          )}
        </Gate>
      )}
      {tab === "revenue" && (
        <Gate loaded={reporting} what="revenue reporting">
          {(r) => <RevenueTab reporting={r} />}
        </Gate>
      )}
    </div>
  );
}
