import pg from "pg";
import bcrypt from "bcryptjs";

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const fullName = process.env.SEED_ADMIN_NAME?.trim() || "Admin User";

if (!email || !password) {
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const passwordHash = await bcrypt.hash(password, 12);

await client.connect();
await client.query(
  `
  INSERT INTO users (full_name, email, role, password_hash)
  VALUES ($1, $2, 'admin', $3)
  ON CONFLICT (email)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = 'admin',
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW()
  `,
  [fullName, email, passwordHash]
);
await client.end();

process.stdout.write(`[seed-admin] ensured admin user ${email}\n`);
