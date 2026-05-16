import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const payslipId = Number(params.id);
  if (!Number.isFinite(payslipId) || payslipId <= 0) {
    return NextResponse.json({ error: "Invalid payslip id" }, { status: 400 });
  }
  const res = await query(
    `
    SELECT p.id, p.employee_id, p.month, p.year, p.pdf_blob, u.full_name
    FROM payslips p
    JOIN users u ON u.id = p.employee_id
    WHERE p.id = $1
    LIMIT 1
    `,
    [payslipId]
  );
  if (res.rowCount === 0) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  const row = res.rows[0] as any;
  if (!row.pdf_blob) return NextResponse.json({ error: "Payslip PDF not generated yet" }, { status: 404 });
  const safeName = String(row.full_name || "employee").replace(/[^a-z0-9_-]+/gi, "_");
  const filename = `payslip-${safeName}-${row.year}-${String(row.month).padStart(2, "0")}.pdf`;
  const pdfBuffer = row.pdf_blob as Buffer;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
