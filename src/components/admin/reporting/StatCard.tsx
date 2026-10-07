import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One headline number with a label, an optional change, and a footnote. */
export function StatCard({
  label,
  value,
  change,
  hint,
  children,
  className,
}: {
  label: string;
  value: string;
  /** Pre-formatted change (e.g. "+3"); `tone` colours it. Omit when unknown. */
  change?: { text: string; tone: "up" | "down" | "flat" };
  hint?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("space-y-1 p-4", className)}>
      <p className="font-sans text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="font-sans text-2xl font-medium tabular-nums">{value}</p>
        {change && (
          <span
            className={cn(
              "font-sans text-xs font-medium tabular-nums",
              change.tone === "up" && "text-emerald-400",
              change.tone === "down" && "text-destructive",
              change.tone === "flat" && "text-muted-foreground",
            )}
          >
            {change.text}
          </span>
        )}
      </div>
      {hint && <p className="font-sans text-xs text-muted-foreground">{hint}</p>}
      {children}
    </Card>
  );
}

/** A titled block of the page. */
export function Panel({
  title,
  note,
  action,
  children,
  className,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-sans text-base font-medium">{title}</h2>
        {action}
      </div>
      {note && <p className="font-sans text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

/** Shown in place of a section whose source could not be read. */
export function Unavailable({ what }: { what: string }) {
  return (
    <Card className="border-dashed p-4 shadow-none">
      <p className="font-sans text-sm text-muted-foreground">
        {what} isn&apos;t available right now. The rest of this page is unaffected; it will appear
        once the nightly job has run on the server.
      </p>
    </Card>
  );
}
