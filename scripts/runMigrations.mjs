import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const migrationsDir = path.join(process.cwd(), "migrations");
const files = (await fs.readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const baselineThrough = process.env.MIGRATIONS_BASELINE_THROUGH?.trim() || "";

function normalizeSql(file, sql) {
  if (file !== "0004_applications_stage.sql") return sql;
  return `
BEGIN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS stage TEXT;
UPDATE applications SET stage = COALESCE(stage, status) WHERE stage IS NULL;
ALTER TABLE applications ALTER COLUMN stage SET NOT NULL;
ALTER TABLE applications ALTER COLUMN stage SET DEFAULT 'Applied';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_stage_check'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_stage_check
      CHECK (stage IN ('Applied', 'Screening', 'Interview', 'Selected', 'Rejected'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS applications_stage_idx ON applications(stage);
CREATE INDEX IF NOT EXISTS applications_stage_updated_at_idx ON applications(stage, updated_at DESC);
COMMIT;
`;
}

await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    file_name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

if (baselineThrough) {
  const baselineFiles = files.filter((file) => file.localeCompare(baselineThrough) <= 0);
  for (const file of baselineFiles) {
    await client.query(
      `
      INSERT INTO schema_migrations (file_name)
      VALUES ($1)
      ON CONFLICT (file_name) DO NOTHING
      `,
      [file]
    );
  }
}

const appliedRes = await client.query(`SELECT file_name FROM schema_migrations`);
const applied = new Set(appliedRes.rows.map((row) => String(row.file_name)));

for (const file of files) {
  if (applied.has(file)) {
    process.stdout.write(`[migrate] skip ${file}\n`);
    continue;
  }
  const rawSql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  const sql = normalizeSql(file, rawSql);
  process.stdout.write(`[migrate] ${file}\n`);
  await client.query(sql);
  await client.query(`INSERT INTO schema_migrations (file_name) VALUES ($1)`, [file]);
}
await client.end();
process.stdout.write('[migrate] complete\n');
