/**
 * Set a user's password_hash in Postgres (bcrypt). For ops / Railway CLI when DATABASE_URL is set.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/setUserPassword.mjs user@example.com "NewSecurePass123"
 *
 * Railway:
 *   railway run node scripts/setUserPassword.mjs user@example.com "NewSecurePass123"
 */
import bcrypt from "bcryptjs";
import pg from "pg";

const MIN_LEN = 8;

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

if (!emailArg || !passwordArg) {
  console.error("Usage: node scripts/setUserPassword.mjs <email> <new-password>");
  process.exit(1);
}

if (passwordArg.length < MIN_LEN) {
  console.error(`Password must be at least ${MIN_LEN} characters`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

await client.connect();

try {
  const sel = await client.query(`SELECT id, email FROM users WHERE email = $1`, [email]);
  if (sel.rowCount === 0) {
    console.error(`No user with email: ${email}`);
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(passwordArg, 12);
  await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2`, [
    password_hash,
    email,
  ]);

  console.log(`Password updated for ${email} (id ${sel.rows[0].id}).`);
} finally {
  await client.end();
}
