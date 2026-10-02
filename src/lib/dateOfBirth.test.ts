import { describe, expect, it } from "bun:test";
import { validateDateOfBirth } from "./dateOfBirth";

const today = new Date(2026, 9, 2); // 2 Oct 2026

describe("validateDateOfBirth", () => {
  it("accepts a normal date and returns ISO", () => {
    expect(validateDateOfBirth("15", "3", "1990", today)).toEqual({
      iso: "1990-03-15",
      errors: {},
    });
  });

  it("accepts a leap day only in a leap year", () => {
    expect(validateDateOfBirth("29", "02", "2000", today).iso).toBe("2000-02-29");
    expect(validateDateOfBirth("29", "02", "2001", today).errors.date).toBeDefined();
  });

  it("rejects out-of-range day and month", () => {
    expect(validateDateOfBirth("32", "01", "1990", today).errors.day).toBeDefined();
    expect(validateDateOfBirth("00", "01", "1990", today).errors.day).toBeDefined();
    expect(validateDateOfBirth("10", "13", "1990", today).errors.month).toBeDefined();
  });

  it("rejects impossible calendar dates", () => {
    expect(validateDateOfBirth("31", "04", "1990", today).errors.date).toBeDefined();
  });

  it("rejects short, future and too-old years", () => {
    expect(validateDateOfBirth("01", "01", "99", today).errors.year).toBeDefined();
    expect(validateDateOfBirth("01", "01", "2027", today).errors.year).toBeDefined();
    expect(validateDateOfBirth("01", "01", "1900", today).errors.year).toBeDefined();
  });

  it("rejects a date later this year", () => {
    expect(validateDateOfBirth("03", "10", "2026", today).errors.date).toBeDefined();
    expect(validateDateOfBirth("02", "10", "2026", today).iso).toBe("2026-10-02");
  });

  it("reports missing fields", () => {
    const { errors } = validateDateOfBirth("", "", "", today);
    expect(errors.day && errors.month && errors.year).toBeTruthy();
  });
});
