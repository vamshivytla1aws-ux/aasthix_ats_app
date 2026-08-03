/**
 * Next.js instrumentation hook — runs once on server startup.
 * Used for idempotent schema migrations.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { query } = await import("@/lib/db");
      // Coding questions support
      await query(`
        ALTER TABLE ai_interview_questions
          ADD COLUMN IF NOT EXISTS question_type   VARCHAR(20) NOT NULL DEFAULT 'TECHNICAL',
          ADD COLUMN IF NOT EXISTS starter_code    TEXT,
          ADD COLUMN IF NOT EXISTS coding_language VARCHAR(50) NOT NULL DEFAULT 'python'
      `);
    } catch (err) {
      // Non-fatal — log and continue so the server boots even if migration fails.
      console.error("[startup-migration] coding questions columns:", err);
    }
  }
}
