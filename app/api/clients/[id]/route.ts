import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

async function getContacts(clientId: number) {
  const res = await query(
    `
    SELECT id, client_id, name, email, phone, designation, created_at
    FROM client_contacts
    WHERE client_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [clientId]
  );
  return res.rows;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("vendors.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const clientId = Number(params.id);
    if (!Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid client id" }, { status: 400 });

    const cRes = await query(
      `
      SELECT
        id, name, industry, service_type, COALESCE(website, website_url) AS website,
        address, commercials, invoice_days, invoice_agreement, agreement_enabled, status, remarks,
        agreement_start_date, agreement_end_date, renewal_notice_days, created_at
      FROM vendors
      WHERE id = $1 AND created_by_user_id = $2
      `,
      [clientId, user.user_id]
    );
    const client = cRes.rows[0];
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const contacts = await getContacts(clientId);

    const jobsRes = await query(
      `SELECT id, title, company, location, status, description, created_at FROM jobs WHERE created_by_user_id = $1 AND vendor_id = $2 ORDER BY created_at DESC NULLS LAST, id DESC`,
      [user.user_id, clientId]
    );
    const candidatesRes = await query(
      `
      SELECT
        a.id AS application_id,
        a.stage,
        a.updated_at,
        c.id AS candidate_id,
        c.full_name AS candidate_full_name,
        c.email AS candidate_email,
        j.id AS job_id,
        j.title AS job_title
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN candidates c ON c.id = a.candidate_id
      WHERE a.created_by_user_id = $1 AND j.vendor_id = $2
      ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
      `,
      [user.user_id, clientId]
    );
    return NextResponse.json({ client: { ...client, contacts }, jobs: jobsRes.rows, candidates_applied: candidatesRes.rows });
  } catch (error) {
    console.error("Error fetching client detail", error);
    return NextResponse.json({ error: "Failed to fetch client detail" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const clientId = Number(params.id);
    if (!Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid client id" }, { status: 400 });

    const body = await request.json();
    const {
      name,
      industry,
      service_type,
      website,
      address,
      commercials,
      invoice_days,
      invoice_agreement,
      agreement_enabled,
      status,
      remarks,
      agreement_start_date,
      agreement_end_date,
      renewal_notice_days,
      contacts,
    } = body ?? {};
    const invoiceDaysNum =
      invoice_days === null || invoice_days === undefined || String(invoice_days).trim() === ""
        ? null
        : Number(invoice_days);
    if (invoiceDaysNum !== null && (!Number.isFinite(invoiceDaysNum) || invoiceDaysNum < 0)) {
      return NextResponse.json({ error: "invoice_days must be a valid number" }, { status: 400 });
    }
    const isAgreementEnabled =
      typeof agreement_enabled === "boolean"
        ? agreement_enabled
        : typeof invoice_agreement === "boolean"
          ? invoice_agreement
          : null;
    if (isAgreementEnabled === true && (!agreement_start_date || !agreement_end_date)) {
      return NextResponse.json(
        { error: "agreement_start_date and agreement_end_date are required when agreement is enabled" },
        { status: 400 }
      );
    }

    const updated = await query(
      `
      UPDATE vendors
      SET
        name = COALESCE($1, name),
        industry = COALESCE($2, industry),
        service_type = COALESCE($3, service_type),
        website = COALESCE($4, website),
        address = COALESCE($5, address),
        commercials = COALESCE($6, commercials),
        invoice_days = COALESCE($7, invoice_days),
        invoice_agreement = COALESCE($8, invoice_agreement),
        agreement_enabled = COALESCE($9, agreement_enabled),
        status = COALESCE($10, status),
        remarks = COALESCE($11, remarks),
        website_url = COALESCE($4, website_url),
        agreement_start_date = CASE WHEN COALESCE($9, agreement_enabled) = FALSE THEN NULL ELSE COALESCE($12::date, agreement_start_date) END,
        agreement_end_date = CASE WHEN COALESCE($9, agreement_enabled) = FALSE THEN NULL ELSE COALESCE($13::date, agreement_end_date) END,
        renewal_notice_days = COALESCE($14::int, renewal_notice_days),
        updated_at = NOW()
      WHERE id = $15 AND created_by_user_id = $16
      RETURNING
        id, name, industry, service_type, COALESCE(website, website_url) AS website,
        address, commercials, invoice_days, invoice_agreement, agreement_enabled, status, remarks,
        agreement_start_date, agreement_end_date, renewal_notice_days, created_at
      `,
      [
        typeof name === "string" ? name : null,
        typeof industry === "string" ? industry : null,
        typeof service_type === "string" ? service_type : null,
        typeof website === "string" ? website : null,
        typeof address === "string" ? address : null,
        typeof commercials === "string" ? commercials : null,
        invoiceDaysNum === null ? null : String(Math.trunc(invoiceDaysNum)),
        typeof invoice_agreement === "boolean" ? invoice_agreement : null,
        typeof isAgreementEnabled === "boolean" ? isAgreementEnabled : null,
        typeof status === "string" ? status : null,
        typeof remarks === "string" ? remarks : null,
        isAgreementEnabled === false ? null : agreement_start_date || null,
        isAgreementEnabled === false ? null : agreement_end_date || null,
        Number.isFinite(Number(renewal_notice_days)) ? Number(renewal_notice_days) : null,
        clientId,
        user.user_id,
      ]
    );
    if (updated.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (Array.isArray(contacts)) {
      await query(`DELETE FROM client_contacts WHERE client_id = $1`, [clientId]);
      for (const c of contacts) {
        const nm = String(c?.name || "").trim();
        if (!nm) continue;
        await query(
          `INSERT INTO client_contacts (client_id, name, email, phone, designation) VALUES ($1, $2, $3, $4, $5)`,
          [clientId, nm, c?.email || null, c?.phone || null, c?.designation || null]
        );
      }
    }

    const contactRows = await getContacts(clientId);
    return NextResponse.json({ ...updated.rows[0], contacts: contactRows });
  } catch (error) {
    console.error("Error updating client", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const clientId = Number(params.id);
    if (!Number.isFinite(clientId)) return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    const result = await query(`DELETE FROM vendors WHERE id = $1 AND created_by_user_id = $2`, [clientId, user.user_id]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting client", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
