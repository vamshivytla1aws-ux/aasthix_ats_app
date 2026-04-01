import type { ExtractedSkillProfile } from "@/lib/jdSkillExtraction";
import {
  candidateHasSkill,
  displaySkillLabel,
  normalizeSkillList,
  parseCandidateSkillsNormalized,
} from "@/lib/skillNormalization";
import {
  parseCandidateExperienceYears,
  parseJobExperienceBand,
  scoreExperienceFit,
  scoreRoleCompatibility,
  parseCandidateRoleContext,
} from "@/lib/experienceSignals";
import type { ParsedMatchProfile } from "@/lib/matchPipeline/types";
import type { AiCategoryScores, AiMatchResult } from "@/lib/matchScoreAi";

/** Helper function to calculate seniority level gap */
function getSeniorityGap(jobLevel: string, candidateLevel: string): number {
  const levels = ['junior', 'mid', 'senior', 'lead', 'executive'];
  const jobIndex = levels.indexOf(jobLevel);
  const candidateIndex = levels.indexOf(candidateLevel);
  
  if (jobIndex === -1 || candidateIndex === -1) return 0;
  return Math.abs(jobIndex - candidateIndex);
}

/** Extract role context from job title/description */
function extractRoleContext(title: string, description: string): { role: string; level: string | null; domain: string } {
  const combined = `${title} ${description}`.toLowerCase();
  
  // Extract role/function
  const rolePatterns = [
    { pattern: /\b(engineer|developer|programmer|software)\b/, role: 'engineering' },
    { pattern: /\b(designer|ux|ui|product designer)\b/, role: 'design' },
    { pattern: /\b(manager|director|head|vp|lead)\b/, role: 'management' },
    { pattern: /\b(analyst|data analyst|business analyst)\b/, role: 'analytics' },
    { pattern: /\b(devops|sre|infrastructure|sysadmin)\b/, role: 'devops' },
    { pattern: /\b(product manager|pm|product owner)\b/, role: 'product' },
    { pattern: /\b(marketing|growth|seo|sem)\b/, role: 'marketing' },
    { pattern: /\b(sales|business development|bd)\b/, role: 'sales' },
    { pattern: /\b(hr|recruiter|talent|people)\b/, role: 'hr' },
    { pattern: /\b(finance|accounting|controller)\b/, role: 'finance' }
  ];
  
  let detectedRole = 'general';
  for (const { pattern, role } of rolePatterns) {
    if (pattern.test(combined)) {
      detectedRole = role;
      break;
    }
  }
  
  // Extract domain/tech stack
  const domainPatterns = [
    { pattern: /\b(frontend|ui|ux|react|vue|angular|html|css)\b/, domain: 'frontend' },
    { pattern: /\b(backend|server|api|node|java|python|ruby)\b/, domain: 'backend' },
    { pattern: /\b(fullstack|full.?stack|mean|mern|lamp)\b/, domain: 'fullstack' },
    { pattern: /\b(mobile|ios|android|react native|flutter)\b/, domain: 'mobile' },
    { pattern: /\b(data|ml|ai|machine learning|analytics)\b/, domain: 'data' },
    { pattern: /\b(cloud|aws|azure|gcp|devops|kubernetes)\b/, domain: 'cloud' },
    { pattern: /\b(security|cybersecurity|penetration|owasp)\b/, domain: 'security' }
  ];
  
  let detectedDomain = 'general';
  for (const { pattern, domain } of domainPatterns) {
    if (pattern.test(combined)) {
      detectedDomain = domain;
      break;
    }
  }
  
  // Extract seniority level
  let level: string | null = null;
  if (/\b(entry|junior|jr|associate|intern|trainee)\b/.test(combined)) level = 'junior';
  else if (/\b(mid|intermediate|regular)\b/.test(combined)) level = 'mid';
  else if (/\b(senior|sr|sr\.|experienced|advanced)\b/.test(combined)) level = 'senior';
  else if (/\b(lead|principal|staff|architect)\b/.test(combined)) level = 'lead';
  else if (/\b(director|vp|head|cto|manager)\b/.test(combined)) level = 'executive';
  
  return {
    role: detectedRole,
    level,
    domain: detectedDomain
  };
}

const TITLE_STOPWORDS = new Set([
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "engineer",
  "developer",
  "manager",
  "specialist",
  "analyst",
  "consultant",
  "remote",
  "full",
  "time",
  "part",
  "contract",
  "the",
  "and",
  "for",
  "with",
  "position",
  "role",
  "job",
  "opening",
  "opportunity",
  "level",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
]);

