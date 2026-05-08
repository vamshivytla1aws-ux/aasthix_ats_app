import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exDirs = new Set([".git", ".next", "node_modules"]);
const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const fileExt = new Set([".ts", ".tsx", ".js", ".jsx"]);
const failures = [];

function resolveAlias(spec) {
  const rel = spec.slice(2);
  const base = path.join(root, rel);
  const candidates = [
    base,
    ...exts.map((ext) => `${base}${ext}`),
    ...exts.map((ext) => path.join(base, `index${ext}`)),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

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
    const importPattern = /from\s+["'](@\/[^"']+)["']/g;
    let m;
    while ((m = importPattern.exec(src))) {
      const spec = m[1];
      if (!resolveAlias(spec)) {
        failures.push(`${file}: missing alias target ${spec}`);
      }
    }
  }
}

walk(root);

if (failures.length) {
  console.error("Missing alias import targets:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("OK: no missing alias imports.");

