import { query } from "@/lib/db";

let skillsetCol: boolean | null = null;
let candidateSkillsCol: boolean | null = null;
let candidateExperienceCol: boolean | null = null;
let jobExpReqCol: boolean | null = null;
let jobSkillProfilesTable: boolean | null = null;

async function columnExists(table: string, col: string): Promise<boolean> {
  const r = await query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [table, col]
  );
  return (r.rowCount ?? 0) > 0;
}

async function tableExists(name: string): Promise<boolean> {
  const r = await query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = $1
    LIMIT 1
    `,
    [name]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function candidatesHasSkillset(): Promise<boolean> {
  if (skillsetCol !== null) return skillsetCol;
  try {
    skillsetCol = await columnExists("candidates", "skillset");
  } catch {
    skillsetCol = false;
  }
  return skillsetCol;
}

export async function candidatesHasSkillsCsv(): Promise<boolean> {
  if (candidateSkillsCol !== null) return candidateSkillsCol;
  try {
    candidateSkillsCol = await columnExists("candidates", "skills");
  } catch {
    candidateSkillsCol = false;
  }
  return candidateSkillsCol;
}

export async function candidatesHasExperience(): Promise<boolean> {
  if (candidateExperienceCol !== null) return candidateExperienceCol;
  try {
    candidateExperienceCol = await columnExists("candidates", "experience");
  } catch {
    candidateExperienceCol = false;
  }
  return candidateExperienceCol;
}

export async function jobsHasExperienceRequirement(): Promise<boolean> {
  if (jobExpReqCol !== null) return jobExpReqCol;
  try {
    jobExpReqCol = await columnExists("jobs", "experience_requirement");
  } catch {
    jobExpReqCol = false;
  }
  return jobExpReqCol;
}

export async function hasJobSkillProfilesTable(): Promise<boolean> {
  if (jobSkillProfilesTable !== null) return jobSkillProfilesTable;
  try {
    jobSkillProfilesTable = await tableExists("job_skill_profiles");
  } catch {
    jobSkillProfilesTable = false;
  }
  return jobSkillProfilesTable;
}
