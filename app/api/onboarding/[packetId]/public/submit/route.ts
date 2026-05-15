import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { appendCandidateActivity, ONBOARDING_DOC_FIELDS, saveOnboardingFiles } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { packetId: string } }) {
  const packetId = Number(params.packetId);
  const token = String(new URL(request.url).searchParams.get("token") || "").trim();
  if (!Number.isFinite(packetId) || packetId <= 0) {
    return NextResponse.json({ error: "Invalid packet id" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  const packetRes = await query(
    `
    SELECT p.id, p.candidate_id, p.status
    FROM application_onboarding_packets p
    WHERE p.id = $1 AND p.access_token = $2
    LIMIT 1
    `,
    [packetId, token]
  );
  if (packetRes.rowCount === 0) return NextResponse.json({ error: "Onboarding link is invalid." }, { status: 404 });
  const packet = packetRes.rows[0] as any;
  if (packet.status === "submitted") {
    return NextResponse.json({ error: "This onboarding form is already submitted." }, { status: 409 });
  }
  if (packet.status === "revoked" || packet.status === "expired") {
    return NextResponse.json({ error: "This onboarding link is no longer active." }, { status: 410 });
  }

  const formData = await request.formData();
  const payloadRaw = String(formData.get("payload") || "").trim();
  if (!payloadRaw) return NextResponse.json({ error: "Payload is required." }, { status: 400 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return NextResponse.json({ error: "Invalid payload JSON." }, { status: 400 });
  }

  const filesByDoc: Array<{ docType: string; file: File }> = [];
  for (const doc of ONBOARDING_DOC_FIELDS) {
    const f = formData.get(`doc_${doc.key}`);
    if (!(f instanceof File) || !f.name) {
      return NextResponse.json({ error: `Missing required document: ${doc.label}` }, { status: 400 });
    }
    filesByDoc.push({ docType: doc.key, file: f });
  }

  await query(
    `
    INSERT INTO application_onboarding_payloads (packet_id, payload_version, payload, created_at)
    VALUES ($1, 1, $2::jsonb, NOW())
    `,
    [packetId, JSON.stringify(payload)]
  );
  await saveOnboardingFiles({ packetId, filesByDoc });

  await query(
    `
    UPDATE application_onboarding_packets
    SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
    WHERE id = $1
    `,
    [packetId]
  );

  await appendCandidateActivity(Number(packet.candidate_id), "onboarding_submitted", "Candidate submitted onboarding form");
  return NextResponse.json({ ok: true, status: "submitted" });
}
