export type PythonMatchRow = {
  id: string;
  match_score: number;
  hire_probability: number;
  decision: string;
  matched_required_skills?: string[];
  missing_required_skills?: string[];
  exact_required_coverage?: number;
  title_match?: number;
  domain_match?: boolean;
  qualification_gate_failed?: boolean;
};

export type PythonMatchResponse = {
  top_10: PythonMatchRow[];
  all_results: PythonMatchRow[];
  meta?: { processed_count?: number; latency_ms?: number };
};

const DEFAULT_URL = "http://localhost:8000/match";
const TIMEOUT_MS = 10_000;

/** Normalize Python /match rows (scores + rule signals for hybrid rerank). */
export function validatePythonResults(rows: PythonMatchRow[]): Map<string, PythonMatchRow> {
  const map = new Map<string, PythonMatchRow>();
  for (const r of rows) {
    if (r?.id == null) continue;
    const id = String(r.id);
    const matched = Array.isArray(r.matched_required_skills)
      ? r.matched_required_skills.map((x) => String(x))
      : [];
    const missing = Array.isArray(r.missing_required_skills)
      ? r.missing_required_skills.map((x) => String(x))
      : [];
    map.set(id, {
      id,
      match_score: Math.max(0, Math.min(100, Number(r.match_score) || 0)),
      hire_probability: Math.max(0, Math.min(100, Number(r.hire_probability) || 0)),
      decision: String(r.decision || "Hold"),
      matched_required_skills: matched,
      missing_required_skills: missing,
      exact_required_coverage:
        r.exact_required_coverage === undefined ? undefined : Number(r.exact_required_coverage),
      title_match: r.title_match === undefined ? undefined : Number(r.title_match),
      domain_match: r.domain_match === undefined ? undefined : Boolean(r.domain_match),
      qualification_gate_failed:
        r.qualification_gate_failed === undefined ? undefined : Boolean(r.qualification_gate_failed),
    });
  }
  return map;
}

export async function callPythonNoAiMatcher(
  payload: {
    jd: string;
    candidates: { id: string; resume: string }[];
  },
  opts?: { timeoutMs?: number }
): Promise<{ ok: true; data: PythonMatchResponse } | { ok: false; status: number; body: string }> {
  const url = process.env.MATCHER_PYTHON_URL || DEFAULT_URL;
  const ac = new AbortController();
  const timeoutMs =
    opts?.timeoutMs != null && Number.isFinite(opts.timeoutMs)
      ? Math.min(120_000, Math.max(5_000, opts.timeoutMs))
      : TIMEOUT_MS;
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: text.slice(0, 2000) };
    }
    let data: unknown;
    try {
      data = JSON.parse(text) as PythonMatchResponse;
    } catch {
      return { ok: false, status: 502, body: "Invalid JSON from matcher" };
    }
    const d = data as PythonMatchResponse;
    if (!Array.isArray(d.all_results) || !Array.isArray(d.top_10)) {
      return { ok: false, status: 502, body: "Matcher response missing top_10 or all_results" };
    }
    const latency = Date.now() - started;
    if (d.meta && typeof d.meta === "object") {
      (d.meta as { latency_ms?: number }).latency_ms = latency;
    } else {
      d.meta = { latency_ms: latency, processed_count: payload.candidates.length };
    }
    return { ok: true, data: d };
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as Error).name) : "";
    if (name === "AbortError" || (e instanceof Error && e.message.includes("aborted"))) {
      return { ok: false, status: 504, body: "Matcher request timed out" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    const cause =
      e && typeof e === "object" && "cause" in e
        ? (e as { cause?: { code?: string; errors?: Array<{ code?: string }> } }).cause
        : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: string }).code)
        : cause?.errors?.[0]?.code;
    const isConnRefused =
      code === "ECONNREFUSED" ||
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      (typeof cause === "object" &&
        cause !== null &&
        "errors" in cause &&
        Array.isArray((cause as AggregateError).errors) &&
        (cause as AggregateError).errors.some((x) => String((x as Error & { code?: string })?.code) === "ECONNREFUSED"));
    if (isConnRefused) {
      return {
        ok: false,
        status: 503,
        body: `No-AI matcher is not reachable at ${url}. Start it (no pip needed): cd matcher-service && python -m matcher_service.simple_server — or: pip install -r requirements.txt && python -m uvicorn matcher_service.main:app --host 127.0.0.1 --port 8000. Use Python 3.10–3.12 if pip/pydantic-core fails. Set MATCHER_PYTHON_URL in .env.local if needed.`,
      };
    }
    return { ok: false, status: 502, body: msg || "Matcher request failed" };
  } finally {
    clearTimeout(timer);
  }
}
