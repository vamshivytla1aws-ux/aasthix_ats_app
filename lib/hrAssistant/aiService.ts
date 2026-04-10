import type { HrActionSpec, HrAssistantPlan, HrEntity, HrIntentKind } from "./types";
import { PIPELINE_STAGES } from "./types";

const MODEL = "gpt-4o-mini";

const TEAM_ROLES = ["hiring_manager", "recruiter", "coordinator", "sourcer", "observer"] as const;

function normalizeTeamRole(v: unknown): HrActionSpec["team_role"] {
  const s = String(v || "");
  return (TEAM_ROLES as readonly string[]).includes(s) ? (s as HrActionSpec["team_role"]) : undefined;
}

const SYSTEM_PROMPT = `You are an HR assistant for an ATS. Convert the user's message into ONE JSON object only (no markdown).
Schema:
{
  "kind": "query" | "action" | "clarify",
  "entity": "candidates" | "jobs" | "applications" | "interviews" | "offers" | "analytics" | null,
  "intent_summary": "short English",
  "filters": {
    "skills": string[],
    "experience_min_years": number | null,
    "experience_max_years": number | null,
    "location": string | null,
    "stage": string | null,
    "job_status": string | null,
    "search_text": string | null,
    "date_from": string | null,
    "date_to": string | null,
    "job_id": number | null,
    "candidate_id": number | null,
    "application_id": number | null
  },
  "analytics": { "metric": "count" | "group_by_stage" | "trend_weekly_applications" | "board_totals" } | null,
  "action": {
    "type": "move_stage" | "schedule_interview" | "update_job_status" | "add_job_team_member",
    "application_id": number | null,
    "candidate_id": number | null,
    "job_id": number | null,
    "target_user_email": string | null,
    "new_stage": string | null,
    "interview_iso": string | null,
    "job_status": string | null,
    "team_role": "recruiter" | "hiring_manager" | "coordinator" | "sourcer" | "observer" | null
  } | null,
  "needs_clarification": boolean,
  "clarification_question": string | null
}

Rules:
- Pipeline stages must be one of: ${PIPELINE_STAGES.join(", ")}.
- "offers" means hired/offer stage: filter stage Selected.
- "interviews" = rows with interview_datetime set OR stage Interview OR interview_scheduled. For "this month"/"today"/"this week", set filters.date_from and filters.date_to as ISO-8601 UTC instants for that window (or rely on server-side parsing if you omit them).
- ENTITY DISAMBIGUATION (critical):
  - Words like candidate, applicant, profile, resume, people, talent + tech/stack → entity **candidates** and put tech in filters.skills (e.g. Java, React).
  - Words like job, requisition, opening, role, JD, posting + tech → entity **jobs**; same skills array is matched against title/description/company (no separate table required).
  - Never use entity "jobs" for "show me candidates who know X".
- Use kind "clarify" when the request is ambiguous or missing IDs/dates for destructive updates; set needs_clarification true and ask one concise question.
- For pure listing/search use kind "query" with appropriate entity and filters; omit action.
- For commands like "move application 12 to screening" use kind "action" with action filled and entity null or applications.
- Analytics: counts, breakdowns, weekly trends → entity "analytics" and analytics.metric set; for "how many X" use metric count.
- Cross-board / executive / dashboard overview ("how are we doing", "summary across hiring") → entity "analytics", analytics.metric **board_totals** (omit filters unless user narrows dates).
- If user mixes multiple unrelated requests, clarify.
- Follow-up turns: if Context from last assistant turn is provided, merge filters (e.g. add location) instead of starting over.
- Keep recommendations inclusive and compliant: avoid biased language; focus on skills and role fit.
- JSON only.`;

function asEntity(v: unknown): HrEntity | null {
  const s = String(v || "");
  const allowed: HrEntity[] = [
    "candidates",
    "jobs",
    "applications",
    "interviews",
    "offers",
    "analytics",
  ];
  return allowed.includes(s as HrEntity) ? (s as HrEntity) : null;
}

function asKind(v: unknown): HrIntentKind {
  return v === "action" || v === "clarify" ? v : "query";
}

