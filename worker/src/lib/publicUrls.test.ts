import { describe, expect, it } from "bun:test";
import { derivePublicApiUrl } from "./publicUrls";

describe("derivePublicApiUrl", () => {
  it("uses an explicit value, without a trailing slash", () => {
    expect(derivePublicApiUrl("https://api.example.com/", "https://x.test", 8787)).toBe(
      "https://api.example.com",
    );
  });
  it("derives api.<host> from the production site URL", () => {
    expect(derivePublicApiUrl(undefined, "https://dhakakacchi.com", 8787)).toBe(
      "https://api.dhakakacchi.com",
    );
    expect(derivePublicApiUrl(undefined, "https://www.dhakakacchi.com", 8787)).toBe(
      "https://api.dhakakacchi.com",
    );
  });
  it("points at the local port in development", () => {
    expect(derivePublicApiUrl(undefined, "http://localhost:8080", 8787)).toBe(
      "http://localhost:8787",
    );
  });
});
