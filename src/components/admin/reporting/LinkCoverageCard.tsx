import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import type { LinkCoverage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { num } from "./format";
import { coverageSegments, shareText } from "./linkCoverage";

const BAR = ["bg-primary", "bg-primary/60", "bg-muted-foreground/60", "bg-muted-foreground/25"];

/**
 * How much of the website traffic can be traced to a specific link. The number to
 * push up: everything outside the first group is a visit nobody can credit to a post.
 */
export function LinkCoverageCard({ coverage }: { coverage: LinkCoverage }) {
  const segments = coverageSegments(coverage);

  return (
    <Card className="space-y-4 p-4">
      {coverage.total === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">No visits in this period yet.</p>
      ) : (
        <>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${shareText(s.share)}`).join(", ")}
          >
            {segments.map((s, i) =>
              s.value > 0 ? (
                <div
                  key={s.key}
                  className={BAR[i]}
                  style={{ width: `${(s.value / coverage.total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {segments.map((s, i) => (
              <li key={s.key} className="flex gap-3">
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", BAR[i])} />
                <div className="min-w-0">
                  <p className="font-sans text-sm">
                    <span className="font-medium tabular-nums">{shareText(s.share)}</span> {s.label}
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                      ({num(s.value)})
                    </span>
                  </p>
                  <p className="font-sans text-xs text-muted-foreground">{s.hint}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="font-sans text-xs text-muted-foreground">
        To move visits into the first group, put a{" "}
        <Link to="/admin/links" className="underline underline-offset-2">
          tagged link
        </Link>{" "}
        on every post, story, message and creator.
      </p>
    </Card>
  );
}
