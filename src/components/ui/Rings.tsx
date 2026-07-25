import { cn } from "@/lib/utils";

/** Three concentric pulsing rings, positioned by parent (needs `relative`). */
export function Rings({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute", className)} aria-hidden>
      {[240, 400, 560].map((size, i) => (
        <div
          key={size}
          className="absolute rounded-full border border-line -translate-x-1/2 -translate-y-1/2 animate-ring-pulse"
          style={{ width: size, height: size, animationDelay: `${i * 0.8}s` }}
        />
      ))}
    </div>
  );
}
