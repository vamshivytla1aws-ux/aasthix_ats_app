import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exDirs = new Set([".git", ".next", "node_modules"]);
const fileExt = new Set([".ts", ".tsx", ".js", ".jsx"]);
const failures = [];

const SIDE_EFFECT_API_PATHS = [
  "/api/auth/logout",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/accept-invite",
  "/api/cron/",
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (exDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!fileExt.has(path.extname(entry.name))) continue;
    const file = path.join(dir, entry.name);
    const src = fs.readFileSync(file, "utf8");
    const linkTagPattern = /<Link[\s\S]*?>/g;
    const matches = src.match(linkTagPattern) || [];
    for (const tag of matches) {
      for (const p of SIDE_EFFECT_API_PATHS) {
        if (tag.includes(`href="${p}`) || tag.includes(`href='${p}`)) {
          failures.push(`${file}: side-effect Link uses ${p}`);
        }
      }
    }
  }
}

walk(root);

if (failures.length) {
  console.error("Found disallowed side-effect <Link> usage:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("OK: no side-effect API routes used inside <Link>.");

