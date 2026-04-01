import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { parseResumeBuffer } from "@/lib/resumeParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const form = await request.formData();
    const files = form.getAll("files").filter((x): x is File => x instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded. Use field name 'files'." }, { status: 400 });
    }
    if (files.length > 50) {
      return NextResponse.json({ error: "Maximum 50 resumes per batch." }, { status: 400 });
    }

    const rows: Array<{
      row_id: string;
      file_name: string;
      parse_ok: boolean;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      location: string | null;
      linkedin_url: string | null;
      skills: string | null;
      resume_url: string | null;
      confidence: {
        full_name: number;
        email: number;
        phone: number;
        location: number;
        linkedin_url: number;
        skills: number;
        overall: number;
      };
      duplicate_match: {
        by_email: boolean;
        by_phone: boolean;
        existing: Array<{
          id: number;
          full_name: string;
          email: string | null;
          phone: string | null;
        }>;
      };
      parse_error?: string;
    }> = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const file_name = file.name || `resume-${i + 1}`;
      const row_id = `${i + 1}-${file_name}`;
      try {
        const parsed = await parseResumeBuffer(file_name, Buffer.from(await file.arrayBuffer()));
        const duplicateCandidates = await query(
          `
          SELECT id, full_name, email, phone
          FROM candidates
          WHERE created_by_user_id = $1
            AND (
              ($2::text IS NOT NULL AND lower(email) = lower($2::text))
              OR ($3::text IS NOT NULL AND phone = $3::text)
            )
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT 5
          `,
          [user.user_id, parsed.email ?? null, parsed.phone ?? null]
        );
        const existing = (duplicateCandidates.rows || []).map((r: any) => ({
          id: Number(r.id),
          full_name: String(r.full_name || ""),
          email: r.email ?? null,
          phone: r.phone ?? null,
        }));
        const byEmail =
          Boolean(parsed.email) &&
          existing.some((x: { email: string | null }) => (x.email || "").toLowerCase() === (parsed.email || "").toLowerCase());
        const byPhone =
          Boolean(parsed.phone) &&
          existing.some((x: { phone: string | null }) => (x.phone || "") === (parsed.phone || ""));

        rows.push({
          row_id,
          file_name,
          parse_ok: true,
          full_name: parsed.full_name,
          email: parsed.email,
          phone: parsed.phone,
          location: parsed.location,
          linkedin_url: parsed.linkedin_url,
          skills: parsed.skills,
          resume_url: parsed.resume_url,
          confidence: parsed.confidence,
          duplicate_match: {
            by_email: byEmail,
            by_phone: byPhone,
            existing,
          },
        });
      } catch (e: any) {
        rows.push({
          row_id,
          file_name,
          parse_ok: false,
          full_name: null,
          email: null,
          phone: null,
          location: null,
          linkedin_url: null,
          skills: null,
          resume_url: null,
          confidence: {
            full_name: 0,
            email: 0,
            phone: 0,
            location: 0,
            linkedin_url: 0,
            skills: 0,
            overall: 0,
          },
          duplicate_match: {
            by_email: false,
            by_phone: false,
            existing: [],
          },
          parse_error: e?.message || "Failed to parse",
        });
      }
    }

    return NextResponse.json({
      total: files.length,
      parsed_ok: rows.filter((r) => r.parse_ok).length,
      parsed_failed: rows.filter((r) => !r.parse_ok).length,
      rows,
    });
  } catch (error) {
    console.error("Bulk parse failed", error);
    return NextResponse.json({ error: "Failed to parse resumes" }, { status: 500 });
  }
}
