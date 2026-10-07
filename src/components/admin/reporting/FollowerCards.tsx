import { Card } from "@/components/ui/card";
import type { AnalyticsSection, FollowerPlatform } from "@/lib/api";
import { Sparkline } from "./charts";
import { changeOf, formatDay, num, platformLabel, signed } from "./format";
import { Unavailable } from "./StatCard";

const PLATFORM_ORDER = ["instagram", "facebook", "threads", "youtube"];

/**
 * One card per platform, ALWAYS all four: a platform with no reading yet is shown as
 * such rather than silently missing, since a follower history cannot be backfilled
 * and a gap is worth noticing.
 */
export function FollowerCards({ section }: { section: AnalyticsSection<FollowerPlatform[]> }) {
  if (section.status === "unavailable") return <Unavailable what="Follower counts" />;
  const byPlatform = new Map(section.data.map((p) => [p.platform, p]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PLATFORM_ORDER.map((platform) => {
        const p = byPlatform.get(platform);
        const trend = p ? changeOf(p.change, signed(p.change)) : undefined;
        const values = p
          ? p.history.flatMap((h) => (h.followers === null ? [] : [h.followers]))
          : [];
        return (
          <Card key={platform} className="space-y-1 p-4">
            <p className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
              {platformLabel(platform)}
            </p>
            {!p ? (
              <>
                <p className="font-sans text-2xl font-medium text-muted-foreground">—</p>
                <p className="font-sans text-xs text-muted-foreground">No reading yet.</p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="font-sans text-2xl font-medium tabular-nums">
                    {p.current === null ? "Hidden" : num(p.current)}
                  </p>
                  {trend && (
                    <span
                      className={
                        trend.tone === "up"
                          ? "font-sans text-xs font-medium text-emerald-400"
                          : trend.tone === "down"
                            ? "font-sans text-xs font-medium text-destructive"
                            : "font-sans text-xs font-medium text-muted-foreground"
                      }
                    >
                      {trend.text}
                    </span>
                  )}
                </div>
                <p className="font-sans text-xs text-muted-foreground">
                  {p.current === null
                    ? "The platform doesn't report this count."
                    : p.change !== null
                      ? `since ${formatDay(p.since)}`
                      : `Tracking since ${formatDay(p.since)} — change shows from the second day.`}
                </p>
                <Sparkline
                  values={values}
                  label={`${platformLabel(platform)} followers over time`}
                />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
