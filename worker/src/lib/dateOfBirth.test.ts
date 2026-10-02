import { describe, expect, it } from "bun:test";
import { dateOfBirthError } from "./dateOfBirth";

const now = new Date("2026-10-02T12:00:00Z");

describe("dateOfBirthError", () => {
  it("accepts valid dates", () => {
    expect(dateOfBirthError("1990-05-14", now)).toBeNull();
    expect(dateOfBirthError("2000-02-29", now)).toBeNull();
    expect(dateOfBirthError("2026-10-02", now)).toBeNull();
  });

  it("rejects wrong formats and garbage", () => {
    for (const bad of ["", "abc", "14-05-1990", "1990-5-14", "1990-05-14T00:00", "99999-01-01"]) {
      expect(dateOfBirthError(bad, now)).not.toBeNull();
    }
  });

  it("rejects impossible dates", () => {
    expect(dateOfBirthError("2001-02-29", now)).not.toBeNull();
    expect(dateOfBirthError("1990-13-01", now)).not.toBeNull();
    expect(dateOfBirthError("1990-04-31", now)).not.toBeNull();
    expect(dateOfBirthError("1990-00-10", now)).not.toBeNull();
  });

  it("rejects future and implausibly old dates", () => {
    expect(dateOfBirthError("2026-10-03", now)).not.toBeNull();
    expect(dateOfBirthError("3000-01-01", now)).not.toBeNull();
    expect(dateOfBirthError("1900-01-01", now)).not.toBeNull();
    expect(dateOfBirthError("1906-01-01", now)).toBeNull();
  });
});