/** Semantic role mappings for better title understanding */
const ROLE_SEMANTICS: Record<string, { synonyms: string[]; related: string[]; category: string }> = {
  'frontend': {
    synonyms: ['ui', 'ux', 'front-end', 'client side', 'web', 'javascript'],
    related: ['react', 'vue', 'angular', 'html', 'css', 'typescript'],
    category: 'engineering'
  },
  'backend': {
    synonyms: ['back-end', 'server side', 'api', 'services'],
    related: ['node', 'java', 'python', 'ruby', 'php', 'go'],
    category: 'engineering'
  },
  'fullstack': {
    synonyms: ['full-stack', 'full stack', 'end-to-end'],
    related: ['frontend', 'backend', 'web', 'javascript', 'node'],
    category: 'engineering'
  },
  'mobile': {
    synonyms: ['ios', 'android', 'app'],
    related: ['react native', 'flutter', 'swift', 'kotlin', 'xamarin'],
    category: 'engineering'
  },
  'devops': {
    synonyms: ['sre', 'infrastructure', 'platform', 'cloud'],
    related: ['aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform'],
    category: 'engineering'
  },
  'data': {
    synonyms: ['analytics', 'science', 'engineering'],
    related: ['python', 'sql', 'spark', 'ml', 'ai', 'statistics'],
    category: 'data'
  },
  'product': {
    synonyms: ['pm', 'product owner', 'product management'],
    related: ['strategy', 'roadmap', 'agile', 'scrum'],
    category: 'product'
  },
  'design': {
    synonyms: ['ux', 'ui', 'product design', 'visual'],
    related: ['figma', 'sketch', 'adobe', 'prototype', 'wireframe'],
    category: 'design'
  },
  'security': {
    synonyms: ['cybersecurity', 'infosec', 'application security'],
    related: ['penetration', 'owasp', 'encryption', 'authentication'],
    category: 'security'
  }
};

/** Weights for rule-based composite (each sub-score is 0–100). */
const W_SKILLS = 0.5;
const W_EXPERIENCE = 0.2;
const W_TITLE = 0.15;
const W_LOCATION = 0.05;
const W_BONUS = 0.1;

export type MatchBreakdown = {
  version: 2;
  rule_score: number;
  ai_score: number | null;
  hybrid_score: number;
  hybrid_weights: { rule: number; ai: number };
  skills_component: number;
  experience_component: number;
  title_component: number;
  location_component: number;
  bonus_component: number;
  must_total: number;
  must_matched: number;
  nice_total: number;
  nice_matched: number;
  keyword_hits: number;
  penalties: string[];
  summary: string[];
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
  ai_reasoning?: string;
  ai_category_scores?: AiCategoryScores;
  ai_responsibility_comparison?: string[];
  ai_strengths?: string[];
  ai_gaps?: string[];
  ai_risk_flags?: string[];
  ai_recruiter_decision?: "Proceed to Interview" | "Hold" | "Reject";
  ai_candidate_name?: string;
  ai_decision_reason?: string;
  ai_recruiter_summary?: string;
  /** Step-1 structured parse from recruiter pipeline (semantic, not keyword rules). */
  ai_parsed_profile?: ParsedMatchProfile;
  /** When AI drives the headline %, UI may hide noisy rule-only sub-scores. */
  scoring_mode?: "ai_primary" | "rule_only" | "quick_filter" | "embedding_rank" | "pair_rerank";
  /** Global rank for this job after sorting all candidates by match_score (1 = best). */
  ai_match_rank?: number | null;
  /** True when among top N (see extract + shortlistService) for this job run. */
  ai_shortlisted?: boolean;
  /** Fit tier from headline match_score. */
  ai_fit_tier?: "Strong Fit" | "Potential" | "Low Fit";
  job_experience_label?: string | null;
  candidate_years_estimated?: number | null;
};

