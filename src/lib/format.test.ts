import { afterEach, describe, expect, it } from "bun:test";
import i18n from "@/lib/i18n";
import { formatDate, formatEuro } from "./format";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("formatEuro / formatDate follow the language", () => {
  it("English keeps the €12.50 shape and an en-GB date", async () => {
    await i18n.changeLanguage("en");
    expect(formatEuro(1250)).toBe("€12.50");
    expect(formatDate("2026-10-10")).toBe("Saturday 10 October");
  });

  it("German uses 12,50 € and a German weekday", async () => {
    await i18n.changeLanguage("de");
    expect(formatEuro(1250).replace(/\s/g, " ")).toBe("12,50 €");
    expect(formatDate("2026-10-10")).toContain("Samstag");
    expect(formatDate("2026-10-10")).toContain("Oktober");
  });

  it("does not shift the day across timezones", async () => {
    await i18n.changeLanguage("en");
    // ICU versions differ on the September abbreviation ("Sep" vs "Sept").
    expect(formatDate("2026-09-19", "short")).toMatch(/^19 Sept?$/);
  });
});
