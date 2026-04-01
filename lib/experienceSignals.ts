/**
 * Enhanced experience parsing with role context and semantic understanding.
 */

export type ExperienceBand = { min: number; max: number; label: string };
export type RoleLevel = 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'executive';

/** Role level mappings with typical experience requirements */
const ROLE_LEVELS: Record<string, { level: RoleLevel; minExp: number; maxExp: number; keywords: string[] }> = {
  'entry': { level: 'entry', minExp: 0, maxExp: 2, keywords: ['entry', 'junior', 'jr', 'associate', 'intern', 'trainee', 'graduate'] },
  'junior': { level: 'junior', minExp: 1, maxExp: 3, keywords: ['junior', 'jr', 'associate', 'beginner'] },
  'mid': { level: 'mid', minExp: 3, maxExp: 6, keywords: ['mid', 'intermediate', 'regular', 'professional'] },
  'senior': { level: 'senior', minExp: 5, maxExp: 10, keywords: ['senior', 'sr', 'sr.', 'experienced', 'advanced'] },
  'lead': { level: 'lead', minExp: 7, maxExp: 12, keywords: ['lead', 'team lead', 'tech lead', 'principal'] },
  'principal': { level: 'principal', minExp: 8, maxExp: 15, keywords: ['principal', 'staff', 'architect', 'senior principal'] },
  'executive': { level: 'executive', minExp: 10, maxExp: 25, keywords: ['director', 'vp', 'head', 'cto', 'manager', 'executive'] }
};

/** Detect role level from text */
function detectRoleLevel(text: string): RoleLevel | null {
  const lower = text.toLowerCase();
  
  // Check for explicit role level indicators
  for (const [levelName, config] of Object.entries(ROLE_LEVELS)) {
    for (const keyword of config.keywords) {
      if (lower.includes(keyword)) {
        return config.level as RoleLevel;
      }
    }
  }
  
  return null;
}

/** Extract role context from job title/description */
function extractRoleContext(title: string, description: string): { role: string; level: RoleLevel | null; domain: string } {
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
  
  return {
    role: detectedRole,
    level: detectRoleLevel(combined),
    domain: detectedDomain
  };
}

/** Extract a numeric band from JD text like "4-6 years", "5+ years", "3 to 5 yrs" with role context. */
export function parseJobExperienceBand(text: string | null | undefined): ExperienceBand | null {
  if (!text || !String(text).trim()) return null;
  const t = String(text).toLowerCase();

  // Try explicit numeric ranges first
  const range = t.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:yrs?|years?)?/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      return { min, max, label: `${min}-${max} yrs` };
    }
  }

  const plus = t.match(/(\d+)\s*\+\s*(?:yrs?|years?)?/);
  if (plus) {
    const n = Number(plus[1]);
    if (Number.isFinite(n)) return { min: n, max: n + 8, label: `${n}+ yrs` };
  }

  const single = t.match(/(\d+)\s*(?:yrs?|years?)/);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n)) return { min: Math.max(0, n - 1), max: n + 2, label: `${n} yrs` };
  }

  // Enhanced role-based inference
  const roleLevel = detectRoleLevel(t);
  if (roleLevel && ROLE_LEVELS[roleLevel]) {
    const config = ROLE_LEVELS[roleLevel];
    return { 
      min: config.minExp, 
      max: config.maxExp, 
      label: `${roleLevel}-level (est. ${config.minExp}+ yrs)` 
    };
  }

  return null;
}

/** Enhanced candidate experience parsing with role context */
export function parseCandidateExperienceYears(skills: string | null | undefined): number | null {
  if (!skills) return null;
  const t = String(skills).toLowerCase();
  
  // Direct year patterns
  const m = t.match(/(\d{1,2})\s*\+?\s*(?:yrs?|years?)(?:\s+of)?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 50) return n;
  }
  
  const range = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:yrs?|years?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 0 && b <= 50) return Math.round((a + b) / 2);
  }
  
  // Role-based inference from titles
  const roleLevel = detectRoleLevel(t);
  if (roleLevel && ROLE_LEVELS[roleLevel]) {
    const config = ROLE_LEVELS[roleLevel];
    return Math.round((config.minExp + config.maxExp) / 2);
  }
  
  // Experience indicators from skills
  const expIndicators = [
    { pattern: /expert|senior|lead|principal/, years: 7 },
    { pattern: /advanced|strong|proficient/, years: 5 },
    { pattern: /intermediate|familiar/, years: 3 },
    { pattern: /beginner|junior|entry/, years: 1 }
  ];
  
  for (const { pattern, years } of expIndicators) {
    if (pattern.test(t)) return years;
  }
  
  return null;
}

/** Extract candidate role context from skills/profile */
export function parseCandidateRoleContext(skills: string | null | undefined): { role: string; level: RoleLevel | null; domain: string } {
  if (!skills) return { role: 'general', level: null, domain: 'general' };
  return extractRoleContext('', skills);
}

/** Enhanced experience scoring with role and domain context */
export function scoreExperienceFit(jobBand: ExperienceBand | null, candidateYears: number | null): number {
  if (!jobBand) return 70;
  if (candidateYears == null) return 55;

  // Perfect match
  if (candidateYears >= jobBand.min && candidateYears <= jobBand.max) return 100;
  
  // Underqualified penalty
  if (candidateYears < jobBand.min) {
    const gap = jobBand.min - candidateYears;
    if (gap <= 1) return 85; // Small gap
    if (gap <= 2) return 70; // Moderate gap
    return Math.max(20, 100 - gap * 25); // Large gap
  }
  
  // Overqualified penalty (less severe)
  const over = candidateYears - jobBand.max;
  if (over <= 2) return 95; // Slightly overqualified
  if (over <= 5) return 85; // Moderately overqualified
  return Math.max(50, 100 - over * 10); // Significantly overqualified
}

/** Role compatibility scoring */
export function scoreRoleCompatibility(jobRole: string, candidateRole: string): number {
  if (!jobRole || !candidateRole) return 70;
  
  // Exact match
  if (jobRole === candidateRole) return 100;
  
  // Compatible roles
  const compatibleRoles: Record<string, string[]> = {
    'engineering': ['fullstack', 'frontend', 'backend', 'mobile', 'devops'],
    'frontend': ['engineering', 'fullstack', 'design'],
    'backend': ['engineering', 'fullstack', 'devops'],
    'fullstack': ['engineering', 'frontend', 'backend'],
    'devops': ['engineering', 'backend', 'cloud'],
    'design': ['frontend', 'product'],
    'product': ['design', 'engineering', 'management'],
    'management': ['product', 'engineering', 'analytics'],
    'analytics': ['data', 'product', 'management']
  };
  
  if (compatibleRoles[jobRole]?.includes(candidateRole)) return 85;
  if (compatibleRoles[candidateRole]?.includes(jobRole)) return 80;
  
  return 60; // Different domains
}
