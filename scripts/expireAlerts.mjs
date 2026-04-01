import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import { Pool } from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { DATABASE_URL, DB_SSL } = process.env;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function expireAlerts() {
  try {
    const result = await pool.query(`
      UPDATE alerts
      SET status = 'expired'
      WHERE status = 'unread'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      RETURNING id
    `);
    console.log(`[alerts-expiry] expired ${result.rowCount || 0} alert(s)`);
  } catch (error) {
    console.error("[alerts-expiry] failed:", error);
  }
}

if (process.argv.includes("--once")) {
  expireAlerts().then(() => process.exit(0));
}

cron.schedule("*/5 * * * *", () => {
  expireAlerts();
});

