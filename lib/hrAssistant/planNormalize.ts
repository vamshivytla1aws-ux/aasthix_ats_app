import type { HrAssistantPlan } from "./types";

/** Parse "application 12", "app #34", "ref 88" → numeric id */
function extractApplicationIdFromMessage(m: string): number | undefined {
  const patterns = [
    /\bapplication\s*(?:#|id|number)?\s*[:#]?\s*(\d+)\b/i,
    /\bapp\s*(?:#|id)?\s*[:#]?\s*(\d+)\b/i,
    /\b(?:ref|reference)\s*[:#]?\s*(\d+)\b/i,
  ];
  for (const p of patterns) {
    const x = m.match(p);
    if (x?.[1]) {
      const n = Number(x[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** User is clearly asking for the interview board, not generic applications. */
function isInterviewListingIntent(userMessage: string) {
  const u = userMessage.toLowerCase();
  return (
    /\b(list|show|get|give|find|display|pull up|what are|upcoming|scheduled)\b[\s\S]{0,48}\binterviews?\b/.test(u) ||
    /\binterviews?\b[\s\S]{0,48}\b(list|show|get|scheduled|calendar|this month|last month|this week|today)\b/.test(u) ||
    /\binterview\s+(slots?|calendar|schedule)\b/.test(u)
  );
}

export function alignPlanWithUserMessage(plan: HrAssistantPlan, userMessage: string): HrAssistantPlan {
  const m = userMessage.toLowerCase();
  let next = { ...plan, filters: plan.filters ? { ...plan.filters } : undefined };

  if (plan.kind === "query" && isInterviewListingIntent(userMessage)) {
    next = { ...next, entity: "interviews" };
    // LLM often sends stage=Applied etc., which makes the query impossible with interview-style rows.
    if (next.filters?.stage) {
      const { stage: _s, ...rest } = next.filters;
      next.filters = Object.keys(rest).length ? rest : undefined;
    }
  }

  const candidateCue =
    /\b(candidate|applicants?|people|profiles?|resumes?|talent)\b/i.test(userMessage) ||
    /\bgive me\b.*\bcandidate/i.test(m);
  const jobCue = /\b(job|jobs|requisition|requisitions|opening|openings|role|roles|jd|posting|postings|hire for)\b/i.test(
    userMessage
  );

  if (
    candidateCue &&
    !jobCue &&
    next.entity === "jobs" &&
    (next.filters?.skills?.length || next.filters?.search_text?.trim())
  ) {
    next = { ...next, entity: "candidates" };
  }

  if (
    jobCue &&
    !candidateCue &&
    next.entity === "candidates" &&
    /\b(opening|requisition|posting|role we|job for)\b/i.test(m)
  ) {
    next = { ...next, entity: "jobs" };
  }

  if (next.entity === "candidates" && next.kind === "query") {
    const st = next.filters?.search_text?.trim();
    const hasSkills = (next.filters?.skills?.length ?? 0) > 0;
    if (st && st.length >= 2 && !hasSkills) {
      const looksLikeName = /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(st);
      if (!looksLikeName) {
        next.filters = {
          ...next.filters,
          skills: [...(next.filters?.skills ?? []), st],
          search_text: undefined,
        };
      }
    }
  }

  const appIdFromText = extractApplicationIdFromMessage(userMessage);
  if (
    appIdFromText &&
    next.kind === "query" &&
    (next.entity === "applications" ||
      next.entity === "interviews" ||
      next.entity === "offers" ||
      next.entity === null ||
      /\b(application|app|pipeline|ref|reference|who\s+is|assigned|owner)\b/i.test(userMessage))
  ) {
    const keepInterviews = next.entity === "interviews" && isInterviewListingIntent(userMessage);
    next = {
      ...next,
      entity: keepInterviews ? "interviews" : next.entity === "offers" ? "offers" : "applications",
      filters: {
        ...next.filters,
        application_id: appIdFromText,
      },
    };
  }

  return next;
}
