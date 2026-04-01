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

function extractFullName(text: string) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const invalid = new Set(["curriculum vitae", "resume", "profile", "bio data", "biodata", "cv"]);
  const invalidPatterns = [/\bcurriculum\s+vit(?:ae|tae|tte|ttae)\b/i, /\bresume\b/i, /\bprofile\b/i, /^\s*cv\s*$/i];

  function titleCase(input: string) {
    return input
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function isNameLine(line: string) {
    const lower = line.toLowerCase().replace(/\s+/g, " ").trim();
    if (!lower || invalid.has(lower) || invalidPatterns.some((x) => x.test(lower))) return false;
    if (/@|\d|https?:\/\/|www\./i.test(line)) return false;
    if (line.length < 3 || line.length > 60) return false;
    if (!/^[A-Za-z][A-Za-z .'-]+$/.test(line)) return false;
    return line.split(/\s+/).filter(Boolean).length >= 2;
  }

  for (const line of lines.slice(0, 6)) if (isNameLine(line)) return titleCase(line);

  const email = extractEmail(normalized);
  if (email) {
    const idx = normalized.toLowerCase().indexOf(email.toLowerCase());
    const before = idx > 0 ? normalized.slice(0, idx) : "";
    const candidateLines = before
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-8)
      .reverse();
    for (const line of candidateLines) if (isNameLine(line)) return titleCase(line);
  }

  return null;
}

function extractLocation(text: string) {
  const t = normalizeWhitespace(text);
  const labeled = t.match(/\bLocation\s*:\s*([^\n]+)\b/i);
  if (labeled?.[1]) return labeled[1].trim();

  const topLines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of topLines) {
    if (/@|https?:\/\//i.test(line)) continue;
    const commaStyle = line.match(/\b([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2}|[A-Za-z]{2,})\b/);
    if (commaStyle) return `${commaStyle[1].trim()}, ${commaStyle[2].trim()}`;
  }
  return null;
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
    return {
      full_name: typeof parsed.full_name === "string" ? parsed.full_name.trim() || null : null,
      email: typeof parsed.email === "string" ? parsed.email.trim() || null : null,
      phone: typeof parsed.phone === "string" ? parsed.phone.trim() || null : null,
      location: typeof parsed.location === "string" ? parsed.location.trim() || null : null,
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
    full_name: ai?.full_name || rule.full_name || null,
    email: ai?.email || rule.email || null,
    phone: ai?.phone || rule.phone || null,
    location: ai?.location || rule.location || null,
    linkedin_url: finalLinkedIn,
    skills: finalSkills,
    resume_url,
    confidence,
  };
}
