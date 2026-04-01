import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

async function getContactsByClient(userId: number) {
  const contactsRes = await query(
    `
    SELECT c.id, c.client_id, c.name, c.email, c.phone, c.designation, c.created_at
    FROM client_contacts c
    JOIN vendors v ON v.id = c.client_id
    WHERE v.created_by_user_id = $1
    ORDER BY c.created_at ASC, c.id ASC
    `,
    [userId]
  );
  const map = new Map<number, any[]>();
  for (const row of contactsRes.rows) {
    const key = Number(row.client_id);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export async function GET() {
  try {
    const auth = await requirePermission("vendors.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const result = await query(
      `
      SELECT
        id,
        name,
        industry,
        service_type,
        COALESCE(website, website_url) AS website,
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
        created_at
      FROM vendors
      WHERE vendors.created_by_user_id = $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      `,
      [user.user_id]
    );
    const contactsByClient = await getContactsByClient(user.user_id);
    const now = new Date().getTime();
    const rows = result.rows.map((r: any) => {
      const end = r.agreement_end_date ? new Date(r.agreement_end_date).getTime() : null;
      const daysLeft = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;
      return {
        ...r,
        contacts: contactsByClient.get(Number(r.id)) || [],
        agreement_status: daysLeft === null ? "unknown" : daysLeft < 7 ? "critical" : daysLeft < 30 ? "warning" : "active",
        agreement_days_left: daysLeft,
      };
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error fetching clients", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const body = await request.json();
    const {
      name,
      industry = null,
      service_type = null,
      website = null,
      address = null,
      commercials = null,
      invoice_days = null,
      invoice_agreement = false,
      agreement_enabled = invoice_agreement,
      status = "Active",
      remarks = null,
      agreement_start_date = null,
      agreement_end_date = null,
      renewal_notice_days = 30,
      contacts = [],
    } = body ?? {};
    if (!name || String(name).trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const invoiceDaysNum =
      invoice_days === null || invoice_days === undefined || String(invoice_days).trim() === ""
        ? null
        : Number(invoice_days);
    if (invoiceDaysNum !== null && (!Number.isFinite(invoiceDaysNum) || invoiceDaysNum < 0)) {
      return NextResponse.json({ error: "invoice_days must be a valid number" }, { status: 400 });
    }
    const isAgreementEnabled = Boolean(agreement_enabled);
    if (isAgreementEnabled && (!agreement_start_date || !agreement_end_date)) {
      return NextResponse.json(
        { error: "agreement_start_date and agreement_end_date are required when agreement is enabled" },
        { status: 400 }
      );
    }
    const inserted = await query(
      `
      INSERT INTO vendors (
        name, industry, service_type, website, address, commercials,
        invoice_days, invoice_agreement, agreement_enabled, status, remarks, website_url, created_by_user_id,
        agreement_start_date, agreement_end_date, renewal_notice_days
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING
        id, name, industry, service_type, COALESCE(website, website_url) AS website,
        address, commercials, invoice_days, invoice_agreement, agreement_enabled, status, remarks,
        agreement_start_date, agreement_end_date, renewal_notice_days, created_at
      `,
      [
        String(name).trim(),
        industry,
        service_type,
        website,
        address,
        commercials,
        invoiceDaysNum === null ? null : String(Math.trunc(invoiceDaysNum)),
        Boolean(invoice_agreement),
        isAgreementEnabled,
        status,
        remarks,
        website,
        user.user_id,
        isAgreementEnabled ? agreement_start_date || null : null,
        isAgreementEnabled ? agreement_end_date || null : null,
        isAgreementEnabled && Number.isFinite(Number(renewal_notice_days)) ? Number(renewal_notice_days) : 30,
      ]
    );
    const row = inserted.rows[0];
    const clientId = Number(row.id);
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        const nm = String(c?.name || "").trim();
        if (!nm) continue;
        await query(
          `
          INSERT INTO client_contacts (client_id, name, email, phone, designation)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [clientId, nm, c?.email || null, c?.phone || null, c?.designation || null]
        );
      }
    }
    const contactsRes = await query(
      `SELECT id, client_id, name, email, phone, designation, created_at FROM client_contacts WHERE client_id = $1 ORDER BY created_at ASC, id ASC`,
      [clientId]
    );
    return NextResponse.json({ ...row, contacts: contactsRes.rows }, { status: 201 });
  } catch (err: any) {
    console.error("Error creating client", err);
    return NextResponse.json({ error: err?.message || "Failed to create client" }, { status: 500 });
  }
}
