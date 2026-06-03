import type { AiMatchResult } from "@/lib/matchScoreAi";
import type {
  SingleMatchCheckResultPayload,
  SingleMatchEvidenceQuality,
  SingleMatchRequirementBreakdownItem,
  SingleMatchRequirementBucket,
  SingleMatchRequirementPriority,
  SingleMatchRequirementStatus,
} from "@/lib/singleMatch/types";

type ResumeSource = NonNullable<SingleMatchCheckResultPayload["resume_source"]>;

type RequirementDraft = {
  id: string;
  label: string;
  bucket: SingleMatchRequirementBucket;
  priority: SingleMatchRequirementPriority;
  weight: number;
  phrases: string[];
  tokens: string[];
};

type BuildAdvancedSingleMatchInsightsInput = {
  jobTitle: string;
  jobDescription: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  resumeText: string;
  resumeSource: ResumeSource;
  resumeCharsScored: number;
  jdCharsScored: number;
  baseAi: AiMatchResult;
};

type SourceQualityTier = "strong" | "medium" | "limited" | "insufficient";

const TOKEN_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "python", patterns: [/\bpython\b/i, /\bfastapi\b/i, /\bdjango\b/i, /\bflask\b/i] },
  { canonical: "java", patterns: [/\bjava\b/i, /\bspring boot\b/i, /\bspring\b/i] },
  { canonical: "dotnet", patterns: [/\b\.net\b/i, /\bdotnet\b/i, /\bc#\b/i, /\basp\.?net\b/i] },
  { canonical: "node", patterns: [/\bnode(?:\.js|js)?\b/i, /\bexpress(?:\.js|js)?\b/i] },
  { canonical: "go", patterns: [/\bgo(lang)?\b/i] },
  { canonical: "php", patterns: [/\bphp\b/i, /\blaravel\b/i] },
  { canonical: "react", patterns: [/\breact(?:\.js|js)?\b/i, /\bnext\.?js\b/i] },
  { canonical: "angular", patterns: [/\bangular\b/i] },
  { canonical: "vue", patterns: [/\bvue(?:\.js|js)?\b/i] },
  { canonical: "typescript", patterns: [/\btypescript\b/i] },
  { canonical: "javascript", patterns: [/\bjavascript\b/i, /\becmascript\b/i] },
  { canonical: "microservices", patterns: [/\bmicroservices?\b/i] },
  { canonical: "rest api", patterns: [/\brest(?:ful)? api(s)?\b/i, /\bapi gateway\b/i] },
  { canonical: "graphql", patterns: [/\bgraphql\b/i] },
  { canonical: "distributed systems", patterns: [/\bdistributed systems?\b/i, /\bevent-driven\b/i] },
  { canonical: "aws", patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { canonical: "azure", patterns: [/\bazure\b/i] },
  { canonical: "gcp", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { canonical: "docker", patterns: [/\bdocker\b/i, /\bcontaineri[sz]ation\b/i] },
  { canonical: "kubernetes", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { canonical: "terraform", patterns: [/\bterraform\b/i, /\binfrastructure as code\b/i] },
  { canonical: "devops", patterns: [/\bdevops\b/i, /\bsre\b/i] },
  { canonical: "ci/cd", patterns: [/\bci\/cd\b/i, /\bcontinuous integration\b/i, /\bcontinuous delivery\b/i, /\bgithub actions\b/i] },
  { canonical: "sql", patterns: [/\bsql\b/i, /\bpostgres(?:ql)?\b/i, /\bmysql\b/i] },
  { canonical: "kafka", patterns: [/\bkafka\b/i] },
  { canonical: "airflow", patterns: [/\bairflow\b/i] },
  { canonical: "spark", patterns: [/\bspark\b/i, /\bpyspark\b/i] },
  { canonical: "snowflake", patterns: [/\bsnowflake\b/i] },
  { canonical: "dbt", patterns: [/\bdbt\b/i] },
  { canonical: "salesforce", patterns: [/\bsalesforce\b/i] },
  { canonical: "apex", patterns: [/\bapex\b/i] },
  { canonical: "lwc", patterns: [/\blwc\b/i, /\blightning web components?\b/i] },
  { canonical: "qa", patterns: [/\bquality assurance\b/i, /\bqa\b/i] },
  { canonical: "selenium", patterns: [/\bselenium\b/i] },
  { canonical: "cypress", patterns: [/\bcypress\b/i] },
  { canonical: "playwright", patterns: [/\bplaywright\b/i] },
  { canonical: "postman", patterns: [/\bpostman\b/i, /\bapi testing\b/i] },
  { canonical: "jmeter", patterns: [/\bjmeter\b/i, /\bperformance testing\b/i, /\bload testing\b/i] },
  { canonical: "llm", patterns: [/\bllm\b/i, /\blarge language model\b/i, /\bopenai\b/i, /\banthropic\b/i, /\bgemini\b/i] },
  { canonical: "agents", patterns: [/\bagents?\b/i, /\bmulti-agent\b/i, /\bagentic\b/i] },
  { canonical: "langgraph", patterns: [/\blanggraph\b/i] },
  { canonical: "langchain", patterns: [/\blangchain\b/i] },
  { canonical: "autogen", patterns: [/\bautogen\b/i] },
  { canonical: "rag", patterns: [/\brag\b/i, /\bretrieval augmented generation\b/i, /\bretrieval-augmented generation\b/i] },
  { canonical: "vector db", patterns: [/\bvector dbs?\b/i, /\bvector databases?\b/i, /\bpinecone\b/i, /\bweaviate\b/i, /\bfaiss\b/i, /\bmilvus\b/i, /\bpgvector\b/i] },
  { canonical: "embeddings", patterns: [/\bembeddings?\b/i] },
  { canonical: "prompt engineering", patterns: [/\bprompt engineering\b/i, /\bprompt optimization\b/i] },
  { canonical: "stt/tts", patterns: [/\bstt\b/i, /\btts\b/i, /\bspeech to text\b/i, /\btext to speech\b/i] },
  { canonical: "voice systems", patterns: [/\bvoice systems?\b/i, /\bvoice ai\b/i, /\bvoice bot\b/i, /\bvoice application\b/i] },
  { canonical: "realtime", patterns: [/\breal-?time\b/i, /\blow-latency\b/i, /\bstreaming\b/i] },
  { canonical: "ownership", patterns: [/\bownership\b/i, /\bowned\b/i, /\bend-to-end\b/i] },
  { canonical: "mentoring", patterns: [/\bmentor(?:ed|ing)?\b/i, /\bcoached\b/i] },
  { canonical: "cross-functional collaboration", patterns: [/\bcross-functional\b/i, /\bstakeholder\b/i, /\bcollaborat(?:e|ion)\b/i] },
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueList(items: string[]): string[] {
  return items.filter((item, index, arr) => arr.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
}

function splitJdLines(jobDescription: string): string[] {
  return jobDescription
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\u2022•\-*]+\s*/, "").trim())
    .filter((line) => line.length >= 12);
}

function deriveSourceQualityTier(source: ResumeSource, resumeChars: number): SourceQualityTier {
  if (source === "none") return "insufficient";
  if (source === "experience_summary_or_skills") return "limited";
  if (source === "stored_resume_text" && resumeChars < 800) return "limited";
  if (source === "stored_resume_text" && resumeChars < 2200) return "medium";
  return "strong";
}

function tokenizeRequirement(label: string): string[] {
  const lower = label.toLowerCase();
  const matchedCanonicals = TOKEN_ALIASES.filter((entry) => entry.patterns.some((pattern) => pattern.test(lower))).map(
    (entry) => entry.canonical
  );
  const words = lower
    .split(/[^a-z0-9+.#/-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  return uniqueList([...matchedCanonicals, ...words]).slice(0, 12);
}

function requirementPhrases(label: string): string[] {
  return uniqueList(
    label
      .split(/[(),;/]| and /i)
      .map((part) => normalizeText(part.toLowerCase()))
      .filter((part) => part.length >= 4)
  ).slice(0, 10);
}

function buildRequirement(
  label: string,
  bucket: SingleMatchRequirementBucket,
  priority: SingleMatchRequirementPriority,
  weight: number
): RequirementDraft {
  return {
    id: slugify(`${bucket}-${label}`),
    label: normalizeText(label),
    bucket,
    priority,
    weight,
    phrases: requirementPhrases(label),
    tokens: tokenizeRequirement(label),
  };
}

function parseResponsibilities(jobDescription: string): string[] {
  const lines = splitJdLines(jobDescription);
  return uniqueList(
    lines.filter((line) => {
      const lower = line.toLowerCase();
      if (/^role overview|^what you.ll do|^what we.re looking for|^nice to have/.test(lower)) return false;
      return /\b(build|design|develop|create|integrate|collaborate|mentor|lead|own|architect|work on)\b/i.test(lower);
    })
  ).slice(0, 6);
}

function parseSenioritySignals(jobDescription: string): string[] {
  const jd = jobDescription.toLowerCase();
  const signals: string[] = [];
  if (/\bmentor\b|\bmentoring\b|\bcoach\b/.test(jd)) signals.push("Mentor junior engineers");
  if (/\bownership\b|\bowner(ship)?\b|\bend-to-end\b/.test(jd)) signals.push("Demonstrate ownership mindset");
  if (/\bcross-functional\b|\bcollaborate with cross-functional teams\b|\bstakeholder\b/.test(jd)) {
    signals.push("Collaborate across teams and stakeholders");
  }
  if (/\blead\b|\barchitect\b|\bdesign scalable\b/.test(jd)) signals.push("Lead technical design for scalable systems");
  return uniqueList(signals).slice(0, 4);
}

function parseDomainPlatformSignals(jobDescription: string): string[] {
  const lines = splitJdLines(jobDescription);
  const matched = lines.filter((line) =>
    /\b(cloud|distributed systems|event-driven|microservices|realtime|real-time|streaming|platform|vector|rag|voice|api|backend)\b/i.test(
      line
    )
  );
  return uniqueList(matched).slice(0, 5);
}

function buildRequirementSet(input: {
  jobDescription: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
}): RequirementDraft[] {
  const out: RequirementDraft[] = [];
  for (const label of input.mustHave.filter(Boolean).slice(0, 12)) {
    out.push(buildRequirement(label, "must_have_skill", "core", 1.35));
  }
  for (const label of parseResponsibilities(input.jobDescription)) {
    out.push(buildRequirement(label, "core_responsibility", "core", 1.2));
  }
  for (const label of parseSenioritySignals(input.jobDescription)) {
    out.push(buildRequirement(label, "seniority_ownership", "important", 0.9));
  }
  for (const label of parseDomainPlatformSignals(input.jobDescription)) {
    out.push(buildRequirement(label, "domain_platform", "important", 1.0));
  }
  for (const label of input.niceToHave.filter(Boolean).slice(0, 8)) {
    out.push(buildRequirement(label, "nice_to_have", "nice_to_have", 0.55));
  }
  for (const label of input.keywords.filter(Boolean).slice(0, 6)) {
    out.push(buildRequirement(label, "domain_platform", "important", 0.8));
  }
  return uniqueList(out.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item) as RequirementDraft);
}

function matchAnyPattern(text: string, token: string): boolean {
  const lowered = text.toLowerCase();
  const alias = TOKEN_ALIASES.find((entry) => entry.canonical === token);
  if (alias) return alias.patterns.some((pattern) => pattern.test(text));
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lowered);
}

function extractEvidenceForRequirement(resumeText: string, item: RequirementDraft): string[] {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length >= 10);
  const evidence: string[] = [];
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    const phraseHit = item.phrases.some((phrase) => lineLower.includes(phrase));
    const tokenHit = item.tokens.some((token) => matchAnyPattern(line, token));
    if (!phraseHit && !tokenHit) continue;
    if (evidence.some((existing) => existing.toLowerCase() === lineLower)) continue;
    evidence.push(line.slice(0, 220));
    if (evidence.length >= 2) break;
  }
  return evidence;
}

function evaluateRequirementStatus(
  item: RequirementDraft,
  resumeText: string,
  sourceTier: SourceQualityTier
): { status: SingleMatchRequirementStatus; evidence: string[]; rationale: string } {
  const evidence = extractEvidenceForRequirement(resumeText, item);
  const tokenMatches = item.tokens.filter((token) => matchAnyPattern(resumeText, token));
  const directPhraseMatches = item.phrases.filter((phrase) => resumeText.toLowerCase().includes(phrase));
  const tokenCoverage = item.tokens.length ? tokenMatches.length / item.tokens.length : 0;
  const phraseCoverage = item.phrases.length ? directPhraseMatches.length / item.phrases.length : 0;

  if (directPhraseMatches.length > 0 || tokenCoverage >= 0.6 || evidence.length >= 2) {
    return {
      status: "met",
      evidence,
      rationale: "The resume contains direct evidence aligned to this requirement.",
    };
  }

  if (tokenMatches.length > 0 || evidence.length === 1 || phraseCoverage >= 0.34) {
    return {
      status: "partially_met",
      evidence,
      rationale: "The resume shows adjacent or partial evidence, but not enough proof for a full match.",
    };
  }

  const canDowngradeToUnclear =
    sourceTier === "insufficient" ||
    (sourceTier === "limited" && item.bucket !== "must_have_skill") ||
    (sourceTier === "medium" && item.bucket === "seniority_ownership");

  if (canDowngradeToUnclear) {
    return {
      status: "unclear_due_to_source_quality",
      evidence: [],
      rationale: "The current resume source is too limited to confidently verify or reject this requirement.",
    };
  }

  return {
    status: "not_met",
    evidence: [],
    rationale: "No direct proof for this requirement was found in the scored resume text.",
  };
}

function scoreForStatus(status: SingleMatchRequirementStatus): number {
  switch (status) {
    case "met":
      return 1;
    case "partially_met":
      return 0.55;
    case "unclear_due_to_source_quality":
      return 0.3;
    default:
      return 0;
  }
}

function deriveEvidenceQuality(
  sourceTier: SourceQualityTier,
  breakdown: SingleMatchRequirementBreakdownItem[]
): SingleMatchEvidenceQuality {
  if (sourceTier === "insufficient") return "insufficient";
  const strongCount = breakdown.filter((item) => item.status === "met" && item.evidence.length > 0).length;
  const weakCount = breakdown.filter((item) => item.status === "unclear_due_to_source_quality").length;
  if (sourceTier === "strong" && strongCount >= Math.max(2, Math.ceil(breakdown.length * 0.3))) return "strong";
  if (weakCount >= Math.ceil(breakdown.length * 0.35) || sourceTier === "limited") return "limited";
  return "mixed";
}

function deriveConfidenceScore(
  sourceTier: SourceQualityTier,
  breakdown: SingleMatchRequirementBreakdownItem[],
  baseAi: AiMatchResult
): number {
  const sourceBase =
    sourceTier === "strong" ? 86 : sourceTier === "medium" ? 74 : sourceTier === "limited" ? 52 : 28;
  const met = breakdown.filter((item) => item.status === "met").length;
  const partial = breakdown.filter((item) => item.status === "partially_met").length;
  const unclear = breakdown.filter((item) => item.status === "unclear_due_to_source_quality").length;
  const noEvidence = breakdown.filter((item) => item.evidence.length === 0).length;
  let score = sourceBase + met * 2 + partial - unclear * 4 - Math.max(0, noEvidence - 2);
  if ((baseAi.risk_flags?.length ?? 0) >= 3) score -= 4;
  return Math.max(10, Math.min(96, Math.round(score)));
}

function deriveConfidenceReasons(
  sourceTier: SourceQualityTier,
  confidenceScore: number,
  breakdown: SingleMatchRequirementBreakdownItem[]
): string[] {
  const reasons: string[] = [];
  if (sourceTier === "strong") reasons.push("The match used a full resume source with enough text to validate most requirements.");
  if (sourceTier === "medium") reasons.push("The scorer used stored resume text, but some details may still be abbreviated.");
  if (sourceTier === "limited") reasons.push("The scorer relied on partial resume text or summary data, so some requirements remain harder to verify.");
  if (sourceTier === "insufficient") reasons.push("No reliable full resume text was available, so confidence is intentionally low.");
  const unclear = breakdown.filter((item) => item.status === "unclear_due_to_source_quality").length;
  if (unclear > 0) reasons.push(`${unclear} requirement${unclear === 1 ? "" : "s"} remain unclear because the resume source is incomplete.`);
  if (confidenceScore >= 80) reasons.push("Multiple requirements were backed by direct resume evidence.");
  else if (confidenceScore < 55) reasons.push("The final result should be treated cautiously because evidence quality is limited.");
  return uniqueList(reasons).slice(0, 4);
}

function computeWeightedScore(
  breakdown: SingleMatchRequirementBreakdownItem[],
  sourceTier: SourceQualityTier
): number {
  const totalWeight = breakdown.reduce((sum, item) => sum + item.weight, 0) || 1;
  const raw = breakdown.reduce((sum, item) => sum + item.weight * scoreForStatus(item.status), 0);
  let score = Math.round((raw / totalWeight) * 100);
  if (sourceTier === "limited") score = Math.min(score, 78);
  if (sourceTier === "insufficient") score = Math.min(score, 55);
  return Math.max(0, Math.min(100, score));
}

function deriveDecision(score: number, confidence: number): "Proceed" | "Hold" | "Reject" {
  if (confidence < 42 && score < 70) return "Hold";
  if (score >= 80 && confidence >= 65) return "Proceed";
  if (score >= 62) return "Hold";
  return "Reject";
}

function deriveResumeQualityFlags(source: ResumeSource, sourceTier: SourceQualityTier, resumeChars: number): string[] {
  const flags: string[] = [];
  if (source === "experience_summary_or_skills") flags.push("Scored on fallback summary / skills instead of a parsed full resume.");
  if (source === "none") flags.push("No full resume source was available for this run.");
  if (source === "stored_resume_text" && resumeChars < 800) flags.push("Stored resume text is short and may omit key evidence.");
  if (sourceTier === "limited" || sourceTier === "insufficient") flags.push("Source quality may understate the candidate's true fit.");
  return uniqueList(flags);
}

function topRequirementLabels(
  breakdown: SingleMatchRequirementBreakdownItem[],
  statuses: SingleMatchRequirementStatus[],
  limit: number
): string[] {
  return breakdown
    .filter((item) => statuses.includes(item.status))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((item) => item.label);
}

function deriveDecisionDrivers(
  breakdown: SingleMatchRequirementBreakdownItem[],
  evidenceQuality: SingleMatchEvidenceQuality
): string[] {
  const drivers: string[] = [];
  for (const label of topRequirementLabels(breakdown, ["met"], 3)) {
    drivers.push(`Strong proven alignment: ${label}`);
  }
  for (const label of topRequirementLabels(breakdown, ["partially_met"], 2)) {
    drivers.push(`Partial but relevant evidence: ${label}`);
  }
  for (const label of topRequirementLabels(breakdown, ["not_met", "unclear_due_to_source_quality"], 3)) {
    drivers.push(`Open concern: ${label}`);
  }
  drivers.push(`Evidence quality: ${evidenceQuality}`);
  return uniqueList(drivers).slice(0, 6);
}

function deriveInterviewFocusAreas(breakdown: SingleMatchRequirementBreakdownItem[]): string[] {
  return uniqueList(
    breakdown
      .filter((item) => item.priority !== "nice_to_have" && item.status !== "met")
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((item) => item.label)
  );
}

function deriveFollowUpQuestions(breakdown: SingleMatchRequirementBreakdownItem[]): string[] {
  return uniqueList(
    breakdown
      .filter(
        (item) =>
          item.status === "partially_met" ||
          item.status === "unclear_due_to_source_quality" ||
          (item.status === "not_met" && item.priority !== "nice_to_have")
      )
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((item) => `Ask the candidate to walk through a recent example showing ${item.label.toLowerCase()}.`)
  );
}

function deriveRiskFlags(
  breakdown: SingleMatchRequirementBreakdownItem[],
  sourceTier: SourceQualityTier,
  baseAi: AiMatchResult
): string[] {
  const flags = [...(baseAi.risk_flags ?? [])];
  if (sourceTier === "limited" || sourceTier === "insufficient") flags.push("Resume source quality limits verification confidence.");
  for (const label of topRequirementLabels(breakdown, ["not_met"], 2)) {
    flags.push(`Missing proof for high-priority requirement: ${label}`);
  }
  for (const label of topRequirementLabels(breakdown, ["unclear_due_to_source_quality"], 2)) {
    flags.push(`Unable to verify requirement from current resume source: ${label}`);
  }
  return uniqueList(flags).slice(0, 6);
}

function deriveRecommendedNextStep(
  decision: "Proceed" | "Hold" | "Reject",
  confidence: number,
  sourceTier: SourceQualityTier
): string {
  if ((sourceTier === "limited" || sourceTier === "insufficient") && confidence < 60) {
    return "Request a full updated resume or reparse the uploaded file before making a final decision.";
  }
  if (decision === "Proceed") return "Proceed to recruiter screen or technical interview with the focus areas below.";
  if (decision === "Hold") return "Keep in review and validate the open focus areas before deciding to proceed or reject.";
  return "Reject for this role unless new evidence materially changes the missing high-priority requirements.";
}

function deriveCanonicalLists(
  breakdown: SingleMatchRequirementBreakdownItem[],
  baseAi: AiMatchResult
): { matched_skills: string[]; missing_required_skills: string[] } {
  const matched = uniqueList([
    ...breakdown.filter((item) => item.status === "met").map((item) => item.label),
    ...(baseAi.strengths ?? []),
  ]).slice(0, 16);
  const missing = uniqueList([
    ...breakdown
      .filter((item) => item.priority !== "nice_to_have" && item.status === "not_met")
      .map((item) => item.label),
    ...(baseAi.gaps ?? []),
  ]).slice(0, 16);
  return { matched_skills: matched, missing_required_skills: missing };
}

export function buildAdvancedPureAiInsights(input: BuildAdvancedSingleMatchInsightsInput): Partial<SingleMatchCheckResultPayload> & {
  match_score: number;
  ai_match_score: number;
  ai_decision: string | null;
  decision: string | null;
  matched_skills: string[];
  missing_required_skills: string[];
  summary: string | null;
  reasoning: string | null;
  ai_evidence_highlights: string[];
} {
  const sourceTier = deriveSourceQualityTier(input.resumeSource, input.resumeCharsScored);
  const drafts = buildRequirementSet({
    jobDescription: input.jobDescription,
    mustHave: input.mustHave,
    niceToHave: input.niceToHave,
    keywords: input.keywords,
  });

  const requirement_breakdown: SingleMatchRequirementBreakdownItem[] = drafts.map((draft) => {
    const evaluated = evaluateRequirementStatus(draft, input.resumeText, sourceTier);
    return {
      id: draft.id,
      label: draft.label,
      bucket: draft.bucket,
      priority: draft.priority,
      status: evaluated.status,
      weight: draft.weight,
      evidence: evaluated.evidence,
      rationale: evaluated.rationale,
    };
  });

  const evidence_quality = deriveEvidenceQuality(sourceTier, requirement_breakdown);
  const confidence_score = deriveConfidenceScore(sourceTier, requirement_breakdown, input.baseAi);
  const match_score = computeWeightedScore(requirement_breakdown, sourceTier);
  const aiDecision = deriveDecision(match_score, confidence_score);
  const confidence_reasons = deriveConfidenceReasons(sourceTier, confidence_score, requirement_breakdown);
  const resume_quality_flags = deriveResumeQualityFlags(input.resumeSource, sourceTier, input.resumeCharsScored);
  const decision_drivers = deriveDecisionDrivers(requirement_breakdown, evidence_quality);
  const interview_focus_areas = deriveInterviewFocusAreas(requirement_breakdown);
  const follow_up_questions = deriveFollowUpQuestions(requirement_breakdown);
  const risk_flags = deriveRiskFlags(requirement_breakdown, sourceTier, input.baseAi);
  const recommended_next_step = deriveRecommendedNextStep(aiDecision, confidence_score, sourceTier);
  const canonical = deriveCanonicalLists(requirement_breakdown, input.baseAi);
  const ai_evidence_highlights = uniqueList([
    ...(input.baseAi.strengths ?? []),
    ...requirement_breakdown.flatMap((item) => item.evidence),
  ]).slice(0, 8);

  const summary =
    input.baseAi.recruiter_summary?.trim() ||
    `${match_score}% · ${canonical.matched_skills.length} aligned areas · ${canonical.missing_required_skills.length} hard gaps · confidence ${confidence_score}%`;

  const reasoningParts = [
    input.baseAi.reasoning?.trim(),
    confidence_reasons.length ? `Confidence: ${confidence_reasons.join(" ")}` : "",
    decision_drivers.length ? `Decision drivers: ${decision_drivers.join("; ")}` : "",
  ].filter(Boolean);

  return {
    match_score,
    ai_match_score: match_score,
    decision: aiDecision,
    ai_decision: aiDecision,
    matched_skills: canonical.matched_skills,
    missing_required_skills: canonical.missing_required_skills,
    reasoning: reasoningParts.join("\n\n").slice(0, 2800) || null,
    summary,
    ai_evidence_highlights,
    requirement_breakdown,
    confidence_score,
    confidence_reasons,
    resume_quality_flags,
    decision_drivers,
    risk_flags,
    interview_focus_areas,
    follow_up_questions,
    recommended_next_step,
    evidence_quality,
    resume_source: input.resumeSource,
    resume_chars_scored: input.resumeCharsScored,
    jd_chars_scored: input.jdCharsScored,
  };
}
