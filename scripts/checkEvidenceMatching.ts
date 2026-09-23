/** Read-only readiness check. Does not migrate, evaluate candidates, or consume model tokens. */
import { getAiModelConfig } from "../lib/ai/modelConfig";
import { query } from "../lib/db";

async function main() {
  const model = getAiModelConfig().resumeMatchModel;
  const checks = {
    feature_enabled: process.env.MATCH_EVIDENCE_V3_ENABLED === "true",
    database_configured: Boolean(process.env.DATABASE_URL),
    nullable_score_migration: false,
    evidence_history_column: false,
    provider_configured: Boolean(process.env.OPENAI_API_KEY),
    model,
    model_accessible: false,
  };
  if (checks.database_configured) {
    try {
      const { rows } = await query(`SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'single_candidate_match_checks'
        AND column_name IN ('match_score', 'advanced_insights_json')`);
      const columns = rows as Array<{ column_name: string; is_nullable: string }>;
      checks.nullable_score_migration = columns.some(row => row.column_name === "match_score" && row.is_nullable === "YES");
      checks.evidence_history_column = columns.some(row => row.column_name === "advanced_insights_json");
    } catch { /* Connection details and credentials must not be printed. */ }
  }
  if (checks.provider_configured) {
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(8000),
      });
      checks.model_accessible = response.ok;
      await response.body?.cancel();
    } catch { /* Report readiness only, never raw provider errors. */ }
  }
  const ready = checks.nullable_score_migration && checks.evidence_history_column && checks.model_accessible;
  console.log(JSON.stringify({ checks, ready_for_staging: ready,
    note: "Model listing does not prove generation compatibility or matching accuracy. Run the adjudicated benchmark before production activation." }, null, 2));
  if (!ready) process.exitCode = 1;
}
main().catch(() => { console.error("Readiness check could not complete."); process.exitCode = 1; });
