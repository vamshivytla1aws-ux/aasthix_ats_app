import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { appendCandidateActivity, createOnboardingToken } from "@/lib/onboarding";
import { sendEmailMessage } from "@/lib/sendEmail";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("pipeline.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const applicationId = Number(params.id);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({} as any));
  const recipient = String(body?.to || "").trim();
  const note = String(body?.note || "").trim();
  const deadlineAt = typeof body?.deadline_at === "string" && body.deadline_at.trim() ? body.deadline_at : null;
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: "Valid recipient email is required." }, { status: 400 });
  }

  const appRes = await query(
    `
    SELECT a.id, a.stage, a.candidate_id, c.full_name AS candidate_full_name, c.email AS candidate_email, j.title AS job_title
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [applicationId]
  );
  if (appRes.rowCount === 0) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const app = appRes.rows[0] as any;
  if (String(app.stage) !== "Selected") {
    return NextResponse.json({ error: "Onboarding link can be sent only for Selected applications." }, { status: 400 });
  }

  await query(
    `UPDATE application_onboarding_packets
     SET status = 'revoked', updated_at = NOW()
     WHERE application_id = $1 AND status IN ('sent', 'in_progress')`,
    [applicationId]
  );

  const token = createOnboardingToken();
  const insertRes = await query(
    `
    INSERT INTO application_onboarding_packets
    (application_id, candidate_id, sent_by_user_id, access_token, status, note, deadline_at, metadata, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'sent', $5, $6::timestamptz, $7::jsonb, NOW(), NOW())
    RETURNING *
    `,
    [
      applicationId,
      Number(app.candidate_id),
      auth.access.user_id,
      token,
      note || null,
      deadlineAt,
      JSON.stringify({ recipient }),
    ]
  );
  const packet = insertRes.rows[0] as any;

  const origin = new URL(request.url).origin;
  const url = `${origin}/onboarding/${packet.id}?token=${encodeURIComponent(token)}`;
  const msg = buildCandidateEmailTemplate({
    candidateName: app.candidate_full_name || "Candidate",
    paragraphs: [
      "Please complete your onboarding form using the secure link below.",
      deadlineAt ? `Submission deadline: ${new Date(deadlineAt).toLocaleString("en-IN")}` : "",
    ].filter(Boolean),
    job: { title: app.job_title || "Selected Role" },
    cta: { label: "Open onboarding form", url },
  });

  const sendResult = await sendEmailMessage({
    to: [recipient],
    subject: `Onboarding Form - ${app.job_title || "Selected Role"}`,
    html: msg.html,
    text: `${msg.text}\n\nOnboarding link: ${url}`,
  });

  if (!sendResult.sent) {
    await query("UPDATE application_onboarding_packets SET status = 'not_sent', updated_at = NOW() WHERE id = $1", [packet.id]);
    return NextResponse.json({ error: sendResult.detail || "Failed to send onboarding email." }, { status: 500 });
  }

  await appendCandidateActivity(Number(app.candidate_id), "onboarding_link_sent", "Onboarding link sent to candidate");

  return NextResponse.json({
    ok: true,
    onboarding: { ...packet, public_url: url },
    operation_status: "success",
  });
}
