import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export const DOCUMENT_CATEGORIES = [
  "offer_letter",
  "id_proof",
  "address_proof",
  "experience_letter",
  "education_certificate",
  "payslip",
  "policy_acknowledgement",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory);
}

export async function listEmployeeDocuments(params: {
  actorUserId: number;
  role: string;
  employeeId?: number;
}) {
  const values: Array<number> = [];
  let where = "";
  if (params.role === "employee") {
    where = "WHERE d.user_id = $1";
    values.push(params.actorUserId);
  } else if (params.role === "hiring_manager" || params.role === "manager") {
    where = "WHERE u.reporting_manager_user_id = $1";
    values.push(params.actorUserId);
  } else if (params.employeeId && Number(params.employeeId) > 0) {
    where = "WHERE d.user_id = $1";
    values.push(Number(params.employeeId));
  }

  const res = await query(
    `
    SELECT
      d.id,
      d.user_id,
      d.category,
      d.file_name,
      d.file_type,
      d.file_size,
      d.uploaded_at,
      d.uploaded_by_user_id,
      COALESCE(u.full_name, '') AS employee_name,
      COALESCE(a.full_name, '') AS uploaded_by_name
    FROM employee_documents d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN users a ON a.id = d.uploaded_by_user_id
    ${where}
    ORDER BY d.uploaded_at DESC, d.id DESC
    `,
    values,
  );
  return res.rows;
}

export async function storeEmployeeDocument(input: {
  employeeId: number;
  category: DocumentCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBuffer: Buffer;
  uploadedByUserId: number;
}) {
  const ins = await query(
    `
      INSERT INTO employee_documents
      (user_id, category, file_name, file_type, file_size, file_blob, uploaded_by_user_id, uploaded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      RETURNING id
    `,
    [
      input.employeeId,
      input.category,
      input.fileName,
      input.fileType,
      input.fileSize,
      input.fileBuffer,
      input.uploadedByUserId,
    ],
  );
  const id = Number(ins.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.uploadedByUserId,
    action: "hrms.document.uploaded",
    metadata: { document_id: id, employee_id: input.employeeId, category: input.category },
  });
  return id;
}

export async function getDocumentById(id: number) {
  const res = await query(
    `
      SELECT id, user_id, category, file_name, file_type, file_size, file_blob, uploaded_at
      FROM employee_documents
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return res.rows[0] || null;
}

export async function deleteDocument(id: number, actorUserId: number) {
  const res = await query(`DELETE FROM employee_documents WHERE id = $1 RETURNING user_id`, [id]);
  if (res.rowCount > 0) {
    await writeAuditLog({
      actorUserId,
      action: "hrms.document.deleted",
      metadata: { document_id: id, employee_id: Number(res.rows[0].user_id) },
    });
  }
  return res.rowCount > 0;
}
