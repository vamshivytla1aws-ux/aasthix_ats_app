import { query } from "./lib/db";
async function main() {
  const r = await query("SELECT id, full_name, email FROM candidates WHERE full_name ILIKE '%krishna%'");
  console.log(r.rows);
  process.exit(0);
}
main();
