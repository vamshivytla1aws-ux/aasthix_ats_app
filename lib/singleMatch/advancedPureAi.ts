import { createEmbeddingsBatch } from "@/lib/embeddings/openaiEmbeddings";
import type { AiMatchResult } from "@/lib/matchScoreAi";
import type {
  SingleMatchCheckResultPayload,
  SingleMatchEvidenceQuality,
  SingleMatchFitLevel,
  SingleMatchRequirementBreakdownItem,
  SingleMatchRequirementBucket,
  SingleMatchRequirementMatchType,
  SingleMatchRequirementPriority,
  SingleMatchRequirementStatus,
  SingleMatchScoreBreakdown,
  SingleMatchScoreBreakdownDetail,
} from "@/lib/singleMatch/types";

type ResumeSource = NonNullable<SingleMatchCheckResultPayload["resume_source"]>;

type RequirementCategory =
  | "must_have_skills"
  | "experience"
  | "responsibilities"
  | "nice_to_have_skills"
  | "domain_cloud_education"
  | "location_or_notice"
  | "education_or_certification";

type RequirementDraft = {
  id: string;
  requirement: string;
  bucket: SingleMatchRequirementBucket;
  priority: SingleMatchRequirementPriority;
  category: RequirementCategory;
  phrases: string[];
  normalizedTerms: string[];
  equivalents: string[];
  specialized: boolean;
  maxScore: number;
};

type ResumeSignal = {
  line: string;
  normalized: string;
  terms: string[];
};

type RequirementEvaluation = {
  draft: RequirementDraft;
  status: SingleMatchRequirementStatus;
  matchType: SingleMatchRequirementMatchType;
  credit: number;
  evidence: string[];
  reason: string;
  similarityScore: number;
  confidence: number;
  unknownAction?: string | null;
  synonymMatches: string[];
  normalizedMatches: string[];
  fuzzyMatches: string[];
  semanticMatches: string[];
};

type BuildAdvancedSingleMatchInsightsInput = {
  jobTitle: string;
  jobDescription: string;
  experienceRequirement?: string | null;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  resumeText: string;
  resumeSource: ResumeSource;
  resumeCharsScored: number;
  jdCharsScored: number;
  baseAi: AiMatchResult;
  embeddingProvider?: (texts: string[]) => Promise<number[][]>;
};

type SourceQualityTier = "strong" | "medium" | "limited" | "insufficient";

type ScoreBucket = {
  score: number;
  max_score: number;
  details: string[] | string;
};

type GapAuditEntry = {
  requirement: string;
  status: SingleMatchRequirementStatus;
  reason: string;
};

type ScoreCap = {
  code:
    | "must_have_missing_cap"
    | "experience_cap"
    | "role_family_cap"
    | "mandatory_requirement_cap";
  limit: number;
  reason: string;
};

const SCORE_WEIGHTS = {
  must_have_skills: 35,
  experience: 20,
  responsibilities: 20,
  nice_to_have_skills: 10,
  domain_cloud_education: 10,
  resume_evidence_quality: 5,
} as const;

const STRONG_SEMANTIC_THRESHOLD = 0.82;
const PARTIAL_SEMANTIC_THRESHOLD = 0.72;

const PROTECTED_ATTRIBUTE_PATTERNS = [
  /\bage\b/i,
  /\bgender\b/i,
  /\breligion\b/i,
  /\bcaste\b/i,
  /\brace\b/i,
  /\bmarital status\b/i,
  /\bnationality\b/i,
  /\bphoto\b/i,
  /\bdisability\b/i,
];

const SKILL_EQUIVALENTS: Record<string, string[]> = {
  "python backend": ["Python", "FastAPI", "Django", "Flask", "asyncio", "Celery", "backend services"],
  "restful apis": ["REST", "REST APIs", "RESTful APIs", "FastAPI", "API Gateway", "controller", "endpoint"],
  microservices: [
    "microservices",
    "distributed systems",
    "API Gateway",
    "gRPC services",
    "service mesh",
    "multi-service platform",
    "backend services",
  ],
  "distributed systems": [
    "distributed systems",
    "microservices",
    "gRPC",
    "Redis",
    "Celery",
    "message queue",
    "PubSub",
    "event-driven systems",
  ],
  "event-driven systems": [
    "Celery",
    "Redis queue",
    "Redis PubSub",
    "Kafka",
    "RabbitMQ",
    "SQS",
    "SNS",
    "async processing",
    "priority queue",
    "worker concurrency",
  ],
  "llm frameworks": [
    "LangChain",
    "LangGraph",
    "AutoGen",
    "CrewAI",
    "LlamaIndex",
    "multi-agent orchestration",
    "agent orchestration",
    "LLM gateway",
    "LLM agents",
  ],
  "agent frameworks": [
    "LangGraph",
    "LangChain",
    "AutoGen",
    "CrewAI",
    "multi-agent systems",
    "multi-agent orchestration",
    "supervisor agent",
    "specialist agents",
  ],
  "ai agents": [
    "AI agents",
    "multi-agent",
    "agent orchestration",
    "LangGraph",
    "LLM agents",
    "AI-powered agents",
    "agentic workflows",
  ],
  "rag systems": [
    "RAG",
    "RAG pipelines",
    "retrieval augmented generation",
    "retrieval-augmented generation",
    "vector search",
    "document retrieval",
    "Pinecone vector search",
  ],
  "vector databases": ["Pinecone", "Weaviate", "Chroma", "FAISS", "Milvus", "Qdrant", "vector DB", "vector database", "vector search"],
  embeddings: ["embeddings", "vector embeddings", "semantic search", "vector search", "Pinecone"],
  "cloud platforms": ["AWS", "AWS S3", "GCP", "Azure", "Docker", "Kubernetes", "CI/CD", "Nginx", "Linux", "deployment automation"],
  "real-time architecture": ["WebSockets", "Socket.io", "SSE", "server-sent events", "gRPC streaming", "Redis PubSub", "real-time streaming", "live monitoring"],
  "voice systems": ["STT", "TTS", "speech-to-text", "text-to-speech", "voice bot", "voice agent", "telephony", "audio streaming", "real-time voice"],
  mcp: ["MCP", "Model Context Protocol", "tool protocol", "agent tool framework"],
};

const EXTRA_EQUIVALENTS: Record<string, string[]> = {
  aws: ["Amazon Web Services", "EC2", "S3", "Lambda"],
  azure: ["Microsoft Azure", "Azure DevOps"],
  gcp: ["Google Cloud", "BigQuery"],
  react: ["React.js", "Next.js"],
  sql: ["PostgreSQL", "Postgres", "MySQL", "SQL Server"],
  docker: ["containerization", "containers"],
  kubernetes: ["K8s"],
  "ci/cd": ["continuous integration", "continuous delivery", "GitHub Actions", "Jenkins", "GitLab CI"],
  rag: ["retrieval augmented generation", "retrieval-augmented generation"],
  realtime: ["real-time", "realtime", "streaming", "server-sent events", "WebSockets", "gRPC streaming"],
  "rest api": ["REST API", "REST APIs", "RESTful APIs", "endpoint", "API gateway"],
  "voice systems": ["voice ai", "voice bot", "stt", "tts", "speech to text", "text to speech"],
};

