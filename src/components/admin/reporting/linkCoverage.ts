import type { LinkCoverage } from "@/lib/api";
import { percent, ratio } from "./format";

export type CoverageSegment = {
  key: keyof Omit<LinkCoverage, "total">;
  label: string;
  /** Plain words for what this group of visits is. */
  hint: string;
  value: number;
  share: number | null;
};

/**
 * The four groups of website visits, best (traceable to one link) to worst (nothing
 * known). Order matters: it is the order the bar and legend are drawn in.
 */
export function coverageSegments(c: LinkCoverage): CoverageSegment[] {
  const defs: Omit<CoverageSegment, "value" | "share">[] = [
    {
      key: "linked",
      label: "From a tagged link",
      hint: "Traceable to one post, story or message.",
    },
    {
      key: "otherTagged",
      label: "Tagged another way",
      hint: "An older bio link or a typo, so it can't be traced to one post.",
    },
    {
      key: "referral",
      label: "From a site, untagged",
      hint: "Facebook, Google and similar. We know the site, not the post.",
    },
    {
      key: "direct",
      label: "No source at all",
      hint: "Typed in, bookmarked, or shared from an app that hides where it came from (WhatsApp).",
    },
  ];
  return defs.map((d) => ({ ...d, value: c[d.key], share: ratio(c[d.key], c.total) }));
}

export function shareText(share: number | null): string {
  return share === null ? "—" : percent(share);
}
