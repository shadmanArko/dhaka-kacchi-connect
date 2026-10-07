import { describe, expect, it } from "bun:test";
import {
  berlinToday,
  nextBatchCampaign,
  previewUrl,
  slugify,
  SOURCE_CHOICES,
  sourceValue,
} from "./trackedLinks";

describe("slugify", () => {
  it("turns a human name into the tag format", () => {
    expect(slugify("Reel - Kacchi Pot!")).toBe("reel-kacchi-pot");
    expect(slugify("  Story: last call (Fri) ")).toBe("story-last-call-fri");
    expect(slugify("bio_link")).toBe("bio-link");
  });

  it("never ends with a hyphen, even when truncated", () => {
    const long = slugify(`${"a".repeat(47)} b`);
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("-")).toBe(false);
  });

  it("is empty for text with no usable characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("sourceValue", () => {
  const creator = SOURCE_CHOICES.find((c) => c.value === "creator")!;
  const instagram = SOURCE_CHOICES.find((c) => c.value === "instagram")!;

  it("prefixes a named place and leaves a fixed one alone", () => {
    expect(sourceValue(creator, "Ayesha Rahman")).toBe("creator-ayesha-rahman");
    expect(sourceValue(instagram, "ignored")).toBe("instagram");
  });
});

describe("nextBatchCampaign", () => {
  it("is the coming Saturday", () => {
    expect(nextBatchCampaign("2026-10-07")).toBe("batch-2026-10-10"); // Wednesday
    expect(nextBatchCampaign("2026-10-09")).toBe("batch-2026-10-10"); // Friday
    expect(nextBatchCampaign("2026-10-11")).toBe("batch-2026-10-17"); // Sunday -> next week
  });

  it("is the same day when today is the Saturday", () => {
    expect(nextBatchCampaign("2026-10-10")).toBe("batch-2026-10-10");
  });

  it("crosses month and year ends", () => {
    expect(nextBatchCampaign("2026-12-29")).toBe("batch-2027-01-02");
  });
});

describe("berlinToday", () => {
  it("uses the Berlin calendar day, not UTC", () => {
    expect(berlinToday(new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-08"); // 00:30 CEST
    expect(berlinToday(new Date("2026-10-07T21:30:00Z"))).toBe("2026-10-07");
  });
});

describe("previewUrl", () => {
  it("matches the server's link for the same inputs (same example as the worker test)", () => {
    expect(
      previewUrl(
        "https://dhakakacchi.com",
        {
          source: "instagram",
          medium: "story",
          campaign: "batch-2026-10-10",
          content: "story-last-call",
        },
        "/",
      ),
    ).toBe(
      "https://dhakakacchi.com/?utm_source=instagram&utm_medium=story&utm_campaign=batch-2026-10-10&utm_content=story-last-call",
    );
  });
});
