import type { HrAssistantPlan } from "./types";

function hasAny(text: string, parts: string[]) {
  return parts.some((p) => text.includes(p));
}

/**
 * Strict metric policy for high-risk operational questions.
 * Canonicalizes selected/placed/hired and interview lifecycle metric intents.
 */
export function applyStrictMetricPolicy(plan: HrAssistantPlan, userMessage: string): HrAssistantPlan {
  if (plan.kind !== "query") return plan;
  const m = userMessage.toLowerCase();

  const stageIntent = hasAny(m, ["selected", "placed", "hired"]);
  if (stageIntent) {
    return {
      ...plan,
      entity: "applications",
      analytics: { metric: "count" },
      filters: {
        ...plan.filters,
        stage: "Selected",
      },
    };
  }

  if (hasAny(m, ["interview completed", "no show", "interview scheduled", "interviews"])) {
    return {
      ...plan,
      entity: "interviews",
      analytics: plan.analytics?.metric ? plan.analytics : { metric: "count" },
    };
  }

  if (hasAny(m, ["group applications by stage", "count applications by stage"])) {
    return {
      ...plan,
      entity: "analytics",
      analytics: { metric: "group_by_stage" },
    };
  }

  return plan;
}