/** Enhanced title tokenization with semantic understanding */
function tokenizeTitle(title: string | null | undefined): { tokens: string[]; semantics: string[]; level: string | null } {
  if (!title) return { tokens: [], semantics: [], level: null };
  
  const lower = title.toLowerCase();
  const tokens = lower
    .split(/[\s,/|+]+/)
    .map((w) => w.replace(/[^a-z0-9.#]/g, ""))
    .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
  
  // Extract semantic concepts
  const semantics: string[] = [];
  for (const [role, config] of Object.entries(ROLE_SEMANTICS)) {
    if (config.synonyms.some(syn => lower.includes(syn)) || 
        config.related.some(rel => lower.includes(rel))) {
      semantics.push(role);
    }
  }
  
  // Extract seniority level
  let level: string | null = null;
  if (/\b(entry|junior|jr|associate|intern|trainee)\b/.test(lower)) level = 'junior';
  else if (/\b(mid|intermediate|regular)\b/.test(lower)) level = 'mid';
  else if (/\b(senior|sr|sr\.|experienced|advanced)\b/.test(lower)) level = 'senior';
  else if (/\b(lead|principal|staff|architect)\b/.test(lower)) level = 'lead';
  else if (/\b(director|vp|head|cto|manager)\b/.test(lower)) level = 'executive';
  
  return { tokens, semantics, level };
}

/** Enhanced title overlap scoring with semantic understanding */
function scoreTitleOverlap(jobTitle: string | null | undefined, candidateSkillsRaw: string | null | undefined): number {
  const jobTokens = tokenizeTitle(jobTitle);
  const candidateTokens = tokenizeTitle(candidateSkillsRaw);
  
  if (jobTokens.tokens.length === 0) return 65;
  
  let exactMatches = 0;
  let semanticMatches = 0;
  let levelMatches = 0;
  
  // Exact token matching
  for (const token of jobTokens.tokens) {
    if (candidateTokens.tokens.includes(token)) {
      exactMatches += 1;
    }
  }
  
  // Semantic matching
  for (const jobSemantic of jobTokens.semantics) {
    if (candidateTokens.semantics.includes(jobSemantic)) {
      semanticMatches += 2; // Weight semantic matches higher
    }
  }
  
  // Seniority level matching
  if (jobTokens.level && candidateTokens.level) {
    if (jobTokens.level === candidateTokens.level) {
      levelMatches = 3;
    } else {
      // Partial level matching
      const levelHierarchy: Record<string, string[]> = {
        'junior': ['junior', 'mid'],
        'mid': ['junior', 'mid', 'senior'],
        'senior': ['mid', 'senior', 'lead'],
        'lead': ['senior', 'lead', 'executive'],
        'executive': ['lead', 'executive']
      };
      
      if (levelHierarchy[jobTokens.level]?.includes(candidateTokens.level)) {
        levelMatches = 1.5;
      }
    }
  }
  
  const totalMatches = exactMatches + semanticMatches + levelMatches;
  const maxPossible = jobTokens.tokens.length + (jobTokens.semantics.length * 2) + 3;
  
  const baseScore = Math.min(100, (totalMatches / maxPossible) * 100);
  
  // Bonus for strong semantic alignment
  if (semanticMatches > 0 && jobTokens.semantics.length > 0) {
    const semanticRatio = semanticMatches / (jobTokens.semantics.length * 2);
    return Math.min(100, baseScore + (semanticRatio * 15));
  }
  
  return Math.round(baseScore);
}

function scoreLocationMatch(
  candidateLocation: string | null | undefined,
  jobLocation: string | null | undefined
): number {
  const a = (candidateLocation || "").trim().toLowerCase();
  const b = (jobLocation || "").trim().toLowerCase();
  if (!a || !b) return 55;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 90;
  const aw = new Set(a.split(/[\s,/-]+/).filter((x) => x.length > 2));
  const bw = new Set(b.split(/[\s,/-]+/).filter((x) => x.length > 2));
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter += 1;
  if (inter === 0) return 25;
  return Math.min(100, 40 + inter * 25);
}

function scoreBonusExtraSkills(
  candidateKeys: Set<string>,
  niceCanon: string[],
  keywordCanon: string[]
): number {
  const pool = new Set([...niceCanon, ...keywordCanon]);
  if (pool.size === 0) return 60;
  let hits = 0;
  for (const p of pool) {
    if (candidateHasSkill(candidateKeys, p)) hits += 1;
  }
  const ratio = hits / pool.size;
  return Math.round(ratio * 100);
}

/**
 * Rule-based match (Phases 3–5, 9): weighted components + penalties.
 */
export function computeRuleBasedMatchScore(params: {
  profile: ExtractedSkillProfile;
  candidateSkillsRaw: string | null | undefined;
  candidateLocation?: string | null;
  jobLocation?: string | null;
  jobTitle?: string | null;
  experienceRequirement?: string | null;
}): {
  score: number;
  matched: string[];
  missingMust: string[];
  breakdown: Omit<MatchBreakdown, "ai_score" | "hybrid_score" | "hybrid_weights" | "version"> & {
    version: 2;
    rule_score: number;
    hybrid_score: number;
    hybrid_weights: { rule: number; ai: number };
    ai_score: null;
  };
} {
  const mustCanon = normalizeSkillList(params.profile.must_have);
  const niceCanon = normalizeSkillList(params.profile.nice_to_have);
  const keywordCanon = normalizeSkillList(params.profile.keywords);

  const candidateKeys = parseCandidateSkillsNormalized(params.candidateSkillsRaw);
  const matchedCanon: string[] = [];
  const missingMustCanon: string[] = [];

  for (const m of mustCanon) {
    if (candidateHasSkill(candidateKeys, m)) matchedCanon.push(m);
    else missingMustCanon.push(m);
  }

  for (const n of niceCanon) {
    if (candidateHasSkill(candidateKeys, n) && !matchedCanon.includes(n)) matchedCanon.push(n);
  }

  const mustTotal = Math.max(mustCanon.length, 1);
  const mustHit = mustCanon.filter((m) => candidateHasSkill(candidateKeys, m)).length;
  const mustRatio = mustHit / mustTotal;

  const niceTotal = Math.max(niceCanon.length, 1);
  const niceHit = niceCanon.filter((n) => candidateHasSkill(candidateKeys, n)).length;
  const niceRatio = niceCanon.length ? niceHit / niceTotal : 1;

  const skillsComponent = Math.round(100 * (0.72 * mustRatio + 0.28 * niceRatio));

  let kwHit = 0;
  for (const k of keywordCanon) {
    if (candidateHasSkill(candidateKeys, k)) kwHit += 1;
  }
  const keywordBoost = Math.min(8, kwHit * 2);
  const skillsWithKw = Math.min(100, skillsComponent + keywordBoost);

  const jobBand = parseJobExperienceBand(params.experienceRequirement);
  const candYears = parseCandidateExperienceYears(params.candidateSkillsRaw);
  const experienceComponent = Math.round(scoreExperienceFit(jobBand, candYears));

  const titleComponent = scoreTitleOverlap(params.jobTitle, params.candidateSkillsRaw);
  const locationComponent = scoreLocationMatch(params.candidateLocation, params.jobLocation);
  const bonusComponent = scoreBonusExtraSkills(candidateKeys, niceCanon, keywordCanon);

  let weighted =
    W_SKILLS * skillsWithKw +
    W_EXPERIENCE * experienceComponent +
    W_TITLE * titleComponent +
    W_LOCATION * locationComponent +
    W_BONUS * bonusComponent;

  const penalties: string[] = [];
  const mustMissingRatio = mustCanon.length ? missingMustCanon.length / mustCanon.length : 0;

  // Enhanced intelligent penalty system
  
  // Critical skill gaps
  if (mustCanon.length >= 2 && mustMissingRatio >= 0.5) {
    weighted *= 0.72;
    penalties.push("Heavy must-have gaps (>50% missing)");
  }
  
  if (mustCanon.length >= 3 && mustRatio < 0.35) {
    weighted = Math.min(weighted, 48);
    penalties.push("Critical must-have coverage below 35%");
  }
  
  if (mustCanon.length >= 1 && mustRatio === 0) {
    weighted = Math.min(weighted, 28);
    penalties.push("No required skills matched");
  }
  
  // Experience misalignment penalties
  if (experienceComponent < 38 && jobBand) {
    const penalty = Math.min(15, (38 - experienceComponent) * 0.4);
    weighted -= penalty;
    penalties.push(`Experience band misaligned (-${Math.round(penalty)}pts)`);
  }
  
  // Experience level mismatch
  if (jobBand && candYears !== null) {
    const underQualified = jobBand.min - candYears;
    const overQualified = candYears - jobBand.max;
    
    if (underQualified > 3) {
      weighted -= 12;
      penalties.push("Significantly underqualified for experience level");
    } else if (underQualified > 1) {
      weighted -= 6;
      penalties.push("Underqualified for experience level");
    }
    
    if (overQualified > 8) {
      weighted -= 8;
      penalties.push("May be overqualified (risk of disengagement)");
    }
  }
  
  // Role compatibility penalties
  const jobRoleContext = extractRoleContext(params.jobTitle || "", "");
  const candidateRoleContext = extractRoleContext("", params.candidateSkillsRaw || "");
  
  if (jobRoleContext.role !== 'general' && candidateRoleContext.role !== 'general') {
    const roleCompatibility = scoreRoleCompatibility(jobRoleContext.role, candidateRoleContext.role);
    if (roleCompatibility < 70) {
      weighted -= 10;
      penalties.push("Role domain mismatch");
    } else if (roleCompatibility < 85) {
      weighted -= 5;
      penalties.push("Partial role alignment");
    }
  }
  
  // Seniority level penalties
  if (jobRoleContext.level && candidateRoleContext.level) {
    const levelGap = getSeniorityGap(jobRoleContext.level, candidateRoleContext.level);
    if (levelGap > 2) {
      weighted -= 8;
      penalties.push("Seniority level mismatch");
    } else if (levelGap > 1) {
      weighted -= 4;
      penalties.push("Seniority level gap");
    }
  }
  
  // Location penalties
  if (locationComponent < 40) {
    weighted -= 5;
    penalties.push("Location mismatch");
  }
  
  // Bonus penalties for concerning patterns
  if (skillsWithKw > 85 && mustRatio < 0.5) {
    weighted -= 8;
    penalties.push("Many keywords but poor core skill alignment");
  }
  
  // Reward exceptional matches
  if (mustRatio >= 0.9 && experienceComponent >= 90 && titleComponent >= 85) {
    weighted = Math.min(100, weighted + 5);
    penalties.push("Exceptional candidate bonus");
  }

  const ruleScore = Math.max(0, Math.min(100, Math.round(weighted)));

  const matched = [...new Set(matchedCanon.map((c) => displaySkillLabel(c)))];
  const missingMust = missingMustCanon.map((c) => displaySkillLabel(c));

  const summary: string[] = [];
  summary.push(`Skills fit: ${mustHit}/${mustCanon.length} must-have, ${niceHit}/${niceCanon.length} nice-to-have (normalized).`);
  if (jobBand) summary.push(`JD experience: ${jobBand.label}${candYears != null ? ` · candidate ~${candYears} yrs` : ""}.`);
  if (penalties.length) summary.push(`Penalties: ${penalties.join("; ")}.`);

  const breakdown = {
    version: 2 as const,
    rule_score: ruleScore,
    ai_score: null,
    hybrid_score: ruleScore,
    hybrid_weights: { rule: 1, ai: 0 },
    skills_component: skillsWithKw,
    experience_component: experienceComponent,
    title_component: titleComponent,
    location_component: locationComponent,
    bonus_component: bonusComponent,
    must_total: mustCanon.length,
    must_matched: mustHit,
    nice_total: niceCanon.length,
    nice_matched: niceHit,
    keyword_hits: kwHit,
    penalties,
    summary,
    job_experience_label: jobBand?.label ?? null,
    candidate_years_estimated: candYears,
  };

  return { score: ruleScore, matched, missingMust, breakdown };
}

/**
 * Rule score is for audit/breakdown only. When `ai` is present, final % is always AI.
 */
export function mergeHybridScore(
  ruleScore: number,
  ai: AiMatchResult | null | undefined
): { score: number; breakdownPatch: Partial<MatchBreakdown> } {
  if (!ai) {
    if (process.env.MATCH_DEBUG === "1") {
      console.log("mergeHybridScore: no AI (rule-only)", { ruleScore });
    }
    return { score: ruleScore, breakdownPatch: {} };
  }

  const s = Math.max(0, Math.min(100, Math.round(ai.match_score)));
  return {
    score: s,
    breakdownPatch: {
      ai_score: ai.match_score,
      hybrid_score: s,
      hybrid_weights: { rule: 0, ai: 1 },
      ai_recruiter_decision: ai.recruiter_decision,
      ai_strengths: ai.strengths,
      ai_gaps: ai.gaps,
      ai_risk_flags: ai.risk_flags,
      ai_recruiter_summary: ai.recruiter_summary,
      ai_matched_skills: ai.matched_skills,
      ai_missing_skills: ai.missing_skills,
      ai_reasoning: ai.reasoning,
      ai_category_scores: ai.category_scores,
      ai_responsibility_comparison: ai.responsibility_comparison,
      ai_candidate_name: ai.candidate_name,
      ai_decision_reason: ai.decision_reason,
      ...(ai.parsed_profile ? { ai_parsed_profile: ai.parsed_profile } : {}),
    },
  };
}

/** @deprecated Use computeRuleBasedMatchScore + mergeHybridScore in API layer */
export function computeMatchScore(
  profile: ExtractedSkillProfile,
  candidateSkillsRaw: string | null | undefined,
  candidateLocation?: string | null,
  jobLocation?: string | null
): { score: number; matched: string[]; missingMust: string[]; breakdown: MatchBreakdown } {
  const r = computeRuleBasedMatchScore({
    profile,
    candidateSkillsRaw,
    candidateLocation,
    jobLocation,
  });
  return {
    score: r.score,
    matched: r.matched,
    missingMust: r.missingMust,
    breakdown: r.breakdown as MatchBreakdown,
  };
}
