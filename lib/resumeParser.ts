import mammoth from "mammoth";
import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";

export type ParsedResumeFields = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  skills: string | null;
  resume_url: string | null;
  confidence: {
    full_name: number;
    email: number;
    phone: number;
    location: number;
    linkedin_url: number;
    skills: number;
    overall: number;
  };
};

const INDIA_LOCATION_CATALOG: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Ahmedabad, India", aliases: ["ahmedabad"] },
  { canonical: "Bengaluru, India", aliases: ["bengaluru", "bangalore", "banglore"] },
  { canonical: "Chandigarh, India", aliases: ["chandigarh"] },
  { canonical: "Chennai, India", aliases: ["chennai", "madras"] },
  { canonical: "Coimbatore, India", aliases: ["coimbatore"] },
  { canonical: "Delhi, India", aliases: ["delhi", "new delhi", "ncr"] },
  { canonical: "Gurugram, India", aliases: ["gurugram", "gurgaon"] },
  { canonical: "Hyderabad, India", aliases: ["hyderabad", "secunderabad"] },
  { canonical: "Indore, India", aliases: ["indore"] },
  { canonical: "Jaipur, India", aliases: ["jaipur"] },
  { canonical: "Kochi, India", aliases: ["kochi", "cochin"] },
  { canonical: "Kolkata, India", aliases: ["kolkata", "calcutta"] },
  { canonical: "Lucknow, India", aliases: ["lucknow"] },
  { canonical: "Mumbai, India", aliases: ["mumbai", "bombay", "navi mumbai"] },
  { canonical: "Mysuru, India", aliases: ["mysuru", "mysore"] },
  { canonical: "Noida, India", aliases: ["noida", "greater noida"] },
  { canonical: "Pune, India", aliases: ["pune", "poona"] },
  { canonical: "Thiruvananthapuram, India", aliases: ["thiruvananthapuram", "trivandrum"] },
  { canonical: "Visakhapatnam, India", aliases: ["visakhapatnam", "vizag"] },
];

