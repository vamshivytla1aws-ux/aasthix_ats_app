import { describe, expect, it } from "vitest";
import {
  ATS_TIMEZONE_LABEL,
  formatAtsDate,
  formatAtsDateTimeWithZone,
  formatAtsTime,
  kolkataLocalToUtcIso,
} from "@/lib/timezones";

describe("ATS timezone utilities", () => {
  it("converts an IST form value to a UTC instant", () => {
    expect(kolkataLocalToUtcIso("2026-06-10", "05:30")).toBe("2026-06-10T00:00:00.000Z");
  });

  it("rejects incomplete form values", () => {
    expect(kolkataLocalToUtcIso("2026-06-10", "")).toBeNull();
    expect(kolkataLocalToUtcIso("10-06-2026", "05:30")).toBeNull();
  });

  it("formats dates and times consistently in IST", () => {
    const instant = "2026-06-10T00:00:00.000Z";
    expect(formatAtsDate(instant)).toContain("10 Jun 2026");
    expect(formatAtsTime(instant)).toContain("05:30");
    expect(formatAtsDateTimeWithZone(instant)).toContain(ATS_TIMEZONE_LABEL);
  });
});
