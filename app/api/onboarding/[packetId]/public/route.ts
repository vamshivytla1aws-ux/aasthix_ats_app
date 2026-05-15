import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ONBOARDING_DOC_FIELDS, appendCandidateActivity } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { packetId: string } }) {
  const packetId = Number(params.packetId);
  const token = String(new URL(request.url).searchParams.get("token") || "").trim();
  if (!Number.isFinite(packetId) || packetId <= 0) {
    return NextResponse.json({ error: "Invalid packet id" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  const res = await query(
    `
    SELECT p.id, p.application_id, p.candidate_id, p.status, p.note, p.deadline_at, p.submitted_at,
           c.full_name AS candidate_name, j.title AS job_title
    FROM application_onboarding_packets p
    JOIN candidates c ON c.id = p.candidate_id
    JOIN applications a ON a.id = p.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE p.id = $1 AND p.access_token = $2
    LIMIT 1
    `,
    [packetId, token]
  );
  if (res.rowCount === 0) return NextResponse.json({ error: "Onboarding link is invalid." }, { status: 404 });
  const packet = res.rows[0] as any;
  if (packet.status === "revoked" || packet.status === "expired") {
    return NextResponse.json({ error: "This onboarding link is no longer active." }, { status: 410 });
  }

  const payloadRes = await query(
    `
    SELECT payload
    FROM application_onboarding_payloads
    WHERE packet_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [packetId]
  );
  const payload = payloadRes.rows?.[0]?.payload ?? null;

  if (packet.status === "sent") {
    await query(`UPDATE application_onboarding_packets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [packetId]);
    await appendCandidateActivity(packet.candidate_id, "onboarding_started", "Candidate opened onboarding form");
    packet.status = "in_progress";
  }

  return NextResponse.json({
    packet,
    payload,
    required_documents: ONBOARDING_DOC_FIELDS,
  });
}