function normalizeWhitespace(s: string) {
  return s.replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractEmail(text: string) {
  const m = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m?.[0] ?? null;
}

function extractPhone(text: string) {
  const strict = text.match(/\b\d{10}\b/);
  if (strict?.[0]) return strict[0];
  const loose = text.match(/\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{4}\b/);
  if (!loose?.[0]) return null;
  const digits = loose[0].replace(/[^\d]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function validateLinkedInUrl(url: string) {
  const cleaned = url.replace(/[),.;]+$/g, "");
  try {
    const u = new URL(cleaned);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "linkedin.com") return null;
    if (!/^\/(in|pub|company)\//i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function extractLinkedIn(text: string) {
  const m = text.match(/\b(?:(?:https?:\/\/)?(?:www\.)?)linkedin\.com\/(?:in|pub|company)\/[^\s),;]+/i);
  const raw = m?.[0] ?? null;
  if (!raw) return null;
  return validateLinkedInUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
}

/** Reject resume section titles and PDF artifacts misread as names (e.g. "Prof Essional Overview"). */
const NAME_SECTION_RE =
  /\b(overview|summary|objective|experience|skills|education|certifications?|employment|references|highlights?|snapshot|background|accreditation|essional|professional|curriculum|vitae|essio)\b/i;

const NAME_ROLE_TOKEN = /\b(senior|junior|lead|principal|staff|engineer|engineering|developer|devops|architect|manager|consultant|analyst|intern|fresher|tester|qa|sdet|scientist|specialist|owner|director|designer|recruiter|administrator|marketing|sales|product|support)\b/i;

const GEO_HINT_RE =
  /\b(india|usa|us|united\s+states|uk|united\s+kingdom|canada|australia|singapore|uae|germany|france|ireland|netherlands|sweden|poland|spain|italy|japan|bengaluru|bangalore|hyderabad|chennai|pune|mumbai|delhi|new\s+delhi|noida|gurgaon|gurugram|kolkata|ahmedabad|kochi|trivandrum|thiruvananthapuram|jaipur|chandigarh|coimbatore|mysore|visakhapatnam|vizag|san\s+francisco|new\s+york|austin|seattle|london|toronto|dubai)\b/i;

function containsGeoHint(s: string) {
  return GEO_HINT_RE.test(s);
}

function normalizeLocationSearchText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeIndiaLocation(input: string | null | undefined) {
  const value = cleanHeaderToken(input || "");
  if (!value) return null;
  const normalized = normalizeLocationSearchText(value);
  for (const entry of INDIA_LOCATION_CATALOG) {
    if (entry.aliases.some((alias) => normalizeLocationSearchText(alias) === normalized)) {
      return entry.canonical;
    }
  }
  return null;
}

export function findIndiaLocationFallback(text: string | null | undefined): string | null {
  const normalized = normalizeLocationSearchText(text || "");
  if (!normalized) return null;
  for (const entry of INDIA_LOCATION_CATALOG) {
    for (const alias of entry.aliases) {
      const token = normalizeLocationSearchText(alias);
      const re = new RegExp(`(^|\\s)${token.replace(/\s+/g, "\\s+")}(?=\\s|$)`, "i");
      if (re.test(normalized)) return entry.canonical;
    }
  }
  return null;
}

/**
 * True if the string looks like a person's name, not a section heading or job title line.
 */
export function looksLikePersonName(s: string | null | undefined): boolean {
  if (s == null || typeof s !== "string") return false;
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length < 4 || t.length > 80) return false;
  if (/[|•·,/()]/.test(t)) return false;
  if (/@|https?:\/\/|www\.|\d{2,}/.test(t)) return false;
  if (NAME_SECTION_RE.test(t)) return false;
  if (NAME_ROLE_TOKEN.test(t)) return false;
  if (containsGeoHint(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  let initials = 0;
  for (const w of words) {
    if (w.length > 24) return false;
    if (!/^[A-Za-z][A-Za-z'.-]*\.?$/.test(w)) return false;
    if (w.replace(/\./g, "").length === 1) initials += 1;
  }
  return initials <= 2;
}

function titleCaseName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, x: string) => `Mc${x.toUpperCase()}`);
}

/**
 * First segment of filename before role tokens: "Hari Mohan_Sr AI_Backend.pdf" → "Hari Mohan"
 */
export function extractNameFromFilename(filename: string): string | null {
  const base = path
    .basename(filename || "", path.extname(filename || ""))
    .replace(/\+/g, " ")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!base) return null;

  const stop = new Set([
    "sr",
    "jr",
    "ii",
    "iii",
    "iv",
    "ai",
    "ml",
    "nlp",
    "cv",
    "resume",
    "profile",
    "updated",
    "latest",
    "engg",
    "eng",
    "yrs",
    "year",
    "years",
  ]);

  const tokens = base.split(/\s+/).filter(Boolean);
  const taken: string[] = [];
  for (const token of tokens) {
    const low = token.toLowerCase();
    if (stop.has(low)) break;
    if (/^(backend|frontend|fullstack|full|stack|developer|engineer|devops|cloud|data|candidate)$/i.test(token)) break;
    if (!/^[A-Za-z][A-Za-z'.-]{0,22}$/.test(token)) break;
    taken.push(token);
    if (taken.length >= 4) break;
  }

  if (taken.length >= 2) {
    const candidate = taken.join(" ");
    if (looksLikePersonName(candidate)) return titleCaseName(candidate);
  }

  return null;
}

function extractFullName(text: string) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const invalid = new Set(["curriculum vitae", "resume", "profile", "bio data", "biodata", "cv"]);
  const invalidPatterns = [/\bcurriculum\s+vit(?:ae|tae|tte|ttae)\b/i, /\bresume\b/i, /\bprofile\b/i, /^\s*cv\s*$/i];

  function isNameLine(line: string) {
    const lower = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (!lower || invalid.has(lower) || invalidPatterns.some((x) => x.test(lower))) return false;
    if (/@|\d|https?:\/\/|www\./i.test(line)) return false;
    if (line.length < 3 || line.length > 60) return false;
    if (!/^[A-Za-z][A-Za-z .'-]+$/.test(line)) return false;
    if (line.split(/\s+/).filter(Boolean).length < 2) return false;
    return looksLikePersonName(line);
  }

  const email = extractEmail(normalized);
  const emailTokens = (email?.split("@")[0] || "")
    .replace(/[^a-z]/gi, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((x) => x.length >= 2);

  let best: { value: string; score: number } | null = null;
  const consider = (line: string, index: number, proximityBonus = 0) => {
    if (!isNameLine(line)) return;
    const cleaned = line.replace(/\s+/g, " ").trim();
    const tokens = cleaned.toLowerCase().split(/\s+/);
    let score = 0;
    if (index < 3) score += 5;
    else if (index < 6) score += 3;
    else if (index < 12) score += 1;
    if (/^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4}$/.test(cleaned)) score += 2;
    if (/^[A-Z.\s'-]+$/.test(cleaned)) score += 1;
    const overlap = tokens.filter((t) => emailTokens.some((e) => e.includes(t) || t.includes(e))).length;
    score += Math.min(3, overlap);
    score += proximityBonus;
    if (!best || score > best.score) best = { value: cleaned, score };
  };

  lines.slice(0, 20).forEach((line, index) => consider(line, index));

  if (email) {
    const idx = normalized.toLowerCase().indexOf(email.toLowerCase());
    const before = idx > 0 ? normalized.slice(0, idx) : "";
    const candidateLines = before
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-10)
      .reverse();
    candidateLines.forEach((line, index) => consider(line, index, 2));
  }

  if (!best) return null;
  return titleCaseName((best as { value: string; score: number }).value);
}

/** Tokens that appear after a comma in skill lists / JD fragments — not geographic regions. */
const NOT_A_REGION_TOKEN = new Set(
  [
    "node", "nodes", "js", "ts", "net", "core", "boot", "api", "go", "ui", "ux", "end", "web", "dev",
    "app", "sql", "git", "oss", "sdk", "ml", "ai", "rb", "py", "oss", "cd", "ci", "hq", "ii", "iii",
    "ranking", "retrieval", "learning", "included", "including", "into", "inclu", "incl", "stack",
    "cloud", "azure", "aws", "gcp", "kubernetes", "docker", "angular", "react", "vue", "java", "agile",
    "scrum", "years", "year", "experience", "experiences", "requirements", "requirement", "proven",
    "skills", "skill", "technical", "technologies", "framework", "frameworks", "development", "developer",
    "engineer", "engineering", "based", "remote", "hybrid", "onsite", "full", "time", "part",
  ].map((s) => s.toLowerCase())
);

const LOCATION_JUNK_PHRASE =
  /\b(years?\s+of|work\s+experience|job\s+description|requirements?|proven\s+|technical\s+skills?|retrieval|ranking|machine\s+learning|deep\s+learning|professional\s+summary|summary|objective)\b/i;

function cleanHeaderToken(s: string) {
  return s.replace(/^[|•·,;:\-\s]+|[|•·,;:\-\s]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

function splitHeaderSegments(line: string) {
  return line
    .split(/\s*[|•·]\s*|\s{2,}/)
    .map((x) => cleanHeaderToken(x))
    .filter(Boolean);
}

/**
 * Reject obvious non-locations (JD lines, tech pairs like "EF Core, Node", truncated words).
 * Exported for unit tests / future UI hints.
 */
export function looksLikeCandidateLocation(s: string | null | undefined): boolean {
  if (s == null || typeof s !== "string") return false;
  const raw = cleanHeaderToken(s);
  if (raw.length < 2 || raw.length > 100) return false;
  if (/@|https?:\/\/|www\./i.test(raw)) return false;
  if (/\d{4}\s*-\s*\d{4}/.test(raw)) return false;
  if (LOCATION_JUNK_PHRASE.test(raw)) return false;
  if (NAME_SECTION_RE.test(raw)) return false;
  if (NAME_ROLE_TOKEN.test(raw)) return false;

  const t = raw.replace(/^(?:Location|Address|Current\s+address|Current\s+location|Based\s+in|Residing\s+in)\s*:\s*/i, "").trim();
  if (!t) return false;
  if (/^(remote|hybrid|onsite)$/i.test(t)) return true;

  const directIndiaMatch = canonicalizeIndiaLocation(t);
  if (directIndiaMatch) return true;

  if (containsGeoHint(t)) {
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount > 8 && !/,/.test(t)) return false;
    if (/[.!?]/.test(t)) return false;
    return true;
  }

  const parts = t.split(",").map((x) => cleanHeaderToken(x)).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return false;

  for (const p of parts) {
    if (p.length > 60) return false;
    const lastWord = p.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (lastWord && NOT_A_REGION_TOKEN.has(lastWord)) return false;
    if (NOT_A_REGION_TOKEN.has(p.toLowerCase())) return false;
    if (NAME_ROLE_TOKEN.test(p)) return false;
  }

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Z]{2}$/.test(last)) return true;
    if (parts.every((p) => /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(p))) return true;
  }

  return false;
}

function extractLocationFromHeaderLines(lines: string[]): string | null {
  const headerSlice = lines.slice(0, 18);

  for (const line of headerSlice) {
    if (!line) continue;
    const normalizedLine = line.replace(/\s+/g, " ").trim();

    const labeled = normalizedLine.match(
      /^\s*(?:Location|Address|Current\s+address|Current\s+location|Based\s+in|Residing\s+in)\s*:\s*(.+)$/i
    );
    if (labeled?.[1]) {
      const labeledSegments = splitHeaderSegments(labeled[1]);
      for (const seg of labeledSegments) {
        if (looksLikeCandidateLocation(seg)) return seg;
      }
      const v = cleanHeaderToken(labeled[1]);
      if (looksLikeCandidateLocation(v)) return v;
    }

    const segments = splitHeaderSegments(normalizedLine);
    for (const seg of segments) {
      if (extractEmail(seg) || extractPhone(seg) || extractLinkedIn(seg)) continue;
      if (looksLikeCandidateLocation(seg)) return seg;
    }

    const inlineMatches = normalizedLine.match(/[A-Za-z][A-Za-z .'-]{1,40},\s*(?:[A-Z]{2}|[A-Za-z][A-Za-z .'-]{1,40})/g) ?? [];
    for (const match of inlineMatches) {
      const candidate = cleanHeaderToken(match);
      if (looksLikeCandidateLocation(candidate)) return candidate;
    }
  }

  return null;
}

function extractLocation(text: string) {
  const t = normalizeWhitespace(text);
  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const head = extractLocationFromHeaderLines(lines);
  if (head) return head;

  let resumeTop = t;
  const expMatch = t.search(/\n\s*(?:Professional\s+)?(?:Work\s+)?Experience\b/i);
  const eduMatch = t.search(/\n\s*Education\b/i);
  for (const idx of [expMatch, eduMatch]) {
    if (idx > 500 && idx < resumeTop.length) {
      resumeTop = t.slice(0, idx);
      break;
    }
  }
  const earlyLines = resumeTop
    .slice(0, 4000)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const early = extractLocationFromHeaderLines(earlyLines);
  if (early) return canonicalizeParsedLocation(early);

  return findIndiaLocationFallback(resumeTop.slice(0, 3500));
}

function extractSkillsRuleBased(text: string) {
  const t = normalizeWhitespace(text).toLowerCase();
  const sectionMatch = t.match(
    /\b(skills|technical skills|tech stack)\b[\s:]*([\s\S]{0,1200}?)(\n\n|experience\b|projects\b|education\b|certifications\b|work experience\b)/i
  );
  const section = sectionMatch?.[2] ? sectionMatch[2] : t.slice(0, 2500);
  const keywords = [
    "Java",
    "Python",
    "JavaScript",
    "TypeScript",
    "React.js",
    "Angular",
    "Vue.js",
    "Next.js",
    "Node.js",
    "Express.js",
    "Spring Boot",
    "Django",
    "Flask",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "AWS",
    "Azure",
    "GCP",
    "Docker",
    "Kubernetes",
    "CI/CD",
    "Jenkins",
    "Git",
    "REST API",
    "GraphQL",
    "Selenium",
    "Cypress",
    "Agile",
    "Scrum",
  ];
  const found = new Set<string>();
  for (const keyword of keywords) {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (re.test(section)) found.add(keyword);
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

async function extractTextFromFile(filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    // Primary parser
    let text = "";
    try {
      const mod: any = await import("pdf-parse");
      const pdfParse: any = mod?.default ?? mod;
      const result = await pdfParse(buffer);
      text = String(result?.text || "");
    } catch {
      // fallback below
    }

    // OCR fallback for scanned/image PDFs using OpenAI document understanding.
    // Only attempted when we still have very little extractable text.
    if (text.trim().length < 30) {
      try {
        const key = process.env.OPENAI_API_KEY;
        // Avoid huge payloads in OCR fallback request.
        if (key && buffer.length <= 8 * 1024 * 1024) {
          const fileData = `data:application/pdf;base64,${buffer.toString("base64")}`;
          const res = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              input: [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text:
                        "Extract all readable text from this resume PDF. Return plain text only. Keep section headings if visible.",
                    },
                    {
                      type: "input_file",
                      filename: "resume.pdf",
                      file_data: fileData,
                    },
                  ],
                },
              ],
              max_output_tokens: 4000,
            }),
          });
          if (res.ok) {
            const json = await res.json();
            const ocrText =
              typeof json?.output_text === "string"
                ? json.output_text
                : Array.isArray(json?.output)
                  ? json.output
                      .flatMap((o: any) => (Array.isArray(o?.content) ? o.content : []))
                      .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
                      .join("\n")
                  : "";
            if (ocrText.trim().length > text.trim().length) {
              text = ocrText;
            }
          }
        }
      } catch {
        // keep best-effort text when OCR fallback fails
      }
    }
    return text;
  }
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
  throw new Error("Unsupported file type. Upload a PDF or DOCX.");
}

