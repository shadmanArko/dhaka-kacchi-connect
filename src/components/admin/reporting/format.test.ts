import { describe, expect, it } from "bun:test";
import {
  ago,
  formatDay,
  humanizeEvent,
  MISSING,
  num,
  pathOf,
  percent,
  platformLabel,
  ratio,
  signed,
  watchTime,
} from "./format";

describe("missing values are never shown as zero", () => {
  it("num/percent/signed render a dash for null", () => {
    expect(num(null)).toBe(MISSING);
    expect(percent(null)).toBe(MISSING);
    expect(signed(null)).toBe(MISSING);
    expect(num(0)).toBe("0");
  });

  it("ratio is null, not 0%, when there is nothing to divide by", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("signed", () => {
  it("uses a real minus sign and no sign for zero", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-2)).toBe("−2");
    expect(signed(0)).toBe("0");
    expect(signed(1234)).toBe("+1,234");
  });
});

describe("formatDay", () => {
  it("shows the calendar day it was given, whatever the viewer's timezone", () => {
    const original = process.env.TZ;
    for (const tz of ["Pacific/Honolulu", "Asia/Dhaka", "Europe/Berlin", "UTC"]) {
      process.env.TZ = tz;
      expect(formatDay("2026-10-07")).toBe("7 Oct");
      expect(formatDay("2026-01-01")).toBe("1 Jan");
    }
    process.env.TZ = original;
  });

  it("can include the year", () => {
    expect(formatDay("2026-10-07", true)).toBe("7 Oct 2026");
  });
});

describe("watchTime", () => {
  it("picks a readable unit", () => {
    expect(watchTime(0)).toBe("0 min");
    expect(watchTime(35)).toBe("35 min");
    expect(watchTime(60)).toBe("1 h");
    expect(watchTime(125)).toBe("2 h 5 min");
  });
});

describe("pathOf", () => {
  it("strips the origin but keeps path and query", () => {
    expect(pathOf("https://dhakakacchi.com/")).toBe("/");
    expect(pathOf("https://www.dhakakacchi.com/pages/history.html")).toBe("/pages/history.html");
    expect(pathOf("https://dhakakacchi.com/order?x=1")).toBe("/order?x=1");
  });

  it("returns a non-URL unchanged", () => {
    expect(pathOf("/order")).toBe("/order");
  });
});

describe("labels", () => {
  it("names the platforms and falls back for unknown ones", () => {
    expect(platformLabel("youtube")).toBe("YouTube");
    expect(platformLabel("tiktok")).toBe("Tiktok");
  });

  it("turns event identifiers into words", () => {
    expect(humanizeEvent("order_cart_started")).toBe("Order cart started");
  });
});

describe("ago", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("describes freshness", () => {
    expect(ago("2026-10-07T11:59:00Z", now)).toBe("just now");
    expect(ago("2026-10-07T11:01:00Z", now)).toBe("59 min ago");
    expect(ago("2026-10-07T11:00:00Z", now)).toBe("1 h ago");
    expect(ago("2026-10-07T03:25:00Z", now)).toBe("9 h ago");
    expect(ago("2026-10-04T12:00:00Z", now)).toBe("3 d ago");
    expect(ago(null, now)).toBe("never");
  });
});
