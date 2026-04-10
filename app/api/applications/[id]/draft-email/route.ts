import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { draftApplicationEmailWithAi, type EmailDraftIntent } from "@/lib/applicationEmail/draftWithAi";
import { buildApplicationEmailContextBlock } from "@/lib/applicationEmail/buildContextBlock";
import { checkApplicationEmailDraftRateLimit } from "@/lib/applicationEmail/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_MAX = Number(process.env.EMAIL_DRAFT_RATE_MAX ?? 30) || 30;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const INTENTS: EmailDraftIntent[] = ["offer_letter", "next_steps", "rejection", "general"];

function asIntent(v: unknown): EmailDraftIntent {
  const s = String(v || "general");
  return INTENTS.includes(s as EmailDraftIntent) ? (s as EmailDraftIntent) : "general";
}

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const rl = checkApplicationEmailDraftRateLimit(user.user_id, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many draft requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const rawId = context.params.id;
    const applicationId = Number(rawId);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      intent?: unknown;
      customPrompt?: unknown;
    };
    const intent = asIntent(body.intent);
    const customPrompt =
      typeof body.customPrompt === "string" ? body.customPrompt.slice(0, 4000) : undefined;

    const row = await fetchApplicationCardRow(applicationId, user.user_id);
    if (!row) {
      return NextResponse.json({ error: "Application not found or not accessible." }, { status: 404 });
    }

    const jobId = Number(row.job_id);
    let jdExcerpt = "";
    if (Number.isFinite(jobId) && jobId > 0) {
      const dRes = await query(`SELECT COALESCE(description, '') AS d FROM jobs WHERE id = $1 LIMIT 1`, [jobId]);
      jdExcerpt = String((dRes.rows[0] as { d?: string } | undefined)?.d ?? "").slice(0, 8000);
    }

    const contextBlock = buildApplicationEmailContextBlock(row, jdExcerpt || null);
    const result = await draftApplicationEmailWithAi({ intent, customPrompt, contextBlock });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    const defaultTo =
      typeof row.candidate_email === "string" && row.candidate_email.trim()
        ? row.candidate_email.trim()
        : null;

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      defaultTo,
      candidateName: row.candidate_full_name ?? null,
      jobTitle: row.job_title ?? null,
      company: row.job_company ?? null,
    });
  } catch (e) {
    console.error("POST /api/applications/[id]/draft-email", e);
    return NextResponse.json({ error: "Failed to draft email." }, { status: 500 });
  }
}
