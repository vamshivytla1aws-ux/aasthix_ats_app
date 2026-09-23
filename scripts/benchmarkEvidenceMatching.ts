/** Opt-in, paid benchmark. Input contains anonymized documents and HUMAN adjudications. */
import { readFile } from "fs/promises";
import { z } from "zod";
import { evaluateEvidenceSource } from "../lib/singleMatch/evidenceEvaluator";
import { contentHash } from "../lib/singleMatch/verifiedSource";

const fixtureSchema = z.array(z.object({
  id: z.string(), jd: z.string().min(50), resume: z.string().min(250),
  adjudicated_by: z.string().min(1), adjudicated_at: z.string().datetime(),
  expected_decision: z.enum(["Send to interview", "Do not shortlist on current evidence", "Clarification required"]),
  expected_min: z.number().min(0).max(100), expected_max: z.number().min(0).max(100),
  critical_case: z.boolean(),
  role_family: z.enum(["technical", "enterprise_platform", "nontechnical"]),
  case_tags: z.array(z.enum(["strong", "basics_only", "transferable", "contradictory", "missing_evidence", "long_document", "overlapping_employment"])).min(1),
}).refine(row => row.expected_min <= row.expected_max, "Expected score range is reversed")).min(60);

async function main() {
  const file = process.argv[2];
  const validateOnly = process.argv.includes("--validate-only");
  if (!file || (!validateOnly && !process.argv.includes("--allow-paid-evaluations"))) throw new Error("Usage: npx tsx scripts/benchmarkEvidenceMatching.ts fixtures.json --validate-only OR --allow-paid-evaluations [--repeat=2]");
  const fixtures = fixtureSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (new Set(fixtures.map(f => f.id)).size !== fixtures.length) throw new Error("Duplicate fixture IDs");
  if (new Set(fixtures.map(f => contentHash(`${f.jd}\n${f.resume}`))).size !== fixtures.length) throw new Error("Duplicate JD/resume pairs cannot count toward the 60-pair benchmark");
  if (new Set(fixtures.map(f => f.role_family)).size !== 3) throw new Error("Include technical, enterprise-platform and nontechnical pairs");
  const tags = new Set(fixtures.flatMap(f => f.case_tags));
  if (["strong", "basics_only", "transferable", "contradictory", "missing_evidence", "long_document", "overlapping_employment"].some(tag => !tags.has(tag as typeof fixtures[number]["case_tags"][number]))) throw new Error("Benchmark does not cover all required edge-case categories");
  if (validateOnly) { console.log(JSON.stringify({ valid: true, pairs: fixtures.length, paid_requests: 0 })); return; }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the paid benchmark; no evaluations were run");
  const repeats = Math.min(3, Math.max(1, Number(process.argv.find(a => a.startsWith("--repeat="))?.split("=")[1]) || 1));
  let agreed = 0, criticalErrors = 0, unstable = 0, unavailable = 0, rangeErrors = 0, integrityErrors = 0;
  for (const fixture of fixtures) {
    const decisions: string[] = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
      const result = await evaluateEvidenceSource({ text: fixture.resume, fileHash: contentHash(fixture.resume), parserVersion: "adjudicated-text-fixture-v1", pages: 1 }, fixture.jd);
      const agreement = result.decision === fixture.expected_decision;
      if (agreement) agreed++;
      if (result.match_score == null) unavailable++;
      if (!agreement && fixture.critical_case) criticalErrors++;
      const withinRange = result.match_score != null && result.match_score >= fixture.expected_min && result.match_score <= fixture.expected_max;
      if (!withinRange) rangeErrors++;
      const evaluation = result.evidence_evaluation;
      if (!evaluation || evaluation.coverage.processed_characters !== evaluation.coverage.resume_characters ||
          evaluation.coverage.requirements !== evaluation.coverage.evaluated_requirements ||
          evaluation.requirements.some(row => row.credit > 0 && (!row.evidence.length || row.audit_issues.length))) integrityErrors++;
      decisions.push(result.decision || "unavailable");
      // Never log resume text, email, or evidence in benchmark output.
      console.log(JSON.stringify({ id: fixture.id, repeat, decision: result.decision, score: result.match_score, agreement,
        within_range: withinRange,
        audit: result.evidence_evaluation?.audit.outcome, usage: result.evidence_evaluation?.usage }));
    }
    if (new Set(decisions).size > 1) unstable++;
  }
  const agreement = agreed / (fixtures.length * repeats);
  const pass = agreement >= 0.9 && criticalErrors === 0 && unstable === 0 && unavailable === 0 && rangeErrors === 0 && integrityErrors === 0;
  console.log(JSON.stringify({ agreement, criticalErrors, unstable, unavailable, rangeErrors, integrityErrors, release_gate_passed: pass }));
  if (!pass) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Benchmark failed"); process.exitCode = 1; });
