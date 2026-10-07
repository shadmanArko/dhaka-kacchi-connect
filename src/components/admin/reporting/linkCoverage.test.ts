import { describe, expect, it } from "bun:test";
import { coverageSegments, shareText } from "./linkCoverage";

describe("coverageSegments", () => {
  it("orders best to worst and computes each share of all visits", () => {
    const segs = coverageSegments({
      total: 200,
      linked: 50,
      otherTagged: 10,
      referral: 40,
      direct: 100,
    });
    expect(segs.map((s) => s.key)).toEqual(["linked", "otherTagged", "referral", "direct"]);
    expect(segs.map((s) => s.share)).toEqual([0.25, 0.05, 0.2, 0.5]);
  });

  it("has no shares, rather than 0%, with no visits", () => {
    const segs = coverageSegments({ total: 0, linked: 0, otherTagged: 0, referral: 0, direct: 0 });
    expect(segs.every((s) => s.share === null)).toBe(true);
    expect(shareText(null)).toBe("—");
  });
});
