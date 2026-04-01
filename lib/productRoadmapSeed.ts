/**
 * Product initiative cards for the roadmap board.
 * Stages must match PipelineBoard: Applied | Screening | Interview | Selected | Rejected
 * (same column workflow; Rejected = parked / deferred for product work).
 */

export const PRODUCT_ROADMAP_STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Selected",
  "Rejected",
] as const;

export type ProductRoadmapStage = (typeof PRODUCT_ROADMAP_STAGES)[number];

export type ProductRoadmapEpic =
  | "Candidate & profile"
  | "Skills & search"
  | "Jobs"
  | "Pipeline & collaboration"
  | "Clients & commercial"
  | "Offers";

export type ProductRoadmapItem = {
  id: string;
  title: string;
  description: string;
  epic: ProductRoadmapEpic;
  /** Initial column when no localStorage override exists */
  defaultStage: ProductRoadmapStage;
};

export const PRODUCT_ROADMAP_STAGE_HINTS: Record<ProductRoadmapStage, string> = {
  Applied: "Backlog — captured ideas",
  Screening: "Discovery & specification",
  Interview: "Build & integrate",
  Selected: "Ready to release",
  Rejected: "Parked / won’t do (for now)",
};

export const PRODUCT_ROADMAP_ITEMS: ProductRoadmapItem[] = [
  // Candidate & profile intelligence
  {
    id: "feat-resume-versioning",
    title: "Resume versioning",
    description: "Keep every upload, diff summary, active version picker.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-duplicate-detection",
    title: "Duplicate detection",
    description: "Email / phone / name + fuzzy match, merge wizard.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-consent-retention",
    title: "Consent & data retention",
    description: "GDPR-style consent log, export, anonymize, retention rules.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-custom-fields",
    title: "Custom fields & sections",
    description: "Admin-defined fields per tenant or per role.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-tags-segments",
    title: "Tags & segments",
    description: "Saved filters as shareable lists (e.g. Java + 5y + Bangalore).",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-talent-pools",
    title: "Talent pools",
    description: "Passive candidates, nurture campaigns, do-not-contact.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  {
    id: "feat-referral-tracking",
    title: "Referral tracking",
    description: "Who referred, bonus rules, attribution.",
    epic: "Candidate & profile",
    defaultStage: "Applied",
  },
  // Skills, matching & search
  {
    id: "feat-skill-ontology",
    title: "Skill ontology",
    description: "Synonyms, levels (L1–L5), certifications linked to skills.",
    epic: "Skills & search",
    defaultStage: "Screening",
  },
  {
    id: "feat-job-candidate-match",
    title: "Job–candidate match score",
    description: "Explainable breakdown: must-have vs nice-to-have.",
    epic: "Skills & search",
    defaultStage: "Interview",
  },
  {
    id: "feat-semantic-search",
    title: "Semantic / AI search",
    description: "Natural language over profiles + jobs (e.g. senior React in fintech).",
    epic: "Skills & search",
    defaultStage: "Applied",
  },
  {
    id: "feat-skill-gap-report",
    title: "Skill gap report",
    description: "Per job: common missing skills across shortlisted candidates.",
    epic: "Skills & search",
    defaultStage: "Applied",
  },
  // Jobs, requisitions
  {
    id: "feat-job-templates",
    title: "Job templates",
    description: "Clone from template, standard JD blocks.",
    epic: "Jobs",
    defaultStage: "Applied",
  },
  {
    id: "feat-posting-channels",
    title: "Posting channels",
    description: "Track source per application: careers, LinkedIn, vendor, etc.",
    epic: "Jobs",
    defaultStage: "Applied",
  },
  {
    id: "feat-internal-mobility",
    title: "Internal mobility",
    description: "Internal-only jobs, employee apply flow.",
    epic: "Jobs",
    defaultStage: "Applied",
  },
  // Pipeline & collaboration
  {
    id: "feat-stage-slas",
    title: "Stage SLAs & aging",
    description: "Alerts when a candidate is stuck in a stage beyond X days.",
    epic: "Pipeline & collaboration",
    defaultStage: "Applied",
  },
  {
    id: "feat-interview-scorecards",
    title: "Interview scorecards",
    description: "Structured rubrics, calibration, comparison view.",
    epic: "Pipeline & collaboration",
    defaultStage: "Screening",
  },
  {
    id: "feat-panel-scheduling",
    title: "Panel scheduling",
    description: "Propose slots, Google/Outlook sync, reminders.",
    epic: "Pipeline & collaboration",
    defaultStage: "Applied",
  },
  {
    id: "feat-mentions-activity",
    title: "@mentions & activity feed",
    description: "Notes, tasks, follow-up reminders (e.g. by Friday).",
    epic: "Pipeline & collaboration",
    defaultStage: "Applied",
  },
  {
    id: "feat-hiring-team-roles",
    title: "Hiring team roles",
    description: "Recruiter vs HM vs interviewer permissions per job.",
    epic: "Pipeline & collaboration",
    defaultStage: "Applied",
  },
  // Clients, vendors & commercial
  {
    id: "feat-client-portals",
    title: "Client portals",
    description: "Shortlists, feedback, status — read-only / branded.",
    epic: "Clients & commercial",
    defaultStage: "Applied",
  },
  {
    id: "feat-rate-cards",
    title: "Rate cards & commercials",
    description: "Per client/vendor, margin on placements.",
    epic: "Clients & commercial",
    defaultStage: "Applied",
  },
  {
    id: "feat-msa-sow",
    title: "MSA / SOW tracking",
    description: "Renewals, agreement gates extended into workflows.",
    epic: "Clients & commercial",
    defaultStage: "Screening",
  },
  {
    id: "feat-vendor-performance",
    title: "Vendor performance",
    description: "Time-to-submit, interview ratio, offer rate.",
    epic: "Clients & commercial",
    defaultStage: "Applied",
  },
  // Offers & compliance
  {
    id: "feat-offer-letter-builder",
    title: "Offer letter builder",
    description: "Templates, variables, e-sign integration.",
    epic: "Offers",
    defaultStage: "Applied",
  },
];

const epicStyles: Record<
  ProductRoadmapEpic,
  { badgeBg: string; badgeText: string; border: string }
> = {
  "Candidate & profile": {
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-800",
    border: "border-violet-200/80",
  },
  "Skills & search": {
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
    border: "border-sky-200/80",
  },
  Jobs: {
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-900",
    border: "border-amber-200/80",
  },
  "Pipeline & collaboration": {
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-800",
    border: "border-indigo-200/80",
  },
  "Clients & commercial": {
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    border: "border-emerald-200/80",
  },
  Offers: {
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
    border: "border-rose-200/80",
  },
};

export function epicStyle(epic: ProductRoadmapEpic) {
  return epicStyles[epic];
}
