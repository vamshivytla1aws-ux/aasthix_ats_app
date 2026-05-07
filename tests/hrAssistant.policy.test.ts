import { describe, expect, it } from "vitest";
import { applyStrictMetricPolicy } from "@/lib/hrAssistant/policy";
import { applyRelativeDatesFromMessage } from "@/lib/hrAssistant/relativeDates";
import type { HrAssistantPlan } from "@/lib/hrAssistant/types";

function basePlan(): HrAssistantPlan {
  return {
    kind: "query",
    entity: "applications",
    intent_summary: "test",
    filters: {},
    analytics: { metric: "count" },
  };
}

describe("hr assistant strict metric policy", () => {
  it("maps selected this week to applications count with Selected stage", () => {
    const out = applyStrictMetricPolicy(basePlan(), "how many selected this week?");
    expect(out.entity).toBe("applications");
    expect(out.analytics?.metric).toBe("count");
    expect(out.filters?.stage).toBe("Selected");
  });

  it("maps interview lifecycle queries to interviews entity", () => {
    const out = applyStrictMetricPolicy(basePlan(), "interview completed this month");
    expect(out.entity).toBe("interviews");
    expect(out.analytics?.metric).toBe("count");
  });
});

describe("hr assistant relative date engine", () => {
  it("adds this week date range in reporting timezone", () => {
    const out = applyRelativeDatesFromMessage(basePlan(), "selected this week");
    expect(out.filters?.date_from).toBeTruthy();
    expect(out.filters?.date_to).toBeTruthy();
    expect(new Date(String(out.filters?.date_from)).toString()).not.toBe("Invalid Date");
    expect(new Date(String(out.filters?.date_to)).toString()).not.toBe("Invalid Date");
  });
});

