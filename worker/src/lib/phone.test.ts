import { describe, expect, it } from "bun:test";
import { isValidPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("turns German national numbers into +49", () => {
    expect(normalizePhone("0170 1234567")).toBe("+491701234567");
    expect(normalizePhone("0170/1234567")).toBe("+491701234567");
    expect(normalizePhone("(0170) 123-4567")).toBe("+491701234567");
  });

  it("keeps and cleans international numbers", () => {
    expect(normalizePhone("+49 170 1234567")).toBe("+491701234567");
    expect(normalizePhone("  +49-170-123 4567 ")).toBe("+491701234567");
    expect(normalizePhone("+880 1712 345678")).toBe("+8801712345678");
  });

  it("handles 00 prefixes and the (0) convention", () => {
    expect(normalizePhone("0049 170 1234567")).toBe("+491701234567");
    expect(normalizePhone("+49 (0)170 1234567")).toBe("+491701234567");
    expect(normalizePhone("+49 0170 1234567")).toBe("+491701234567");
  });

  it("leaves unprefixed non-national input for validation to reject", () => {
    expect(isValidPhone(normalizePhone("1701234567"))).toBe(false);
    expect(isValidPhone(normalizePhone(""))).toBe(false);
    expect(isValidPhone(normalizePhone("abc"))).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts E.164 and rejects the rest", () => {
    expect(isValidPhone("+491701234567")).toBe(true);
    expect(isValidPhone("+12")).toBe(false);
    expect(isValidPhone("+0491701234567")).toBe(false);
    expect(isValidPhone("491701234567")).toBe(false);
  });
});
