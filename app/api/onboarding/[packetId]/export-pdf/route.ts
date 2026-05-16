import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { appendCandidateActivity } from "@/lib/onboarding";
import { buildOnboardingPdf } from "@/lib/pdf/onboardingExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { packetId: string } }) {
  const auth = await requirePermission("candidates.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const packetId = Number(params.packetId);
  if (!Number.isFinite(packetId) || packetId <= 0) {
    return NextResponse.json({ error: "Invalid packet id" }, { status: 400 });
  }

  const packetRes = await query(
    `
    SELECT p.id, p.candidate_id, p.application_id, p.status, p.submitted_at, p.exported_at,
           c.full_name AS candidate_name, j.title AS job_title
    FROM application_onboarding_packets p
    JOIN candidates c ON c.id = p.candidate_id
    JOIN applications a ON a.id = p.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE p.id = $1
    LIMIT 1
    `,
    [packetId]
  );
  if (packetRes.rowCount === 0) return NextResponse.json({ error: "Packet not found." }, { status: 404 });
  const packet = packetRes.rows[0] as any;

  const payloadRes = await query(
    `SELECT payload FROM application_onboarding_payloads WHERE packet_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [packetId]
  );
  const payload = (payloadRes.rows?.[0]?.payload ?? {}) as Record<string, unknown>;

  const docsRes = await query(
    `SELECT doc_type, file_name, file_url, mime, uploaded_at, file_blob FROM application_onboarding_documents WHERE packet_id = $1 ORDER BY uploaded_at ASC`,
    [packetId]
  );
  const docs = docsRes.rows as Array<any>;
  const pdf = await buildOnboardingPdf({
    packet: {
      packetId,
      candidateName: String(packet.candidate_name || ""),
      jobTitle: String(packet.job_title || ""),
      status: String(packet.status || ""),
      submittedAt: packet.submitted_at ? String(packet.submitted_at) : null,
    },
    payload,
    docs: docs.map((d) => ({
      doc_type: String(d.doc_type || ""),
      file_name: String(d.file_name || ""),
      file_url: String(d.file_url || ""),
      uploaded_at: String(d.uploaded_at || ""),
      mime: d.mime ? String(d.mime) : null,
      file_blob: Buffer.isBuffer(d.file_blob) ? d.file_blob.toString("base64") : null,
    })),
  });
  await query(
    `UPDATE application_onboarding_packets SET status = 'exported', exported_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [packetId]
  );
  await appendCandidateActivity(Number(packet.candidate_id), "onboarding_exported", "Recruiter exported onboarding summary PDF");

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="onboarding-${packetId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