const GENERIC_TERMS = new Set([
  "ability",
  "across",
  "advanced",
  "and",
  "application",
  "applications",
  "backend",
  "build",
  "building",
  "candidate",
  "collaborate",
  "collaboration",
  "cross",
  "crossfunctional",
  "design",
  "develop",
  "development",
  "engineer",
  "engineering",
  "experience",
  "familiarity",
  "framework",
  "frameworks",
  "good",
  "hands",
  "have",
  "immediate",
  "knowledge",
  "looking",
  "mentor",
  "platform",
  "platforms",
  "proficiency",
  "real",
  "required",
  "role",
  "scalable",
  "senior",
  "skills",
  "software",
  "solutions",
  "strong",
  "systems",
  "team",
  "teams",
  "using",
  "what",
  "with",
  "years",
]);

function normalizeText(text: string): string {
  return String(text || "")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#/. -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return normalizeForMatch(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function uniqueList(items: string[]): string[] {
  return items.filter((item, index, array) => array.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return uniqueList(
    normalizeForMatch(text)
      .split(/[^a-z0-9+#/.]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
      .filter((part) => !GENERIC_TERMS.has(part))
  );
}

function fuzzyTokenCoverage(required: string[], candidate: string[]): { score: number; matches: string[] } {
  const candidateSet = new Set(candidate);
  const matches: string[] = [];
  let covered = 0;
  for (const req of required) {
    if (candidateSet.has(req)) {
      covered += 1;
      matches.push(req);
      continue;
    }
    const fuzzy = candidate.find((cand) => req.includes(cand) || cand.includes(req));
    if (fuzzy && Math.min(req.length, fuzzy.length) >= 4) {
      covered += 0.75;
      matches.push(fuzzy);
    }
  }
  const denominator = required.length || 1;
  return { score: covered / denominator, matches: uniqueList(matches) };
}

function splitLines(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line.replace(/^[\u2022*.-]+\s*/, "")))
    .filter((line) => line.length >= 8);
}

function splitSentenceChunks(text: string): string[] {
  return uniqueList(
    String(text || "")
      .split(/(?<=[.!?])\s+|\r?\n/)
      .map((part) => normalizeText(part))
      .filter((part) => part.length >= 20)
  ).slice(0, 120);
}

function cleanRequirementText(text: string): string {
  return normalizeText(
    text
      .replace(/^(what you'll do|what we’re looking for|what we're looking for|nice to have|role overview)\s*:?/i, "")
      .replace(/^(design and develop|design|develop|build|work on|integrate|collaborate with|mentor|lead|own)\s+/i, "")
  );
}

function deriveSourceQualityTier(source: ResumeSource, resumeChars: number): SourceQualityTier {
  if (source === "none") return "insufficient";
  if (source === "experience_summary_or_skills") return "limited";
  if (source === "stored_resume_text" && resumeChars < 900) return "limited";
  if (source === "stored_resume_text" && resumeChars < 2600) return "medium";
  return "strong";
}

function classifyBucket(category: RequirementCategory): {
  bucket: SingleMatchRequirementBucket;
  priority: SingleMatchRequirementPriority;
} {
  switch (category) {
    case "must_have_skills":
      return { bucket: "must_have_skill", priority: "core" };
    case "experience":
      return { bucket: "seniority_ownership", priority: "core" };
    case "responsibilities":
      return { bucket: "core_responsibility", priority: "core" };
    case "nice_to_have_skills":
      return { bucket: "nice_to_have", priority: "nice_to_have" };
    case "domain_cloud_education":
    case "education_or_certification":
    case "location_or_notice":
    default:
      return { bucket: "domain_platform", priority: category === "location_or_notice" ? "important" : "important" };
  }
}

function buildNormalizedTerms(requirement: string): string[] {
  const normalized = normalizeForMatch(requirement);
  const terms = tokenize(normalized);
  const equivalents: string[] = [];
  const lower = normalized;
  for (const [canonical, aliases] of Object.entries(SKILL_EQUIVALENTS)) {
    if (lower.includes(canonical) || aliases.some((alias) => lower.includes(normalizeForMatch(alias)))) {
      equivalents.push(canonical, ...aliases);
    }
  }
  for (const [canonical, aliases] of Object.entries(EXTRA_EQUIVALENTS)) {
    if (lower.includes(canonical) || aliases.some((alias) => lower.includes(normalizeForMatch(alias)))) {
      equivalents.push(canonical, ...aliases);
    }
  }
  return uniqueList([...terms, ...equivalents.map((item) => normalizeForMatch(item))]).slice(0, 18);
}

function isSpecializedRequirement(requirement: string): boolean {
  return /\b(stt|tts|speech|voice|mcp|model context protocol|multimodal|multi-modal|vector db|vector database|pinecone|langgraph|langchain|autogen|crewai)\b/i.test(
    requirement
  );
}

function buildRequirement(requirement: string, category: RequirementCategory, maxScore: number): RequirementDraft {
  const cleaned = cleanRequirementText(requirement);
  const { bucket, priority } = classifyBucket(category);
  const terms = buildNormalizedTerms(cleaned);
  const equivalents = uniqueList(
    Object.entries(SKILL_EQUIVALENTS)
      .filter(([canonical, aliases]) => {
        const normalized = normalizeForMatch(cleaned);
        return normalized.includes(canonical) || aliases.some((alias) => normalized.includes(normalizeForMatch(alias)));
      })
      .flatMap(([, aliases]) => aliases)
  );
  return {
    id: slugify(`${category}-${cleaned}`),
    requirement: cleaned,
    bucket,
    priority,
    category,
    phrases: uniqueList(cleaned.split(/[;,/]| and /i).map((part) => normalizeText(part)).filter((part) => part.length >= 3)).slice(0, 8),
    normalizedTerms: terms,
    equivalents: uniqueList([...equivalents, ...terms]).slice(0, 20),
    specialized: isSpecializedRequirement(cleaned),
    maxScore,
  };
}

function dedupeRequirements(requirements: RequirementDraft[]): RequirementDraft[] {
  const byKey = new Map<string, RequirementDraft>();
  for (const requirement of requirements) {
    const key = slugify(requirement.requirement);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, requirement);
      continue;
    }
    byKey.set(key, {
      ...existing,
      phrases: uniqueList([...existing.phrases, ...requirement.phrases]),
      normalizedTerms: uniqueList([...existing.normalizedTerms, ...requirement.normalizedTerms]),
      equivalents: uniqueList([...existing.equivalents, ...requirement.equivalents]),
      priority: existing.priority === "core" || requirement.priority !== "core" ? existing.priority : requirement.priority,
      maxScore: Math.max(existing.maxScore, requirement.maxScore),
    });
  }
  return Array.from(byKey.values());
}

function extractExperienceRequirements(jobDescription: string, explicitLine?: string | null): string[] {
  const lines = [explicitLine || "", ...splitLines(jobDescription)];
  return uniqueList(
    lines.filter((line) => /\b\d+\s*\+?\s*(?:-\s*\d+\s*)?years?\b|\bexperience\b/i.test(line)).map((line) => cleanRequirementText(line))
  ).slice(0, 3);
}

function extractResponsibilities(jobDescription: string): string[] {
  return uniqueList(
    splitLines(jobDescription).filter((line) => /\b(design|develop|build|integrate|mentor|collaborate|lead|work on|create|own)\b/i.test(line))
  ).slice(0, 8);
}

