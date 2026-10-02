import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "./rateLimiter";

describe("createRateLimiter", () => {
  it("allows up to the limit then blocks, per key", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
    expect(limiter.allow("b", 20)).toBe(true);
  });

  it("lets a key through again once the window has passed", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("a", 1001)).toBe(true);
  });
});
