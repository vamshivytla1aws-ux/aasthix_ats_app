import { randomBytes } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { query } from "@/lib/db";

export type OnboardingStatus =
  | "not_sent"
  | "sent"
  | "in_progress"
  | "submitted"
  | "exported"
  | "revoked"
  | "expired";

export const ONBOARDING_DOC_FIELDS = [
  { key: "gov_id", label: "Government ID Proof (Aadhar / Passport)" },
  { key: "pan_card", label: "PAN Card Copy" },
  { key: "address_proof", label: "Address Proof" },
  { key: "education_certs", label: "Educational Certificates" },
  { key: "experience_letters", label: "Previous Company Experience Letters" },
  { key: "last_3_payslips", label: "Last 3 Months Payslips" },
  { key: "passport_photo", label: "Passport Size Photographs" },
  { key: "bank_proof", label: "Bank Account Details (Cancelled Cheque / Passbook Copy)" },
] as const;

export function createOnboardingToken() {
  return randomBytes(24).toString("hex");
}

export async function appendCandidateActivity(
  candidateId: number,
  type: string,
  description: string
) {
  await query(
    `
    INSERT INTO candidate_activity (candidate_id, type, description, created_at)
    VALUES ($1, $2, $3, NOW())
    `,
    [candidateId, type.slice(0, 64), description.slice(0, 2000)]
  );
}

export async function getLatestPacketByApplication(applicationId: number) {
  const res = await query(
    `
    SELECT p.*, c.full_name AS candidate_full_name, c.email AS candidate_email, j.title AS job_title
    FROM application_onboarding_packets p
    JOIN applications a ON a.id = p.application_id
    JOIN candidates c ON c.id = p.candidate_id
    JOIN jobs j ON j.id = a.job_id
    WHERE p.application_id = $1
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1
    `,
    [applicationId]
  );
  return res.rows[0] ?? null;
}

export async function listPacketsByCandidate(candidateId: number) {
  const res = await query(
    `
    SELECT
      p.id,
      p.application_id,
      p.candidate_id,
      p.status,
      p.note,
      p.deadline_at,
      p.submitted_at,
      p.exported_at,
      p.created_at,
      p.updated_at,
      j.title AS job_title
    FROM application_onboarding_packets p
    JOIN applications a ON a.id = p.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE p.candidate_id = $1
    ORDER BY p.created_at DESC, p.id DESC
    `,
    [candidateId]
  );
  return res.rows;
}

export async function saveOnboardingFiles(input: {
  packetId: number;
  filesByDoc: Array<{ docType: string; files: File[] }>;
}) {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "onboarding", String(input.packetId));
  await mkdir(uploadDir, { recursive: true });
  const accepted: Array<{
    doc_type: string;
    file_name: string;
    file_url: string;
    mime: string | null;
    size_bytes: number;
    file_blob: Buffer;
  }> = [];

  for (const row of input.filesByDoc) {
    for (const file of row.files) {
      const ext = path.extname(file.name) || ".bin";
      const safeName = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
      const filePath = path.join(uploadDir, safeName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, bytes);
      accepted.push({
        doc_type: row.docType,
        file_name: file.name,
        file_url: `/uploads/onboarding/${input.packetId}/${safeName}`,
        mime: file.type || null,
        size_bytes: file.size,
        file_blob: bytes,
      });
    }
  }

  for (const doc of accepted) {
    await query(
      `
      INSERT INTO application_onboarding_documents
      (packet_id, doc_type, file_name, file_url, mime, size_bytes, file_blob, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [input.packetId, doc.doc_type, doc.file_name, doc.file_url, doc.mime, doc.size_bytes, doc.file_blob]
    );
  }

  return accepted;
}