function extractDomainRequirements(jobDescription: string, keywords: string[]): string[] {
  const lines = splitLines(jobDescription).filter((line) =>
    /\b(aws|azure|gcp|cloud|docker|kubernetes|vector|rag|voice|real-time|realtime|streaming|certification|degree|education|backend|microservices|distributed)\b/i.test(
      line
    )
  );
  return uniqueList([...lines, ...keywords]).slice(0, 8);
}

function extractNoticeAndLocationRequirements(jobDescription: string): string[] {
  const requirements: string[] = [];
  const locationMatch = jobDescription.match(/\blocation\s*:\s*([^\n\r]+)/i);
  if (locationMatch?.[1]) requirements.push(`Location: ${locationMatch[1].trim()}`);
  if (/\bimmediate\b.*\bnotice\b|\bnotice\b.*\bimmediate\b/i.test(jobDescription)) requirements.push("Immediate notice");
  if (/\bwork authorization\b|\bauthori[sz]ation\b|\bvisa\b|\bcitizen(ship)?\b/i.test(jobDescription)) {
    requirements.push("Work authorization");
  }
  return requirements;
}

function extractEducationOrCertRequirements(jobDescription: string): string[] {
  return uniqueList(
    splitLines(jobDescription).filter((line) => /\b(certification|certified|degree|b\.?tech|bachelor|master|education)\b/i.test(line))
  ).slice(0, 4);
}

function buildRequirementSet(input: {
  jobDescription: string;
  experienceRequirement?: string | null;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
}): RequirementDraft[] {
  const requirements: RequirementDraft[] = [];
  for (const requirement of input.mustHave.filter(Boolean).slice(0, 16)) {
    requirements.push(buildRequirement(requirement, "must_have_skills", SCORE_WEIGHTS.must_have_skills));
  }
  for (const requirement of extractExperienceRequirements(input.jobDescription, input.experienceRequirement)) {
    requirements.push(buildRequirement(requirement, "experience", SCORE_WEIGHTS.experience));
  }
  for (const requirement of extractResponsibilities(input.jobDescription)) {
    requirements.push(buildRequirement(requirement, "responsibilities", SCORE_WEIGHTS.responsibilities));
  }
  for (const requirement of input.niceToHave.filter(Boolean).slice(0, 10)) {
    requirements.push(buildRequirement(requirement, "nice_to_have_skills", SCORE_WEIGHTS.nice_to_have_skills));
  }
  for (const requirement of extractDomainRequirements(input.jobDescription, input.keywords)) {
    requirements.push(buildRequirement(requirement, "domain_cloud_education", SCORE_WEIGHTS.domain_cloud_education));
  }
  for (const requirement of extractNoticeAndLocationRequirements(input.jobDescription)) {
    requirements.push(buildRequirement(requirement, "location_or_notice", SCORE_WEIGHTS.domain_cloud_education));
  }
  for (const requirement of extractEducationOrCertRequirements(input.jobDescription)) {
    requirements.push(buildRequirement(requirement, "education_or_certification", SCORE_WEIGHTS.domain_cloud_education));
  }
  return dedupeRequirements(
    requirements.filter((requirement) => !PROTECTED_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(requirement.requirement)))
  );
}

function buildResumeSignals(resumeText: string): ResumeSignal[] {
  const lines = uniqueList([...splitLines(resumeText), ...splitSentenceChunks(resumeText)]).slice(0, 140);
  return lines.map((line) => ({
    line,
    normalized: normalizeForMatch(line),
    terms: tokenize(line),
  }));
}

function exactEvidence(requirement: RequirementDraft, resumeSignals: ResumeSignal[]): string[] {
  return uniqueList(
    resumeSignals
      .filter((signal) => requirement.phrases.some((phrase) => signal.normalized.includes(normalizeForMatch(phrase))))
      .map((signal) => signal.line)
  ).slice(0, 3);
}

function normalizedEvidence(requirement: RequirementDraft, resumeSignals: ResumeSignal[]): { evidence: string[]; matches: string[] } {
  const evidence: string[] = [];
  const matches: string[] = [];
  const requiredTerms = requirement.normalizedTerms.filter((term) => term.length >= 3);
  for (const signal of resumeSignals) {
    const hitTerms = requiredTerms.filter((term) => signal.normalized.includes(term));
    if (!hitTerms.length) continue;
    evidence.push(signal.line);
    matches.push(...hitTerms);
    if (evidence.length >= 3) break;
  }
  return { evidence: uniqueList(evidence), matches: uniqueList(matches) };
}

function synonymEvidence(requirement: RequirementDraft, resumeSignals: ResumeSignal[]): { evidence: string[]; matches: string[] } {
  const equivalents = uniqueList(
    requirement.equivalents.flatMap((equivalent) => {
      const normalized = normalizeForMatch(equivalent);
      const mapHits = Object.entries(SKILL_EQUIVALENTS)
        .filter(([canonical, aliases]) => canonical === normalized || aliases.some((alias) => normalizeForMatch(alias) === normalized))
        .flatMap(([canonical, aliases]) => [canonical, ...aliases]);
      const extraHits = Object.entries(EXTRA_EQUIVALENTS)
        .filter(([canonical, aliases]) => canonical === normalized || aliases.some((alias) => normalizeForMatch(alias) === normalized))
        .flatMap(([canonical, aliases]) => [canonical, ...aliases]);
      return [equivalent, ...mapHits, ...extraHits];
    })
  ).filter(Boolean);
  const evidence: string[] = [];
  const matches: string[] = [];
  for (const signal of resumeSignals) {
    const hit = equivalents.filter((equivalent) => signal.normalized.includes(normalizeForMatch(equivalent)));
    if (!hit.length) continue;
    evidence.push(signal.line);
    matches.push(...hit);
    if (evidence.length >= 3) break;
  }
  return { evidence: uniqueList(evidence), matches: uniqueList(matches) };
}

function fuzzyEvidence(requirement: RequirementDraft, resumeSignals: ResumeSignal[]): { evidence: string[]; matches: string[]; score: number } {
  let bestScore = 0;
  let bestEvidence: string[] = [];
  let bestMatches: string[] = [];
  for (const signal of resumeSignals) {
    const fuzzy = fuzzyTokenCoverage(requirement.normalizedTerms, signal.terms);
    if (fuzzy.score <= bestScore) continue;
    bestScore = fuzzy.score;
    bestEvidence = [signal.line];
    bestMatches = fuzzy.matches;
  }
  return { evidence: bestEvidence, matches: bestMatches, score: bestScore };
}

function hasExplicitSpecializedProof(requirement: RequirementDraft, evidence: string[]): boolean {
  if (!requirement.specialized) return true;
  const combined = normalizeForMatch(evidence.join(" "));
  if (!combined) return false;
  if (/voice|stt|tts|speech|audio/.test(normalizeForMatch(requirement.requirement))) {
    return /\b(voice|stt|tts|speech|audio|telephony)\b/.test(combined);
  }
  if (/mcp|model context protocol/.test(normalizeForMatch(requirement.requirement))) {
    return /\b(mcp|model context protocol)\b/.test(combined);
  }
  if (/vector/.test(normalizeForMatch(requirement.requirement))) {
    return /\b(vector|pinecone|weaviate|faiss|milvus|qdrant|pgvector)\b/.test(combined);
  }
  return true;
}

