import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDay, num } from "./format";

export type ChartPoint = {
  day: string;
  value: number;
  /** Extra tooltip line, e.g. the second metric of the same day. */
  detail?: string;
};

const W = 640;
const PAD = 8;

function scale(points: ChartPoint[], height: number) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => height - PAD - (v / max) * (height - PAD * 2);
  return { max, x, y };
}

function linePath(points: ChartPoint[], height: number): string {
  const { x, y } = scale(points, height);
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
}

/**
 * A small hand-drawn area chart. There is deliberately no chart library: the panel
 * draws a handful of daily series, and a dependency for that would be heavier than
 * the page it serves. The SVG stretches to its container (strokes stay a constant
 * width); the hover marker and tooltip are HTML so they are not distorted by it.
 */
export function AreaChart({
  points,
  label,
  format = num,
  height = 168,
  className,
}: {
  points: ChartPoint[];
  /** What the series is, for the tooltip and the accessible name. */
  label: string;
  format?: (v: number) => string;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed font-sans text-sm text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        No data in this period yet.
      </div>
    );
  }

  const { max, x, y } = scale(points, height);
  const line = linePath(points, height);
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const active = hover === null ? null : points[hover];
  const leftPct = hover === null ? 0 : (x(hover) / W) * 100;

  function onMove(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (points.length - 1)));
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        style={{ height }}
        role="img"
        aria-label={`${label}, ${formatDay(points[0]!.day)} to ${formatDay(points[points.length - 1]!.day)}. Peak ${format(peak.value)} on ${formatDay(peak.day)}.`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-primary"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={PAD + g * (height - PAD * 2)}
              y2={PAD + g * (height - PAD * 2)}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1="0"
            x2={W}
            y1={height - PAD}
            y2={height - PAD}
            className="stroke-border"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {points.length > 1 && <path d={area} fill={`url(#${gradientId})`} />}
          {points.length > 1 && (
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <span className="pointer-events-none absolute left-0 top-0 font-sans text-[10px] tabular-nums text-muted-foreground">
          {format(max)}
        </span>

        {points.length === 1 && (
          <span
            className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: "50%", top: y(points[0]!.value) }}
          />
        )}

        {active && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-primary/40"
              style={{ left: `${leftPct}%` }}
            />
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
              style={{ left: `${leftPct}%`, top: y(active.value) }}
            />
            <div
              className={cn(
                "pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-md border bg-card px-2.5 py-1.5 font-sans text-xs shadow-lg",
                leftPct > 70 ? "-translate-x-full" : "translate-x-2",
              )}
              style={{ left: `${leftPct}%` }}
            >
              <p className="text-muted-foreground">{formatDay(active.day, true)}</p>
              <p className="font-medium tabular-nums">
                {format(active.value)}{" "}
                <span className="font-normal text-muted-foreground">{label}</span>
              </p>
              {active.detail && <p className="text-muted-foreground">{active.detail}</p>}
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between font-sans text-[10px] text-muted-foreground">
        <span>{formatDay(points[0]!.day)}</span>
        {points.length > 2 && (
          <span>{formatDay(points[Math.floor((points.length - 1) / 2)]!.day)}</span>
        )}
        <span>{points.length > 1 ? formatDay(points[points.length - 1]!.day) : ""}</span>
      </div>
    </div>
  );
}

/** A tiny trend line with no axes, for a card that shows one headline number. */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const points = values.map((value, i) => ({ day: String(i), value }));
  const h = 32;
  const { x, y } = scale(points, h);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full text-primary", className)}
      role="img"
      aria-label={label}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A horizontal bar list: label, a bar proportional to the largest value, the value. */
export function BarList({
  rows,
  format = num,
}: {
  rows: { label: string; value: number; detail?: string }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 font-sans text-sm">
            <span className="min-w-0 truncate" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 tabular-nums">
              {format(r.value)}
              {r.detail && <span className="ml-2 text-xs text-muted-foreground">{r.detail}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