export function coercePlan(raw: Record<string, unknown>): HrAssistantPlan {
  const kind = asKind(raw.kind);
  const entity = raw.entity === null || raw.entity === undefined ? null : asEntity(raw.entity);
  const intent_summary = String(raw.intent_summary || "Request").slice(0, 500);

  const f = raw.filters && typeof raw.filters === "object" ? (raw.filters as Record<string, unknown>) : {};
  const filters = {
    skills: Array.isArray(f.skills) ? f.skills.map((x) => String(x)).filter(Boolean).slice(0, 12) : undefined,
    experience_min_years: typeof f.experience_min_years === "number" ? f.experience_min_years : undefined,
    experience_max_years: typeof f.experience_max_years === "number" ? f.experience_max_years : undefined,
    location: f.location != null ? String(f.location) : undefined,
    stage: f.stage != null ? String(f.stage) : undefined,
    job_status: f.job_status != null ? String(f.job_status) : undefined,
    search_text: f.search_text != null ? String(f.search_text) : undefined,
    date_from: f.date_from != null ? String(f.date_from) : undefined,
    date_to: f.date_to != null ? String(f.date_to) : undefined,
    job_id: typeof f.job_id === "number" ? f.job_id : undefined,
    candidate_id: typeof f.candidate_id === "number" ? f.candidate_id : undefined,
    application_id: typeof f.application_id === "number" ? f.application_id : undefined,
  };

  const analyticsRaw = raw.analytics as Record<string, unknown> | null | undefined;
  let analytics: HrAssistantPlan["analytics"];
  if (analyticsRaw && typeof analyticsRaw === "object") {
    const m = String(analyticsRaw.metric || "count");
    if (m === "group_by_stage" || m === "trend_weekly_applications" || m === "board_totals") {
      analytics = { metric: m };
    } else analytics = { metric: "count" };
  }

  const a = raw.action && typeof raw.action === "object" ? (raw.action as Record<string, unknown>) : null;
  let action: HrAssistantPlan["action"];
  if (a && typeof a.type === "string") {
    const t = a.type;
    if (
      t === "move_stage" ||
      t === "schedule_interview" ||
      t === "update_job_status" ||
      t === "add_job_team_member"
    ) {
      action = {
        type: t,
        application_id: typeof a.application_id === "number" ? a.application_id : undefined,
        candidate_id: typeof a.candidate_id === "number" ? a.candidate_id : undefined,
        job_id: typeof a.job_id === "number" ? a.job_id : undefined,
        target_user_email: a.target_user_email != null ? String(a.target_user_email) : undefined,
        new_stage: a.new_stage != null ? String(a.new_stage) : undefined,
        interview_iso: a.interview_iso != null ? String(a.interview_iso) : undefined,
        job_status: a.job_status != null ? String(a.job_status) : undefined,
        team_role: normalizeTeamRole(a.team_role),
      };
    }
  }

  return {
    kind,
    entity,
    intent_summary,
    filters: Object.values(filters).some((v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
      ? filters
      : undefined,
    analytics,
    action,
    needs_clarification: Boolean(raw.needs_clarification),
    clarification_question: raw.clarification_question != null ? String(raw.clarification_question) : undefined,
  };
}

export async function parseUserIntent(input: {
  userMessage: string;
  history: { role: "user" | "assistant"; text: string }[];
  /** Structured recap of last assistant query for pronoun / filter follow-ups */
  structuredContext?: string;
}): Promise<HrAssistantPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      kind: "clarify",
      entity: null,
      intent_summary: "missing_api_key",
      needs_clarification: true,
      clarification_question:
        "OpenAI is not configured. Add OPENAI_API_KEY to your environment to use natural-language queries.",
    };
  }

  const hist = input.history
    .slice(-8)
    .map((h) => `${h.role}: ${h.text.slice(0, 1200)}`)
    .join("\n");

  const ctx = input.structuredContext?.trim();
  const userContent = [
    hist && `Prior chat:\n${hist}`,
    ctx && `Context from last assistant turn:\n${ctx.slice(0, 1500)}`,
    `Latest message:\n${input.userMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("hrAssistant openai", res.status, errText);
      return {
        kind: "clarify",
        entity: null,
        intent_summary: "openai_error",
        needs_clarification: true,
        clarification_question: "The AI service returned an error. Try again in a moment or rephrase your question.",
      };
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") {
      return {
        kind: "clarify",
        entity: null,
        intent_summary: "empty_response",
        needs_clarification: true,
        clarification_question: "I could not parse a response. Please rephrase your question.",
      };
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return coercePlan(parsed);
  } catch (e) {
    console.error("parseUserIntent", e);
    return {
      kind: "clarify",
      entity: null,
      intent_summary: "parse_error",
      needs_clarification: true,
      clarification_question: "Something went wrong interpreting that request. Try a shorter, specific question.",
    };
  }
}
