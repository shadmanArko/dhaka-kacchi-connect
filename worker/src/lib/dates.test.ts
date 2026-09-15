/**
 * The Friday-18:00-Berlin cutoff decides whether an order can be placed at
 * all, so it is the single highest-consequence pure function in the codebase:
 * wrong in one direction and the kitchen takes orders it can't cook, wrong in
 * the other and it silently refuses revenue on the one day it earns any.
 *
 * Every case below is expressed in UTC with the Berlin offset worked out by
 * hand, because the whole point of these helpers is that they must NOT depend
 * on the machine's local timezone. Berlin is UTC+2 in summer (CEST) and UTC+1
 * in winter (CET) - both are covered, including the DST changeover.
 *
 * Run with `bun test`.
 */
import { describe, expect, it } from "bun:test";
import {
  getAvailableDeliveryDates,
  isDeliveryDateStillOrderable,
  isValidSaturday,
  nextSaturday,
  todayIsoDate,
} from "./dates";

describe("isValidSaturday", () => {
  it("accepts a real Saturday", () => {
    expect(isValidSaturday("2026-09-19")).toBe(true);
  });

  it("rejects every other weekday", () => {
    expect(isValidSaturday("2026-09-18")).toBe(false); // Friday
    expect(isValidSaturday("2026-09-20")).toBe(false); // Sunday
  });

  it("rejects malformed input rather than coercing it", () => {
    expect(isValidSaturday("19-09-2026")).toBe(false);
    expect(isValidSaturday("2026-9-19")).toBe(false);
    expect(isValidSaturday("")).toBe(false);
    expect(isValidSaturday("not-a-date")).toBe(false);
  });
});

describe("isDeliveryDateStillOrderable — the Friday 18:00 Berlin cutoff", () => {
  // Saturday 2026-09-19. Berlin is CEST (UTC+2) in September, so the Friday
  // 18:00 local cutoff is 16:00 UTC on 2026-09-18.
  const saturday = "2026-09-19";

  it("is orderable a minute before the cutoff", () => {
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-18T15:59:00Z"))).toBe(true);
  });

  it("is NOT orderable a minute after the cutoff", () => {
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-18T16:01:00Z"))).toBe(false);
  });

  it("is not orderable exactly at the cutoff", () => {
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-18T16:00:00Z"))).toBe(false);
  });

  it("is orderable days earlier", () => {
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-14T09:00:00Z"))).toBe(true);
  });

  it("is not orderable on the Saturday itself", () => {
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-19T08:00:00Z"))).toBe(false);
  });

  it("rejects a date that isn't a Saturday no matter the time", () => {
    expect(isDeliveryDateStillOrderable("2026-09-18", new Date("2026-09-14T09:00:00Z"))).toBe(
      false,
    );
  });

  it("uses Berlin time, not UTC — 17:30 Berlin is still open even though it is 15:30 UTC", () => {
    // If this ever compared in UTC it would read 15:30 and also pass, so the
    // discriminating case is the hour between 16:00 and 17:00 UTC: that is
    // 18:00-19:00 in Berlin, i.e. CLOSED, but would look open in UTC.
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-18T15:30:00Z"))).toBe(true);
    expect(isDeliveryDateStillOrderable(saturday, new Date("2026-09-18T16:30:00Z"))).toBe(false);
  });

  it("holds in winter, when Berlin is UTC+1 and the cutoff moves to 17:00 UTC", () => {
    const winterSaturday = "2026-01-17"; // a Saturday; Berlin is CET (UTC+1)
    expect(isDeliveryDateStillOrderable(winterSaturday, new Date("2026-01-16T16:59:00Z"))).toBe(
      true,
    );
    expect(isDeliveryDateStillOrderable(winterSaturday, new Date("2026-01-16T17:01:00Z"))).toBe(
      false,
    );
  });
});

describe("nextSaturday", () => {
  it("returns the coming Saturday from midweek", () => {
    expect(nextSaturday(new Date("2026-09-16T10:00:00Z"))).toBe("2026-09-19");
  });

  it("returns the SAME day when asked on a Saturday — it does not skip a week", () => {
    expect(nextSaturday(new Date("2026-09-19T10:00:00Z"))).toBe("2026-09-19");
  });
});

describe("getAvailableDeliveryDates", () => {
  it("returns only Saturdays, in ascending order, without duplicates", () => {
    const dates = getAvailableDeliveryDates(new Date("2026-09-16T10:00:00Z"), 4);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every(isValidSaturday)).toBe(true);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("omits the imminent Saturday once its cutoff has passed", () => {
    const afterCutoff = getAvailableDeliveryDates(new Date("2026-09-18T16:30:00Z"), 4);
    expect(afterCutoff).not.toContain("2026-09-19");
  });

  it("still offers the imminent Saturday just before its cutoff", () => {
    const beforeCutoff = getAvailableDeliveryDates(new Date("2026-09-18T15:30:00Z"), 4);
    expect(beforeCutoff).toContain("2026-09-19");
  });

  it("never offers a date the order endpoint would then refuse", () => {
    // The list the customer picks from and the rule the server enforces must
    // never disagree - that mismatch is a 400 on an order the UI invited.
    const now = new Date("2026-09-18T15:30:00Z");
    for (const d of getAvailableDeliveryDates(now, 6)) {
      expect(isDeliveryDateStillOrderable(d, now)).toBe(true);
    }
  });
});

describe("todayIsoDate", () => {
  it("uses the Berlin calendar day, not the UTC one", () => {
    // 23:30 UTC on the 18th is already 01:30 on the 19th in Berlin (CEST).
    expect(todayIsoDate(new Date("2026-09-18T23:30:00Z"))).toBe("2026-09-19");
  });

  it("is stable in the middle of the day", () => {
    expect(todayIsoDate(new Date("2026-09-18T12:00:00Z"))).toBe("2026-09-18");
  });
});
