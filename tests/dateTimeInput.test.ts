import { describe, expect, it } from "vitest";
import { normalizeDateInput, normalizeTimeInput } from "@/lib/dateTimeInput";

describe("interview date input normalization", () => {
  it.each([
    ["10-06-2026", "2026-06-10"],
    ["10/06/2026", "2026-06-10"],
    ["2026-06-10", "2026-06-10"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDateInput(input)).toBe(expected);
  });

  it.each(["32-06-2026", "2026/06/10", "not-a-date"])("rejects %s", (input) => {
    expect(normalizeDateInput(input)).toBeNull();
  });
});

describe("interview time input normalization", () => {
  it.each([
    ["5:30 AM", "05:30"],
    ["05:30", "05:30"],
    ["17:30", "17:30"],
    ["5:30 PM", "17:30"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTimeInput(input)).toBe(expected);
  });

  it.each(["25:00", "5 PM", "not-a-time"])("rejects %s", (input) => {
    expect(normalizeTimeInput(input)).toBeNull();
  });
});