/** Plain text from PDF/DOCX buffer (for matching pipelines). Same extraction as parseResumeBuffer without persisting a file. */
export async function extractPlainTextFromResumeBuffer(filename: string, buffer: Buffer): Promise<string> {
  return normalizeWhitespace(await extractTextFromFile(filename, buffer));
}

async function extractWithOpenAI(text: string): Promise<Partial<ParsedResumeFields> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const prompt = `Extract candidate details from this resume text and return strict JSON:
{
  "full_name": string|null,
  "email": string|null,
  "phone": string|null,
  "location": string|null,
  "linkedin_url": string|null,
  "skills": string[]
}
Rules:
- Return null when unknown.
- skills should be concise and deduplicated.
- Do not invent values.
- full_name: ONLY the person's real name as shown at the top of the resume (2–5 words). Never use section titles like "Professional Summary", "Profile", or mangled PDF text.
- location: ONLY the candidate's city/region/country (e.g. "Chennai, India" or "Austin, TX"). Use null if not clearly stated in header/contact area. Never use job-description fragments, skill pairs, or lines about "years of experience".
Resume:
${text.slice(0, 16000)}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are an ATS parser. Output only valid JSON object." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      full_name?: unknown;
      email?: unknown;
      phone?: unknown;
      location?: unknown;
      linkedin_url?: unknown;
      skills?: unknown;
    };
    const aiSkills = Array.isArray(parsed.skills)
      ? (parsed.skills as unknown[])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .slice(0, 30)
      : [];
    const rawLoc = typeof parsed.location === "string" ? parsed.location.trim() : "";
    const location =
      rawLoc && looksLikeCandidateLocation(rawLoc) ? rawLoc : null;

    const rawName = typeof parsed.full_name === "string" ? parsed.full_name.trim() : "";
    const full_name = rawName && looksLikePersonName(rawName) ? rawName : null;

    return {
      full_name,
      email: typeof parsed.email === "string" ? parsed.email.trim() || null : null,
      phone: typeof parsed.phone === "string" ? parsed.phone.trim() || null : null,
      location,
      linkedin_url: typeof parsed.linkedin_url === "string" ? parsed.linkedin_url.trim() || null : null,
      skills: aiSkills.length > 0 ? aiSkills.join(", ") : null,
    };
  } catch {
    return null;
  }
}

async function saveResumeFile(originalName: string, buffer: Buffer) {
  const ext = (path.extname(originalName || "").toLowerCase() || "").slice(0, 10);
  const safeExt = ext === ".pdf" || ext === ".docx" ? ext : "";
  const fileName = `${crypto.randomUUID()}${safeExt || ""}`;
  const dir = path.join(process.cwd(), "public", "uploads", "resumes");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);
  return `/uploads/resumes/${fileName}`;
}

function dedupeSkillString(skills: Array<string | null | undefined>) {
  const set = new Map<string, string>();
  for (const source of skills) {
    if (!source) continue;
    for (const token of source.split(",").map((x) => x.trim()).filter(Boolean)) {
      const key = token.toLowerCase();
      if (!set.has(key)) set.set(key, token);
    }
  }
  return Array.from(set.values()).slice(0, 40).join(", ") || null;
}

function norm(v: string | null | undefined) {
  return (v || "").trim().toLowerCase();
}

function canonicalizeParsedLocation(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = cleanHeaderToken(value);
  if (!trimmed || !looksLikeCandidateLocation(trimmed)) return null;
  const indiaCanonical = canonicalizeIndiaLocation(trimmed);
  if (indiaCanonical) return indiaCanonical;
  return trimmed;
}

/**
 * Filename prefix (e.g. "Hari Mohan_Sr AI_...pdf") is often the most reliable signal when PDF text order is wrong.
 * Order: file hint > AI > rule (each must pass looksLikePersonName).
 */
function pickFinalFullName(
  ai: string | null | undefined,
  rule: string | null | undefined,
  fileHint: string | null | undefined
): string | null {
  const a = ai?.trim() && looksLikePersonName(ai.trim()) ? ai.trim() : null;
  const r = rule?.trim() && looksLikePersonName(rule.trim()) ? rule.trim() : null;
  const f = fileHint?.trim() && looksLikePersonName(fileHint.trim()) ? fileHint.trim() : null;

  if (a && r && norm(a) === norm(r)) return titleCaseName(a);
  if (a) return titleCaseName(a);
  if (r) return titleCaseName(r);
  if (f) return titleCaseName(f);
  return null;
}

/** Prefer validated AI when both exist; if only one is valid, use it; break ties toward comma-style (city, country). */
function pickFinalLocation(ai: string | null | undefined, rule: string | null | undefined): string | null {
  const a = canonicalizeParsedLocation(ai);
  const r = canonicalizeParsedLocation(rule);
  if (!a && !r) return null;
  if (a && !r) return a;
  if (!a && r) return r;
  if (a && r) {
    if (norm(a) === norm(r)) return a;
    if (a.includes(",") && !r.includes(",")) return a;
    if (r.includes(",") && !a.includes(",")) return r;
    return a;
  }
  return null;
}

function valueConfidence(aiValue: string | null | undefined, ruleValue: string | null | undefined) {
  const a = norm(aiValue);
  const r = norm(ruleValue);
  if (a && r && a === r) return 0.95;
  if (a && r && a !== r) return 0.6;
  if (a && !r) return 0.85;
  if (!a && r) return 0.72;
  return 0;
}

export async function parseResumeBuffer(filename: string, buffer: Buffer): Promise<ParsedResumeFields> {
  const text = normalizeWhitespace(await extractTextFromFile(filename, buffer));
  if (text.length < 30) {
    throw new Error(
      "Could not extract readable text from this file. Please upload a text-based PDF/DOCX (not scanned image PDF)."
    );
  }
  const resume_url = await saveResumeFile(filename, buffer);
  const nameFromFile = extractNameFromFilename(filename);

  const rule = {
    full_name: extractFullName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    linkedin_url: extractLinkedIn(text),
    skills: (() => {
      const list = extractSkillsRuleBased(text);
      return list.length > 0 ? list.join(", ") : null;
    })(),
  };
  const ai = await extractWithOpenAI(text);

  const finalLinkedIn =
    validateLinkedInUrl(ai?.linkedin_url || "") ||
    validateLinkedInUrl(rule.linkedin_url || "") ||
    null;
  const finalSkills = dedupeSkillString([ai?.skills, rule.skills]);
  const finalLocation = pickFinalLocation(ai?.location ?? null, rule.location);
  const finalFullName = pickFinalFullName(ai?.full_name ?? null, rule.full_name, nameFromFile);

  const confidence = {
    full_name: valueConfidence(ai?.full_name || null, rule.full_name || null),
    email: valueConfidence(ai?.email || null, rule.email || null),
    phone: valueConfidence(ai?.phone || null, rule.phone || null),
    location: valueConfidence(ai?.location || null, rule.location || null),
    linkedin_url: valueConfidence(ai?.linkedin_url || null, rule.linkedin_url || null),
    skills: valueConfidence(ai?.skills || null, rule.skills || null),
    overall: 0,
  };
  confidence.overall = Number(
    (
      (confidence.full_name +
        confidence.email +
        confidence.phone +
        confidence.location +
        confidence.linkedin_url +
        confidence.skills) /
      6
    ).toFixed(2)
  );

  return {
    full_name: finalFullName,
    email: ai?.email || rule.email || null,
    phone: ai?.phone || rule.phone || null,
    location: finalLocation,
    linkedin_url: finalLinkedIn,
    skills: finalSkills,
    resume_url,
    confidence,
  };
}
