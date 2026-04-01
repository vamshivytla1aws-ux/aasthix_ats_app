/**
 * Daily job: email CLIENT_RENEWAL_NOTIFY_EMAIL (default vamshi.vaitla360@gmail.com) when a client
 * agreement enters the renewal notice window. Requires migration 0051 + SMTP env.
 *
 *   npm run client-renewal-emails-once
 *   npm run client-renewal-emails   # schedules 08:00 daily (server local TZ)
 */
import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import { runClientRenewalEmails } from "../lib/runClientRenewalEmails";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const out = await runClientRenewalEmails();
  console.log("[client-renewal-emails]", out);
}

const once = process.argv.includes("--once");

if (once) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  cron.schedule("0 8 * * *", () => {
    void main();
  });
  console.log("[client-renewal-emails] scheduler: daily 08:00 (server local time). Use --once for a single run.");
}
