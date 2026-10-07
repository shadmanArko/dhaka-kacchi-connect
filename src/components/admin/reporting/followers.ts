import type { AnalyticsSection, FollowerPlatform } from "@/lib/api";

/** Sum of the platforms that reported a count, and how many did. */
export function totalFollowers(section: AnalyticsSection<FollowerPlatform[]>): {
  total: number;
  platforms: number;
  change: number | null;
} | null {
  if (section.status !== "ok") return null;
  const counted = section.data.filter((p) => p.current !== null);
  if (counted.length === 0) return null;
  const changes = counted.flatMap((p) => (p.change === null ? [] : [p.change]));
  return {
    total: counted.reduce((s, p) => s + (p.current ?? 0), 0),
    platforms: counted.length,
    change: changes.length > 0 ? changes.reduce((a, b) => a + b, 0) : null,
  };
}
