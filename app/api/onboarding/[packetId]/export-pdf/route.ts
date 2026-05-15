import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { appendCandidateActivity } from "@/lib/onboarding";
import { makeSimplePdf } from "@/lib/pdf/simplePdf";

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
    `SELECT doc_type, file_name, file_url, uploaded_at FROM application_onboarding_documents WHERE packet_id = $1 ORDER BY uploaded_at ASC`,
    [packetId]
  );
  const docs = docsRes.rows as Array<any>;

  const lines: string[] = [];
  lines.push("AASTHIX TALENT");
  lines.push("Employee Onboarding Summary");
  lines.push("----------------------------------------");
  lines.push(`Candidate: ${String(packet.candidate_name || "")}`);
  lines.push(`Job Title: ${String(packet.job_title || "")}`);
  lines.push(`Status: ${String(packet.status || "")}`);
  lines.push(`Submitted At: ${packet.submitted_at ? new Date(packet.submitted_at).toLocaleString("en-IN") : "-"}`);
  lines.push("");
  lines.push("Form Data");
  lines.push("----------------------------------------");
  const flat = Object.entries(payload);
  for (const [k, v] of flat) {
    const val = typeof v === "string" ? v : JSON.stringify(v);
    lines.push(`${k}: ${String(val || "").slice(0, 140)}`);
  }
  lines.push("");
  lines.push("Document Manifest");
  lines.push("----------------------------------------");
  if (docs.length === 0) {
    lines.push("No uploaded documents.");
  } else {
    for (const d of docs) {
      lines.push(`${d.doc_type}: ${d.file_name} (${d.file_url})`);
    }
  }

  const pdf = makeSimplePdf(lines);
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