function parseYearsRange(text: string): { min: number | null; max: number | null } {
  const normalized = normalizeForMatch(text);
  const range = normalized.match(/(\d+)\s*(?:\+|plus)?\s*(?:-|to)\s*(\d+)\s*years?/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = normalized.match(/(\d+)\s*\+?\s*years?/);
  if (plus) return { min: Number(plus[1]), max: null };
  return { min: null, max: null };
}

function inferResumeYears(resumeText: string): number | null {
  const normalized = normalizeForMatch(resumeText);
  const explicitMatches = Array.from(normalized.matchAll(/(\d+)\s*\+?\s*years?/g)).map((match) => Number(match[1]));
  const explicit = explicitMatches.length ? Math.max(...explicitMatches) : null;
  if (explicit) return explicit;
  return null;
}

function evaluateExperienceRequirement(requirement: RequirementDraft, resumeText: string, sourceTier: SourceQualityTier): RequirementEvaluation {
  const requiredYears = parseYearsRange(requirement.requirement);
  const resumeYears = inferResumeYears(resumeText);
  if (!requiredYears.min) {
    return {
      draft: requirement,
      status: sourceTier === "limited" || sourceTier === "insufficient" ? "unclear_due_to_source_quality" : "partially_met",
      matchType: sourceTier === "limited" || sourceTier === "insufficient" ? "unknown" : "partial_match",
      credit: sourceTier === "limited" || sourceTier === "insufficient" ? 0.3 : 0.5,
      evidence: [],
      reason: "Experience requirement was broad, so the matcher could only infer partial alignment.",
      similarityScore: 0,
      confidence: sourceTier === "strong" ? 0.6 : 0.35,
      synonymMatches: [],
      normalizedMatches: [],
      fuzzyMatches: [],
      semanticMatches: [],
    };
  }

  if (resumeYears == null) {
    return {
      draft: requirement,
      status: "unclear_due_to_source_quality",
      matchType: "unknown",
      credit: 0.35,
      evidence: [],
      reason: "Resume years were not explicit enough to confidently verify the JD experience requirement.",
      similarityScore: 0,
      confidence: 0.35,
      unknownAction: "Confirm exact years of relevant experience with the candidate.",
      synonymMatches: [],
      normalizedMatches: [],
      fuzzyMatches: [],
      semanticMatches: [],
    };
  }

  const minYears = requiredYears.min;
  const ratio = resumeYears / minYears;
  let status: SingleMatchRequirementStatus = "met";
  let matchType: SingleMatchRequirementMatchType = "exact_match";
  let credit = 1;
  if (ratio < 0.5) {
    status = "not_met";
    matchType = "missing";
    credit = 0.2;
  } else if (ratio < 0.75) {
    status = "partially_met";
    matchType = "partial_match";
    credit = 0.5;
  } else if (ratio < 1) {
    status = "partially_met";
    matchType = "partial_match";
    credit = 0.75;
  }

  return {
    draft: requirement,
    status,
    matchType,
    credit,
    evidence: [`Resume indicates approximately ${resumeYears}+ years of experience.`],
    reason:
      status === "met"
        ? `Resume experience meets the JD requirement of ${minYears}+ years.`
        : status === "partially_met"
          ? `Resume shows some seniority alignment, but it does not fully meet the JD requirement of ${minYears}+ years.`
          : `Resume appears materially below the JD requirement of ${minYears}+ years.`,
    similarityScore: ratio >= 1 ? 1 : clamp(ratio, 0, 1),
    confidence: resumeYears ? 0.8 : 0.4,
    synonymMatches: [],
    normalizedMatches: [],
    fuzzyMatches: [],
    semanticMatches: [],
  };
}

function evaluateUnknownRequirement(requirement: RequirementDraft, resumeText: string): RequirementEvaluation {
  const normalizedResume = normalizeForMatch(resumeText);
  if (/immediate notice/.test(normalizeForMatch(requirement.requirement))) {
    return {
      draft: requirement,
      status: normalizedResume.includes("notice") ? "partially_met" : "unclear_due_to_source_quality",
      matchType: normalizedResume.includes("notice") ? "partial_match" : "unknown",
      credit: normalizedResume.includes("notice") ? 0.4 : 0.5,
      evidence: normalizedResume.includes("notice") ? splitLines(resumeText).filter((line) => /notice/i.test(line)).slice(0, 1) : [],
      reason: normalizedResume.includes("notice")
        ? "Resume mentions notice details, but immediate availability is not yet proven."
        : "Notice period is unknown and should be confirmed with the candidate instead of treated as a hard gap.",
      similarityScore: 0,
      confidence: 0.45,
      unknownAction: "Confirm notice period with the candidate.",
      synonymMatches: [],
      normalizedMatches: [],
      fuzzyMatches: [],
      semanticMatches: [],
    };
  }
  if (/location:/.test(normalizeForMatch(requirement.requirement))) {
    const location = requirement.requirement.split(":")[1]?.trim() || "role location";
    const locationHit = splitLines(resumeText).filter((line) => line.toLowerCase().includes(location.toLowerCase())).slice(0, 1);
    return {
      draft: requirement,
      status: locationHit.length ? "partially_met" : "unclear_due_to_source_quality",
      matchType: locationHit.length ? "normalized_match" : "unknown",
      credit: locationHit.length ? 0.6 : 0.5,
      evidence: locationHit,
      reason: locationHit.length
        ? "Resume shows some location alignment."
        : `Current location alignment with ${location} is unknown and should be confirmed instead of treated as a rejection reason.`,
      similarityScore: 0,
      confidence: 0.45,
      unknownAction: `Confirm relocation or onsite availability for ${location}.`,
      synonymMatches: [],
      normalizedMatches: [],
      fuzzyMatches: [],
      semanticMatches: [],
    };
  }
  if (/work authorization/.test(normalizeForMatch(requirement.requirement))) {
    const explicitConflict = /\brequires sponsorship\b|\bno work authorization\b/i.test(resumeText);
    return {
      draft: requirement,
      status: explicitConflict ? "not_met" : "unclear_due_to_source_quality",
      matchType: explicitConflict ? "missing" : "unknown",
      credit: explicitConflict ? 0 : 0.5,
      evidence: explicitConflict ? splitLines(resumeText).filter((line) => /sponsorship|authorization/i.test(line)).slice(0, 1) : [],
      reason: explicitConflict
        ? "Resume explicitly conflicts with the work authorization requirement."
        : "Work authorization is unknown and should be confirmed with the candidate.",
      similarityScore: 0,
      confidence: explicitConflict ? 0.8 : 0.4,
      unknownAction: explicitConflict ? undefined : "Confirm work authorization with the candidate.",
      synonymMatches: [],
      normalizedMatches: [],
      fuzzyMatches: [],
      semanticMatches: [],
    };
  }
  return {
    draft: requirement,
    status: "unclear_due_to_source_quality",
    matchType: "unknown",
    credit: 0.4,
    evidence: [],
    reason: "This requirement needs recruiter confirmation rather than an automatic hard penalty.",
    similarityScore: 0,
    confidence: 0.35,
    synonymMatches: [],
    normalizedMatches: [],
    fuzzyMatches: [],
    semanticMatches: [],
  };
}

async function computeSemanticMatches(
  requirements: RequirementDraft[],
  resumeSignals: ResumeSignal[],
  embeddingProvider?: (texts: string[]) => Promise<number[][]>
): Promise<Map<string, { score: number; evidence: string[] }>> {
  const provider = embeddingProvider ?? (process.env.OPENAI_API_KEY ? createEmbeddingsBatch : null);
  if (!provider || !requirements.length || !resumeSignals.length) return new Map();
  const requirementTexts = requirements.map((requirement) => requirement.requirement);
  const resumeTexts = resumeSignals.map((signal) => signal.line);
  try {
    const embeddings = await provider([...requirementTexts, ...resumeTexts]);
    const requirementEmbeddings = embeddings.slice(0, requirementTexts.length);
    const resumeEmbeddings = embeddings.slice(requirementTexts.length);
    const out = new Map<string, { score: number; evidence: string[] }>();
    requirements.forEach((requirement, index) => {
      let bestScore = 0;
      let bestSignalLine: string | null = null;
      resumeEmbeddings.forEach((embedding, signalIndex) => {
        const score = cosineSimilarity(requirementEmbeddings[index], embedding);
        if (score > bestScore) {
          bestScore = score;
          bestSignalLine = resumeSignals[signalIndex]?.line ?? null;
        }
      });
      out.set(requirement.id, {
        score: bestScore,
        evidence: bestSignalLine ? [bestSignalLine] : [],
      });
    });
    return out;
  } catch {
    return new Map();
  }
}

function buildBaseAiEvidence(baseAi: AiMatchResult): string {
  return normalizeForMatch(
    [
      baseAi.reasoning,
      baseAi.decision_reason,
      baseAi.recruiter_summary,
      ...(baseAi.matched_skills ?? []),
      ...(baseAi.strengths ?? []),
      ...(baseAi.responsibility_comparison ?? []),
      ...(baseAi.parsed_profile?.resume_domain_evidence ?? []),
      ...(baseAi.parsed_profile?.tools_evidence ?? []),
      ...(baseAi.parsed_profile?.impact_evidence ?? []),
    ]
      .filter(Boolean)
      .join("\n")
  );
}

function validateWithBaseAi(requirement: RequirementDraft, evidence: string[], baseAi: AiMatchResult): boolean {
  const baseAiEvidence = buildBaseAiEvidence(baseAi);
  if (!baseAiEvidence) return false;
  const normalizedRequirement = normalizeForMatch(requirement.requirement);
  if (baseAiEvidence.includes(normalizedRequirement)) return true;
  const synonymHit = requirement.equivalents.some((equivalent) => baseAiEvidence.includes(normalizeForMatch(equivalent)));
  if (synonymHit) return true;
  if (!evidence.length) return false;
  return evidence.some((line) => {
    const normalizedLine = normalizeForMatch(line);
    return requirement.normalizedTerms.some((term) => normalizedLine.includes(term));
  });
}

function evaluateGeneralRequirement(
  requirement: RequirementDraft,
  resumeSignals: ResumeSignal[],
  resumeText: string,
  sourceTier: SourceQualityTier,
  semantic: { score: number; evidence: string[] } | undefined,
  baseAi: AiMatchResult
): RequirementEvaluation {
  const exact = exactEvidence(requirement, resumeSignals);
  const normalized = normalizedEvidence(requirement, resumeSignals);
  const synonym = synonymEvidence(requirement, resumeSignals);
  const fuzzy = fuzzyEvidence(requirement, resumeSignals);
  const semanticScore = semantic?.score ?? 0;
  const semanticEvidence = semantic?.evidence ?? [];
  const allEvidence = uniqueList([...exact, ...normalized.evidence, ...synonym.evidence, ...semanticEvidence, ...fuzzy.evidence]).slice(0, 4);
  const explicitProof = hasExplicitSpecializedProof(requirement, allEvidence);
  const gptValidated = validateWithBaseAi(requirement, allEvidence, baseAi);

  let status: SingleMatchRequirementStatus = "not_met";
  let matchType: SingleMatchRequirementMatchType = "missing";
  let credit = 0;
  let reason = "No credible evidence for this requirement was found after exact, synonym, fuzzy, semantic, and AI validation checks.";

  if (exact.length && explicitProof) {
    status = "met";
    matchType = "exact_match";
    credit = 1;
    reason = "Resume contains direct requirement evidence.";
  } else if ((normalized.evidence.length || synonym.evidence.length) && explicitProof) {
    status = "met";
    matchType = synonym.evidence.length ? "synonym_match" : "normalized_match";
    credit = synonym.evidence.length ? 0.9 : 0.95;
    reason = synonym.evidence.length
      ? "Equivalent resume evidence satisfied the requirement through a synonym or closely related technology."
      : "Normalized resume evidence satisfied the requirement.";
  } else if (semanticScore >= STRONG_SEMANTIC_THRESHOLD && allEvidence.length && explicitProof && gptValidated) {
    status = "met";
    matchType = "semantic_match";
    credit = 0.85;
    reason = "Semantic similarity plus resume evidence and AI validation support this requirement as a true match.";
  } else if ((fuzzy.score >= 0.6 || semanticScore >= PARTIAL_SEMANTIC_THRESHOLD || gptValidated) && allEvidence.length) {
    status = "partially_met";
    matchType = fuzzy.score >= 0.6 ? "fuzzy_match" : semanticScore >= PARTIAL_SEMANTIC_THRESHOLD ? "semantic_match" : "gpt_validated_match";
    credit = 0.4;
    reason = explicitProof
      ? "Resume shows adjacent or partial evidence, but not enough to award a full match."
      : "Related evidence exists, but the specific specialized proof is incomplete.";
  } else if ((sourceTier === "limited" || sourceTier === "insufficient") && requirement.priority !== "core") {
    status = "unclear_due_to_source_quality";
    matchType = "unknown";
    credit = 0.4;
    reason = "The current resume source is too limited to confidently verify or reject this requirement.";
  }

  if (!explicitProof && requirement.specialized && status === "met") {
    status = "partially_met";
    matchType = "partial_match";
    credit = 0.4;
    reason = "Related evidence exists, but the resume does not explicitly prove the specialized requirement.";
  }

  const confidence = clamp(
    Math.round(
      ((exact.length ? 1 : 0) * 35 +
        (normalized.evidence.length ? 1 : 0) * 20 +
        (synonym.evidence.length ? 1 : 0) * 20 +
        (semanticScore >= PARTIAL_SEMANTIC_THRESHOLD ? semanticScore : 0) * 15 +
        (gptValidated ? 10 : 0)) *
        100
    ) / 100,
    0.2,
    0.98
  );

  return {
    draft: requirement,
    status,
    matchType,
    credit,
    evidence: allEvidence,
    reason,
    similarityScore: semanticScore,
    confidence,
    synonymMatches: synonym.matches,
    normalizedMatches: normalized.matches,
    fuzzyMatches: fuzzy.matches,
    semanticMatches: semanticEvidence,
  };
}

function groupEvaluations(evaluations: RequirementEvaluation[], category: RequirementCategory): RequirementEvaluation[] {
  return evaluations.filter((evaluation) => evaluation.draft.category === category);
}

function buildScoreBucket(evaluations: RequirementEvaluation[], maxScore: number): ScoreBucket {
  if (!evaluations.length) return { score: 0, max_score: maxScore, details: [] };
  const average = evaluations.reduce((sum, evaluation) => sum + evaluation.credit, 0) / evaluations.length;
  return {
    score: Math.round(average * maxScore * 10) / 10,
    max_score: maxScore,
    details: evaluations.map((evaluation) => `${evaluation.draft.requirement}: ${evaluation.status.replace(/_/g, " ")}`),
  };
}

function deriveEvidenceQuality(sourceTier: SourceQualityTier, evaluations: RequirementEvaluation[]): SingleMatchEvidenceQuality {
  if (sourceTier === "insufficient") return "insufficient";
  const metWithEvidence = evaluations.filter((evaluation) => evaluation.status === "met" && evaluation.evidence.length).length;
  const unclear = evaluations.filter((evaluation) => evaluation.status === "unclear_due_to_source_quality").length;
  if (sourceTier === "strong" && metWithEvidence >= Math.max(3, Math.ceil(evaluations.length * 0.35))) return "strong";
  if (sourceTier === "limited" || unclear >= Math.ceil(evaluations.length * 0.3)) return "limited";
  return "mixed";
}

function deriveResumeEvidenceQualityScore(
  sourceTier: SourceQualityTier,
  evaluations: RequirementEvaluation[],
  evidenceQuality: SingleMatchEvidenceQuality
): ScoreBucket {
  const directEvidenceCount = evaluations.filter((evaluation) => evaluation.evidence.length).length;
  const ratio = evaluations.length ? directEvidenceCount / evaluations.length : 0;
  let score = ratio * SCORE_WEIGHTS.resume_evidence_quality;
  if (sourceTier === "medium") score *= 0.85;
  if (sourceTier === "limited") score *= 0.65;
  if (sourceTier === "insufficient") score *= 0.35;
  if (evidenceQuality === "strong") score = Math.max(score, 4.5);
  return {
    score: Math.round(clamp(score, 0, SCORE_WEIGHTS.resume_evidence_quality) * 10) / 10,
    max_score: SCORE_WEIGHTS.resume_evidence_quality,
    details: `Evidence quality ${evidenceQuality} with ${directEvidenceCount} requirement(s) backed by resume excerpts.`,
  };
}

function deriveFitLevel(score: number): SingleMatchFitLevel {
  if (score >= 85) return "Strong Match";
  if (score >= 70) return "Good Match";
  if (score >= 55) return "Moderate Match";
  if (score >= 40) return "Weak Match";
  return "Not Recommended";
}

function deriveDecision(score: number): "Send to interview" | "Needs recruiter review" | "Hold" | "Reject" {
  if (score >= 75) return "Send to interview";
  if (score >= 60) return "Needs recruiter review";
  if (score >= 40) return "Hold";
  return "Reject";
}

function deriveRoleFamilyMismatch(jobTitle: string, resumeText: string): boolean {
  const jd = normalizeForMatch(jobTitle);
  const resume = normalizeForMatch(resumeText);
  if (/\bbackend\b|\bpython\b|\bai\b|\bllm\b/.test(jd)) {
    return /\bgraphic designer\b|\baccountant\b|\bsales only\b/.test(resume);
  }
  if (/\bfrontend\b|\breact\b/.test(jd)) {
    return /\baccountant\b|\bmechanical\b/.test(resume);
  }
  return false;
}

function deriveScoreCaps(
  evaluations: RequirementEvaluation[],
  experienceBucket: ScoreBucket,
  jobTitle: string,
  resumeText: string
): ScoreCap[] {
  const caps: ScoreCap[] = [];
  const mustHave = evaluations.filter((evaluation) => evaluation.draft.category === "must_have_skills");
  const trueMissingMustHave = mustHave.filter((evaluation) => evaluation.status === "not_met");
  if (mustHave.length && trueMissingMustHave.length / mustHave.length > 0.5) {
    caps.push({
      code: "must_have_missing_cap",
      limit: 60,
      reason: "More than 50% of must-have skills remain truly missing after the full gap audit.",
    });
  }
  if (experienceBucket.max_score && experienceBucket.score < SCORE_WEIGHTS.experience * 0.5) {
    caps.push({
      code: "experience_cap",
      limit: 65,
      reason: "Relevant experience appears materially below the JD requirement.",
    });
  }
  if (deriveRoleFamilyMismatch(jobTitle, resumeText)) {
    caps.push({
      code: "role_family_cap",
      limit: 50,
      reason: "Resume role family appears materially different from the job family.",
    });
  }
  const mandatoryRequirementMiss = evaluations.find(
    (evaluation) =>
      evaluation.status === "not_met" &&
      evaluation.draft.category === "education_or_certification" &&
      /\bmandatory|required\b/i.test(evaluation.draft.requirement)
  );
  if (mandatoryRequirementMiss) {
    caps.push({
      code: "mandatory_requirement_cap",
      limit: 60,
      reason: `Mandatory requirement not met: ${mandatoryRequirementMiss.draft.requirement}.`,
    });
  }
  return caps;
}

function buildRequirementBreakdown(evaluations: RequirementEvaluation[]): SingleMatchRequirementBreakdownItem[] {
  return evaluations.map((evaluation) => ({
    id: evaluation.draft.id,
    label: evaluation.draft.requirement,
    bucket: evaluation.draft.bucket,
    priority: evaluation.draft.priority,
    status: evaluation.status,
    weight: evaluation.draft.maxScore,
    evidence: evaluation.evidence,
    rationale: evaluation.reason,
    match_type: evaluation.matchType,
    score_awarded: Math.round(evaluation.credit * evaluation.draft.maxScore * 10) / 10,
    max_score: evaluation.draft.maxScore,
    similarity_score: Number(evaluation.similarityScore.toFixed(3)),
    confidence: Number(evaluation.confidence.toFixed(2)),
  }));
}

function buildMatchedLists(evaluations: RequirementEvaluation[]): {
  matched_requirements: string[];
  partial_matches: string[];
  missing_must_have_requirements: string[];
  missing_nice_to_have_requirements: string[];
  critical_unknowns: string[];
} {
  return {
    matched_requirements: uniqueList(
      evaluations.filter((evaluation) => evaluation.status === "met").map((evaluation) => evaluation.draft.requirement)
    ),
    partial_matches: uniqueList(
      evaluations.filter((evaluation) => evaluation.status === "partially_met").map((evaluation) => evaluation.draft.requirement)
    ),
    missing_must_have_requirements: uniqueList(
      evaluations
        .filter(
          (evaluation) =>
            evaluation.status === "not_met" &&
            (evaluation.draft.category === "must_have_skills" ||
              evaluation.draft.category === "experience" ||
              evaluation.draft.category === "responsibilities")
        )
        .map((evaluation) => evaluation.draft.requirement)
    ),
    missing_nice_to_have_requirements: uniqueList(
      evaluations
        .filter((evaluation) => evaluation.status === "not_met" && evaluation.draft.category === "nice_to_have_skills")
        .map((evaluation) => evaluation.draft.requirement)
    ),
    critical_unknowns: uniqueList(
      evaluations
        .filter(
          (evaluation) =>
            evaluation.status === "unclear_due_to_source_quality" &&
            (evaluation.draft.priority === "core" || evaluation.draft.category === "location_or_notice")
        )
        .map((evaluation) => evaluation.draft.requirement)
    ),
  };
}

function buildGapAudit(evaluations: RequirementEvaluation[]): GapAuditEntry[] {
  return evaluations
    .filter((evaluation) => evaluation.status === "not_met" || evaluation.status === "unclear_due_to_source_quality")
    .map((evaluation) => ({
      requirement: evaluation.draft.requirement,
      status: evaluation.status,
      reason: evaluation.reason,
    }));
}

function deriveConfidenceScore(sourceTier: SourceQualityTier, evaluations: RequirementEvaluation[], caps: ScoreCap[]): number {
  const sourceBase = sourceTier === "strong" ? 84 : sourceTier === "medium" ? 72 : sourceTier === "limited" ? 54 : 34;
  const met = evaluations.filter((evaluation) => evaluation.status === "met").length;
  const partial = evaluations.filter((evaluation) => evaluation.status === "partially_met").length;
  const unclear = evaluations.filter((evaluation) => evaluation.status === "unclear_due_to_source_quality").length;
  const missing = evaluations.filter((evaluation) => evaluation.status === "not_met").length;
  const capPenalty = caps.length * 4;
  return clamp(Math.round(sourceBase + met * 1.8 + partial - unclear * 3 - missing * 1.5 - capPenalty), 12, 97);
}

function deriveConfidenceReasons(sourceTier: SourceQualityTier, evaluations: RequirementEvaluation[], caps: ScoreCap[]): string[] {
  const reasons: string[] = [];
  if (sourceTier === "strong") reasons.push("Full resume text was available, so the scorer could validate most JD requirements directly.");
  if (sourceTier === "medium") reasons.push("Stored resume text was used, which is useful but may still omit some candidate detail.");
  if (sourceTier === "limited") reasons.push("Fallback summary or short resume text lowers confidence, especially for nuanced requirements.");
  if (sourceTier === "insufficient") reasons.push("No reliable full resume text was available, so confidence is intentionally low.");
  const unclear = evaluations.filter((evaluation) => evaluation.status === "unclear_due_to_source_quality").length;
  if (unclear) reasons.push(`${unclear} requirement(s) remain unclear because the resume source is incomplete or ambiguous.`);
  for (const cap of caps) reasons.push(cap.reason);
  return uniqueList(reasons).slice(0, 6);
}

function deriveResumeQualityFlags(source: ResumeSource, sourceTier: SourceQualityTier, resumeChars: number): string[] {
  const flags: string[] = [];
  if (source === "experience_summary_or_skills") flags.push("Scored on fallback summary / skills instead of a parsed full resume.");
  if (source === "none") flags.push("No usable full resume source was available for scoring.");
  if (source === "stored_resume_text" && resumeChars < 900) flags.push("Stored resume text is short and may omit important project evidence.");
  if (sourceTier === "limited" || sourceTier === "insufficient") flags.push("Source quality can reduce confidence and may understate the candidate's true fit.");
  return uniqueList(flags);
}

function deriveInterviewFocusAreas(evaluations: RequirementEvaluation[]): string[] {
  return uniqueList(
    evaluations
      .filter((evaluation) => evaluation.status !== "met" && evaluation.draft.priority !== "nice_to_have")
      .slice(0, 6)
      .map((evaluation) => evaluation.draft.requirement)
  );
}

function deriveFollowUpQuestions(evaluations: RequirementEvaluation[]): string[] {
  return uniqueList(
    evaluations
      .filter((evaluation) => evaluation.status !== "met")
      .slice(0, 6)
      .map((evaluation) =>
        evaluation.status === "unclear_due_to_source_quality" && evaluation.unknownAction
          ? evaluation.unknownAction
          : `Ask the candidate to walk through a recent project proving ${evaluation.draft.requirement.toLowerCase()}.`
      )
  );
}

function deriveDecisionDrivers(
  fitLevel: SingleMatchFitLevel,
  scoreBreakdown: SingleMatchScoreBreakdown,
  evaluations: RequirementEvaluation[]
): string[] {
  const drivers = [`Fit level: ${fitLevel}`];
  const met = evaluations.filter((evaluation) => evaluation.status === "met").length;
  const missingMust = evaluations.filter(
    (evaluation) => evaluation.status === "not_met" && evaluation.draft.category === "must_have_skills"
  ).length;
  drivers.push(`${met} requirement(s) were fully met with evidence.`);
  if (missingMust) drivers.push(`${missingMust} must-have requirement(s) remain true gaps after the gap audit.`);
  drivers.push(
    `Must-have score ${scoreBreakdown.must_have_skills.score}/${scoreBreakdown.must_have_skills.max_score}, responsibilities score ${scoreBreakdown.responsibilities.score}/${scoreBreakdown.responsibilities.max_score}.`
  );
  return uniqueList(drivers).slice(0, 6);
}

function deriveRiskFlags(evaluations: RequirementEvaluation[], caps: ScoreCap[]): string[] {
  const flags = caps.map((cap) => cap.reason);
  for (const evaluation of evaluations) {
    if (evaluation.status === "not_met" && evaluation.draft.priority !== "nice_to_have") {
      flags.push(`True gap after audit: ${evaluation.draft.requirement}.`);
    }
  }
  return uniqueList(flags).slice(0, 8);
}

function deriveRecommendedNextStep(decision: string, criticalUnknowns: string[], sourceTier: SourceQualityTier): string {
  if ((sourceTier === "limited" || sourceTier === "insufficient") && criticalUnknowns.length) {
    return "Re-run the match on a parsed full resume before making a final decision, then confirm the critical unknowns with the candidate.";
  }
  if (decision === "Send to interview") return "Proceed to recruiter or technical interview with the listed focus areas.";
  if (decision === "Needs recruiter review") return "Keep the candidate in recruiter review and validate the partial or unclear requirements before final disposition.";
  if (decision === "Hold") return "Hold for follow-up and confirm whether the unresolved requirements can be satisfied.";
  return "Reject for this role unless new evidence materially changes the audited true gaps.";
}

export async function buildAdvancedPureAiInsights(
  input: BuildAdvancedSingleMatchInsightsInput
): Promise<
  Partial<SingleMatchCheckResultPayload> & {
    match_score: number;
    ai_match_score: number;
    ai_decision: string | null;
    decision: string | null;
    matched_skills: string[];
    missing_required_skills: string[];
    summary: string | null;
    reasoning: string | null;
    ai_evidence_highlights: string[];
  }
> {
  const sourceTier = deriveSourceQualityTier(input.resumeSource, input.resumeCharsScored);
  const requirements = buildRequirementSet({
    jobDescription: input.jobDescription,
    experienceRequirement: input.experienceRequirement,
    mustHave: input.mustHave,
    niceToHave: input.niceToHave,
    keywords: input.keywords,
  });
  const resumeSignals = buildResumeSignals(input.resumeText);
  const semanticMap = await computeSemanticMatches(requirements, resumeSignals, input.embeddingProvider);

  const evaluations: RequirementEvaluation[] = [];
  for (const requirement of requirements) {
    if (requirement.category === "experience") {
      evaluations.push(evaluateExperienceRequirement(requirement, input.resumeText, sourceTier));
      continue;
    }
    if (requirement.category === "location_or_notice") {
      evaluations.push(evaluateUnknownRequirement(requirement, input.resumeText));
      continue;
    }
    evaluations.push(
      evaluateGeneralRequirement(requirement, resumeSignals, input.resumeText, sourceTier, semanticMap.get(requirement.id), input.baseAi)
    );
  }

  const scoreBreakdown: SingleMatchScoreBreakdown = {
    must_have_skills: buildScoreBucket(groupEvaluations(evaluations, "must_have_skills"), SCORE_WEIGHTS.must_have_skills),
    experience: buildScoreBucket(groupEvaluations(evaluations, "experience"), SCORE_WEIGHTS.experience),
    responsibilities: buildScoreBucket(groupEvaluations(evaluations, "responsibilities"), SCORE_WEIGHTS.responsibilities),
    nice_to_have_skills: buildScoreBucket(groupEvaluations(evaluations, "nice_to_have_skills"), SCORE_WEIGHTS.nice_to_have_skills),
    domain_cloud_education: buildScoreBucket(
      evaluations.filter(
        (evaluation) =>
          evaluation.draft.category === "domain_cloud_education" ||
          evaluation.draft.category === "education_or_certification" ||
          evaluation.draft.category === "location_or_notice"
      ),
      SCORE_WEIGHTS.domain_cloud_education
    ),
    resume_evidence_quality: deriveResumeEvidenceQualityScore(sourceTier, evaluations, deriveEvidenceQuality(sourceTier, evaluations)),
  };

  const rawScore =
    scoreBreakdown.must_have_skills.score +
    scoreBreakdown.experience.score +
    scoreBreakdown.responsibilities.score +
    scoreBreakdown.nice_to_have_skills.score +
    scoreBreakdown.domain_cloud_education.score +
    scoreBreakdown.resume_evidence_quality.score;

  const caps = deriveScoreCaps(evaluations, scoreBreakdown.experience, input.jobTitle, input.resumeText);
  const cappedScore = caps.reduce((score, cap) => Math.min(score, cap.limit), rawScore);
  const overallScore = clamp(Math.round(cappedScore), 0, 100);
  const fitLevel = deriveFitLevel(overallScore);
  const decision = deriveDecision(overallScore);
  const confidenceScore = deriveConfidenceScore(sourceTier, evaluations, caps);
  const confidenceReasons = deriveConfidenceReasons(sourceTier, evaluations, caps);
  const evidenceQuality = deriveEvidenceQuality(sourceTier, evaluations);
  const matched = buildMatchedLists(evaluations);
  const gapAudit = buildGapAudit(evaluations);
  const requirementBreakdown = buildRequirementBreakdown(evaluations);
  const decisionDrivers = deriveDecisionDrivers(fitLevel, scoreBreakdown, evaluations);
  const riskFlags = deriveRiskFlags(evaluations, caps);
  const interviewFocusAreas = deriveInterviewFocusAreas(evaluations);
  const followUpQuestions = deriveFollowUpQuestions(evaluations);
  const recommendedNextStep = deriveRecommendedNextStep(decision, matched.critical_unknowns, sourceTier);
  const resumeQualityFlags = deriveResumeQualityFlags(input.resumeSource, sourceTier, input.resumeCharsScored);
  const aiEvidenceHighlights = uniqueList(evaluations.flatMap((evaluation) => evaluation.evidence)).slice(0, 10);
  const scoreDetails = evaluations.map((evaluation) => `${evaluation.draft.requirement}: ${evaluation.status.replace(/_/g, " ")}`);
  scoreBreakdown.must_have_skills.details = scoreDetails.filter((detail) =>
    groupEvaluations(evaluations, "must_have_skills").some((evaluation) => detail.startsWith(evaluation.draft.requirement))
  );

  const summary =
    `${overallScore}% · ${fitLevel} · ${matched.matched_requirements.length} matched · ${matched.partial_matches.length} partial · ` +
    `${matched.missing_must_have_requirements.length} true must-have gaps`;

  const reasoning =
    [
      input.baseAi.recruiter_summary?.trim(),
      `The final score is deterministic: must-have ${scoreBreakdown.must_have_skills.score}/${scoreBreakdown.must_have_skills.max_score}, experience ${scoreBreakdown.experience.score}/${scoreBreakdown.experience.max_score}, responsibilities ${scoreBreakdown.responsibilities.score}/${scoreBreakdown.responsibilities.max_score}, nice-to-have ${scoreBreakdown.nice_to_have_skills.score}/${scoreBreakdown.nice_to_have_skills.max_score}, domain/cloud ${scoreBreakdown.domain_cloud_education.score}/${scoreBreakdown.domain_cloud_education.max_score}, evidence quality ${scoreBreakdown.resume_evidence_quality.score}/${scoreBreakdown.resume_evidence_quality.max_score}.`,
      confidenceReasons.length ? `Confidence: ${confidenceReasons.join(" ")}` : "",
      caps.length ? `Caps applied: ${caps.map((cap) => `${cap.limit} (${cap.reason})`).join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  const developerDebug = {
    extracted_jd_requirements: requirements.map((requirement) => ({
      requirement: requirement.requirement,
      category: requirement.category,
      normalized_terms: requirement.normalizedTerms,
      equivalents: requirement.equivalents,
    })),
    extracted_resume_signals: resumeSignals.slice(0, 40).map((signal) => signal.line),
    synonym_matches: evaluations
      .filter((evaluation) => evaluation.synonymMatches.length)
      .map((evaluation) => ({ requirement: evaluation.draft.requirement, matches: evaluation.synonymMatches })),
    semantic_matches: evaluations
      .filter((evaluation) => evaluation.semanticMatches.length || evaluation.similarityScore >= PARTIAL_SEMANTIC_THRESHOLD)
      .map((evaluation) => ({
        requirement: evaluation.draft.requirement,
        similarity_score: Number(evaluation.similarityScore.toFixed(3)),
        evidence: evaluation.semanticMatches,
      })),
    final_gaps_after_gap_audit: gapAudit,
    caps_applied: caps,
    final_score: overallScore,
  };

  const candidateFeedback =
    matched.missing_must_have_requirements.length || matched.critical_unknowns.length
      ? "Some core requirements still need stronger evidence or recruiter confirmation before the profile can be treated as a strong fit."
      : "The resume shows strong alignment with the role, with only limited follow-up needed on secondary items.";

  return {
    match_score: overallScore,
    ai_match_score: overallScore,
    decision,
    ai_decision: decision,
    matched_skills: uniqueList([...matched.matched_requirements, ...matched.partial_matches]).slice(0, 24),
    missing_required_skills: matched.missing_must_have_requirements,
    reasoning,
    summary,
    ai_evidence_highlights: aiEvidenceHighlights,
    resume_source: input.resumeSource,
    resume_chars_scored: input.resumeCharsScored,
    jd_chars_scored: input.jdCharsScored,
    requirement_breakdown: requirementBreakdown,
    confidence_score: confidenceScore,
    confidence_reasons: confidenceReasons,
    resume_quality_flags: resumeQualityFlags,
    decision_drivers: decisionDrivers,
    risk_flags: riskFlags,
    interview_focus_areas: interviewFocusAreas,
    follow_up_questions: followUpQuestions,
    recommended_next_step: recommendedNextStep,
    evidence_quality: evidenceQuality,
    fit_level: fitLevel,
    score_breakdown: scoreBreakdown,
    partial_matches: matched.partial_matches,
    missing_nice_to_have_requirements: matched.missing_nice_to_have_requirements,
    critical_unknowns: matched.critical_unknowns,
    red_flags: riskFlags,
    recruiter_summary: summary,
    candidate_feedback: candidateFeedback,
    debug_requirements: requirementBreakdown.map((item) => ({
      requirement: item.label,
      category: item.bucket,
      status: item.status,
      match_type: item.match_type ?? "missing",
      score_awarded: item.score_awarded ?? 0,
      max_score: item.max_score ?? 0,
      evidence: item.evidence.join(" | "),
      reason: item.rationale ?? "",
      similarity_score: item.similarity_score ?? 0,
      confidence: item.confidence ?? 0,
    })),
    developer_debug: developerDebug,
  };
}
