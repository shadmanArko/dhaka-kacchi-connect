import { describe, expect, it } from "bun:test";
import {
  buildTrackedUrl,
  isValidSource,
  normalizePostUrl,
  normalizeTag,
  validateTags,
} from "./trackedLinks";

const good = {
  source: "instagram",
  medium: "story",
  campaign: "batch-2026-10-10",
  content: "story-last-call",
};

describe("validateTags", () => {
  it("accepts a well-formed set", () => {
    expect(validateTags(good, "/")).toEqual([]);
    expect(
      validateTags({ ...good, source: "creator-ayesha", medium: "creator" }, "/order"),
    ).toEqual([]);
  });

  it("accepts the existing seeded content value bio_link", () => {
    expect(validateTags({ ...good, content: "bio_link" }, "/")).toEqual([]);
  });

  it("rejects the typos that would silently split a post's numbers", () => {
    expect(validateTags({ ...good, source: "insta" }, "/")).toHaveLength(1);
    expect(validateTags({ ...good, source: "Instagram" }, "/")).toHaveLength(1); // not normalised here
    expect(validateTags({ ...good, medium: "social" }, "/")).toHaveLength(1);
    expect(validateTags({ ...good, content: "Reel Kacchi" }, "/")).toHaveLength(1);
    expect(validateTags({ ...good, campaign: "a" }, "/")).toHaveLength(1);
  });

  it("requires a name after creator-/community-/qr-", () => {
    expect(isValidSource("creator")).toBe(false);
    expect(isValidSource("creator-")).toBe(false);
    expect(isValidSource("creator-a")).toBe(false); // one character is not a name
    expect(isValidSource("qr-menu-card")).toBe(true);
    expect(isValidSource("tiktok")).toBe(false);
  });

  it("rejects hostile or malformed destinations", () => {
    for (const bad of ["order", "//evil.example", "/a?x=1", "/a#b", "/A", "/a b", "https://x.y"]) {
      expect(validateTags(good, bad).length).toBeGreaterThan(0);
    }
  });

  it("reports every problem at once", () => {
    expect(
      validateTags({ source: "x", medium: "y", campaign: "z", content: "w" }, "o"),
    ).toHaveLength(5);
  });
});

describe("normalizeTag", () => {
  it("only trims and lowercases", () => {
    expect(normalizeTag("  Story-Last-Call ")).toBe("story-last-call");
    expect(normalizeTag("Reel Kacchi")).toBe("reel kacchi"); // still invalid afterwards
  });
});

describe("buildTrackedUrl", () => {
  it("builds the link with a fixed parameter order", () => {
    expect(buildTrackedUrl("https://dhakakacchi.com", good, "/")).toBe(
      "https://dhakakacchi.com/?utm_source=instagram&utm_medium=story&utm_campaign=batch-2026-10-10&utm_content=story-last-call",
    );
  });

  it("handles a trailing slash on the site url and a sub-path", () => {
    expect(buildTrackedUrl("https://dhakakacchi.com/", good, "/order")).toBe(
      "https://dhakakacchi.com/order?utm_source=instagram&utm_medium=story&utm_campaign=batch-2026-10-10&utm_content=story-last-call",
    );
  });

  it("is deterministic", () => {
    expect(buildTrackedUrl("https://a.b", good, "/")).toBe(
      buildTrackedUrl("https://a.b", good, "/"),
    );
  });
});

describe("normalizePostUrl (cases mirrored in the warehouse tests)", () => {
  const cases: [string, string | null][] = [
    ["https://www.instagram.com/p/DAbc123/", "https://instagram.com/p/DAbc123"],
    [
      "https://www.instagram.com/p/DAbc123/?utm_source=ig_web_copy_link&igsh=x",
      "https://instagram.com/p/DAbc123",
    ],
    ["http://instagram.com/reel/XyZ/", "https://instagram.com/reel/XyZ"],
    [
      "https://www.facebook.com/dhakakacchi/posts/123456#comments",
      "https://facebook.com/dhakakacchi/posts/123456",
    ],
    ["https://m.facebook.com/story.php", "https://facebook.com/story.php"],
    ["https://www.threads.net/@dhakakacchi/post/ABC/", "https://threads.net/@dhakakacchi/post/ABC"],
    ["https://youtu.be/abc123", "https://youtu.be/abc123"],
    ["https://www.youtube.com/shorts/abc123", "https://youtube.com/shorts/abc123"],
    ["https://instagram.com/", null],
    ["https://example.com/p/1", null],
    ["https://evil-instagram.com/p/1", null],
    ["not a url", null],
    ["javascript:alert(1)", null],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      expect(normalizePostUrl(input)).toBe(expected);
    });
  }
});
