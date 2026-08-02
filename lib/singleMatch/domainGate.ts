export const MATCH_SCORING_POLICY_VERSION = "strict-domain-v2";
export const MATCH_RUBRIC_VERSION = "full-jd-evidence-v2";

export type DomainEvidenceDepth = "hands_on" | "transferable" | "basics" | "none";

export type PrimaryDomainGate = {
  key: string;
  label: string;
  evidence_depth: DomainEvidenceDepth;
  evidence: string[];
  cap: number | null;
  decision_ceiling: "Send to interview" | "Needs recruiter review" | "Hold" | "Reject";
  reason: string;
};

export type SingleMatchDomainGate = PrimaryDomainGate;

type DomainDefinition = {
  key: string;
  label: string;
  aliases: RegExp;
  family?: RegExp;
};

const DEFINITIONS: DomainDefinition[] = [
  { key: "dynamics_365", label: "Microsoft Dynamics 365", aliases: /\b(?:microsoft\s+)?dynamics\s*(?:365|crm)|\bd365\b/i, family: /\bcrm\b|customer relationship management/i },
  { key: "salesforce", label: "Salesforce", aliases: /\bsalesforce\b|\bapex\b|\blwc\b|lightning web component/i, family: /\bcrm\b|customer relationship management/i },
  { key: "sap", label: "SAP", aliases: /\bsap\b|\bs\/4hana\b|\babap\b|\bsuccessfactors\b/i, family: /\berp\b|enterprise resource planning/i },
  { key: "servicenow", label: "ServiceNow", aliases: /\bservice\s*now\b/i, family: /\bitsm\b|service management/i },
  { key: "workday", label: "Workday", aliases: /\bworkday\b/i, family: /\bhcm\b|human capital management/i },
  { key: "oracle", label: "Oracle enterprise applications", aliases: /\boracle\s+(?:hcm|fusion|ebs|cloud applications?)\b/i, family: /\berp\b|\bhcm\b/i },
  { key: "snowflake", label: "Snowflake", aliases: /\bsnowflake\b/i, family: /data warehouse|data engineering/i },
  { key: "databricks", label: "Databricks", aliases: /\bdatabricks\b/i, family: /data engineering|lakehouse|spark/i },
  { key: "react", label: "React", aliases: /\breact(?:\.js|js)?\b/i, family: /front[-\s]?end|javascript|typescript/i },
  { key: "java", label: "Java", aliases: /\bjava\b|\bspring\s*boot\b/i, family: /backend|object[-\s]?oriented|microservices?/i },
  { key: "dotnet", label: ".NET", aliases: /\b\.net\b|\bdotnet\b|\bc#\b|\basp\.net\b/i, family: /backend|microsoft stack|microservices?/i },
  { key: "python", label: "Python", aliases: /\bpython\b|\bfastapi\b|\bdjango\b|\bflask\b/i, family: /backend|data engineering|machine learning/i },
  { key: "devops", label: "DevOps", aliases: /\bdevops\b|\bkubernetes\b|\bterraform\b/i, family: /cloud|platform engineering|ci\/cd/i },
  { key: "qa_automation", label: "QA automation", aliases: /\bselenium\b|\bcypress\b|\bplaywright\b|test automation/i, family: /\bqa\b|quality assurance|testing/i },
  { key: "llm_agents", label: "LLM and agent systems", aliases: /\bllm(?:s)?\b|large language model|\blanggraph\b|\blangchain\b|agentic|multi[-\s]?agent|\brag\b/i, family: /artificial intelligence|machine learning|generative ai/i },
];

const BASIC = /\b(?:basic|basics|beginner|awareness|aware of|familiar(?:ity)?|exposure|learning|trained|training|course(?:work)?|certification only|theoretical)\b/i;
const HANDS_ON = /\b(?:implemented|implementing|configured|configuring|customi[sz]ed|customi[sz]ing|integrated|integrating|migrated|migrating|developed|developing|built|building|designed|designing|deployed|deploying|administered|administering|managed|managing|owned|owning|architected|architecting|delivered|delivering|supported|supporting|production|project|client|module|workflow|plugin|api)\b/i;

function lines(text: string) {
  return text.split(/\r?\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
}

function primaryDefinition(jobTitle: string, jd: string, mustHave: string[]): DomainDefinition | null {
  const titleHit = DEFINITIONS.find((definition) => definition.aliases.test(jobTitle));
  if (titleHit) return titleHit;
  const mustText = mustHave.join("\n");
  const mustHit = DEFINITIONS.find((definition) => definition.aliases.test(mustText));
  if (mustHit) return mustHit;
  return DEFINITIONS.find((definition) => {
    const matches = jd.match(new RegExp(definition.aliases.source, `${definition.aliases.flags.includes("g") ? definition.aliases.flags : `${definition.aliases.flags}g`}`));
    return (matches?.length || 0) >= 2;
  }) || null;
}

export function evaluatePrimaryDomainGate(input: {
  jobTitle: string;
  jobDescription: string;
  mustHave: string[];
  resumeText: string;
}): PrimaryDomainGate | null {
  const definition = primaryDefinition(input.jobTitle, input.jobDescription, input.mustHave);
  if (!definition) return null;
  const resumeLines = lines(input.resumeText);
  const direct = resumeLines.filter((line) => definition.aliases.test(line)).slice(0, 5);
  const handsOn = direct.filter((line) => HANDS_ON.test(line) && !BASIC.test(line));
  if (handsOn.length) {
    return {
      key: definition.key,
      label: definition.label,
      evidence_depth: "hands_on",
      evidence: handsOn,
      cap: null,
      decision_ceiling: "Send to interview",
      reason: `Resume contains hands-on delivery evidence for ${definition.label}.`,
    };
  }
  if (direct.length) {
    return {
      key: definition.key,
      label: definition.label,
      evidence_depth: "basics",
      evidence: direct,
      cap: 49,
      decision_ceiling: "Hold",
      reason: `Resume mentions ${definition.label}, but only basic/exposure-level evidence is proven; hands-on delivery is not demonstrated.`,
    };
  }
  const transferable = definition.family ? resumeLines.filter((line) => definition.family!.test(line)).slice(0, 4) : [];
  if (transferable.length) {
    return {
      key: definition.key,
      label: definition.label,
      evidence_depth: "transferable",
      evidence: transferable,
      cap: 59,
      decision_ceiling: "Hold",
      reason: `Resume has transferable experience near ${definition.label}, but no direct production evidence for the required platform/domain.`,
    };
  }
  return {
    key: definition.key,
    label: definition.label,
    evidence_depth: "none",
    evidence: [],
    cap: 39,
    decision_ceiling: "Reject",
    reason: `No direct resume evidence was found for the primary requirement ${definition.label}.`,
  };
}

export function applyPrimaryDomainGate(score: number, gate: PrimaryDomainGate | null) {
  return gate?.cap == null ? Math.max(0, Math.min(100, Math.round(score))) : Math.min(Math.round(score), gate.cap);
}
