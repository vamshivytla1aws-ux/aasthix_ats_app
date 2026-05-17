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
      d.expiry_date,
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
  expiryDate?: string | null;
  uploadedByUserId: number;
}) {
  const ins = await query(
    `
      INSERT INTO employee_documents
      (user_id, category, file_name, file_type, file_size, file_blob, expiry_date, uploaded_by_user_id, uploaded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,NOW())
      RETURNING id
    `,
    [
      input.employeeId,
      input.category,
      input.fileName,
      input.fileType,
      input.fileSize,
      input.fileBuffer,
      input.expiryDate || null,
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
      , expiry_date
      FROM employee_documents
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return res.rows[0] || null;
}

export type DocumentPolicyInput = {
  category: DocumentCategory;
  department?: string | null;
  employmentType?: string | null;
  isMandatory: boolean;
  expiryDays?: number | null;
  isActive: boolean;
};

export async function listDocumentPolicies() {
  const res = await query(
    `
      SELECT id, category, department, employment_type, is_mandatory, expiry_days, is_active, updated_at
      FROM hrms_document_policies
      ORDER BY category ASC, COALESCE(department, '') ASC, COALESCE(employment_type, '') ASC, id ASC
    `,
    [],
  );
  return res.rows;
}

export async function replaceDocumentPolicies(policies: DocumentPolicyInput[], actorUserId: number) {
  await query("DELETE FROM hrms_document_policies", []);
  for (const policy of policies) {
    await query(
      `
        INSERT INTO hrms_document_policies
        (category, department, employment_type, is_mandatory, expiry_days, is_active, created_by_user_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      `,
      [
        policy.category,
        policy.department?.trim() || null,
        policy.employmentType?.trim() || null,
        policy.isMandatory,
        policy.expiryDays ?? null,
        policy.isActive,
        actorUserId,
      ],
    );
  }
  await writeAuditLog({
    actorUserId,
    action: "hrms.documents.policy.updated",
    metadata: { policy_count: policies.length },
  });
}

type ComplianceArgs = {
  employeeId: number;
};

const DEFAULT_MANDATORY_CATEGORIES: DocumentCategory[] = [
  "offer_letter",
  "id_proof",
  "address_proof",
  "experience_letter",
  "education_certificate",
  "policy_acknowledgement",
];

export async function getEmployeeCompliance(args: ComplianceArgs) {
  const userRes = await query(
    `
      SELECT id, COALESCE(department, '') AS department, COALESCE(employment_type, '') AS employment_type, COALESCE(full_name, '') AS full_name
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [args.employeeId],
  );
  if (userRes.rowCount === 0) return null;
  const user = userRes.rows[0] as { id: number; department: string; employment_type: string; full_name: string };

  const policyRows = await listDocumentPolicies();
  const matchedPolicyCategories = new Set<DocumentCategory>();
  for (const row of policyRows as Array<{ category: DocumentCategory; department: string | null; employment_type: string | null; is_mandatory: boolean; is_active: boolean }>) {
    if (!row.is_active || !row.is_mandatory) continue;
    const depOk = !row.department || row.department.trim().toLowerCase() === user.department.trim().toLowerCase();
    const typeOk = !row.employment_type || row.employment_type.trim().toLowerCase() === user.employment_type.trim().toLowerCase();
    if (depOk && typeOk) matchedPolicyCategories.add(row.category);
  }
  if (matchedPolicyCategories.size === 0) {
    for (const category of DEFAULT_MANDATORY_CATEGORIES) matchedPolicyCategories.add(category);
  }

  const docsRes = await query(
    `
      SELECT category, file_name, uploaded_at, expiry_date
      FROM employee_documents
      WHERE user_id = $1
      ORDER BY uploaded_at DESC
    `,
    [args.employeeId],
  );
  const latestByCategory = new Map<string, { file_name: string; uploaded_at: string; expiry_date: string | null }>();
  for (const row of docsRes.rows as Array<{ category: string; file_name: string; uploaded_at: string; expiry_date: string | null }>) {
    if (!latestByCategory.has(row.category)) {
      latestByCategory.set(row.category, row);
    }
  }

  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + 30);

  const missing: string[] = [];
  const expiringSoon: Array<{ category: string; file_name: string; expiry_date: string }> = [];

  for (const category of matchedPolicyCategories) {
    const doc = latestByCategory.get(category);
    if (!doc) {
      missing.push(category);
      continue;
    }
    if (doc.expiry_date) {
      const expiry = new Date(doc.expiry_date);
      if (!Number.isNaN(expiry.getTime()) && expiry <= threshold) {
        expiringSoon.push({
          category,
          file_name: doc.file_name,
          expiry_date: doc.expiry_date,
        });
      }
    }
  }

  return {
    employee_id: user.id,
    employee_name: user.full_name,
    mandatory_categories: Array.from(matchedPolicyCategories),
    missing,
    expiring_soon: expiringSoon,
    compliant: missing.length === 0,
  };
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
