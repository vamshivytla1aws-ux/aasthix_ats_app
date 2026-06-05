import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { parseResumeBuffer } from "@/lib/resumeParser";
import { buildResumeBlobRecord } from "@/lib/resumeStorage";
import { refreshResumeEmbeddingForCandidate } from "@/lib/candidates/refreshResumeEmbedding";
import { persistCandidateDerivedProfile } from "@/lib/candidateDerivedProfileDb";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("resume_file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "resume_file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResumeBuffer(file.name || "resume", bytes);
    const resumeRecord = await buildResumeBlobRecord({
      resumeUrl: parsed.resume_url ?? null,
      resumeText: parsed.resume_text ?? null,
      fileName: file.name || null,
      fileType: file.type || null,
      fileBytes: bytes,
    });

    const result = await query(
      `
      UPDATE candidates
      SET
        resume_url = $2,
        resume_text = $3,
        resume_file_name = $4,
        resume_file_type = $5,
        resume_file_size = $6,
        resume_blob = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, resume_url
      `,
      [
        candidateId,
        resumeRecord.resume_url,
        resumeRecord.resume_text,
        resumeRecord.resume_file_name,
        resumeRecord.resume_file_type,
        resumeRecord.resume_file_size,
        resumeRecord.resume_blob,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    void persistCandidateDerivedProfile(candidateId).catch(() => {});
    void refreshResumeEmbeddingForCandidate(candidateId, auth.access.user_id).catch(() => {});

    return NextResponse.json({
      ok: true,
      id: candidateId,
      resume_url: result.rows[0]?.resume_url ?? null,
      parsed: {
        full_name: parsed.full_name,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        linkedin_url: parsed.linkedin_url,
        skills: parsed.skills,
      },
    });
  } catch (error: any) {
    console.error("Error uploading candidate resume", error);
    return NextResponse.json({ error: error?.message || "Failed to upload resume" }, { status: 500 });
  }
}
