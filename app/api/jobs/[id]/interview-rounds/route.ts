import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";

type RoundRow = {
  id: number;
  job_id: number;
  round_key: string;
  round_label: string;
  round_order: number;
  is_final: boolean;
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const jobId = Number(params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const result = await query(
      `
      SELECT id, job_id, round_key, round_label, round_order, is_final
      FROM job_interview_rounds
      WHERE job_id = $1
      ORDER BY round_order ASC, id ASC
      `,
      [jobId]
    );

    return NextResponse.json({ rounds: result.rows as RoundRow[] });
  } catch (e: any) {
    if (e?.code === "42P01") {
      return NextResponse.json({ rounds: [] });
    }
    console.error("interview-rounds GET", e);
    return NextResponse.json({ error: "Failed to load interview rounds" }, { status: 500 });
  }
}

/** Replace labels/order/final flags; add new rounds; drop unused rounds not referenced by applications. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const body = await request.json();
    const rounds = (body?.rounds ?? []) as Array<{
      id?: number;
      round_key?: string;
      round_label: string;
      round_order: number;
      is_final: boolean;
    }>;

    if (!Array.isArray(rounds) || rounds.length === 0) {
      return NextResponse.json({ error: "rounds must be a non-empty array" }, { status: 400 });
    }

    for (const r of rounds) {
      if (typeof r.round_label !== "string" || !r.round_label.trim()) {
        return NextResponse.json({ error: "Each round needs a non-empty round_label" }, { status: 400 });
      }
      const ord = Number(r.round_order);
      if (!Number.isFinite(ord) || ord < 1) {
        return NextResponse.json({ error: "Each round needs round_order >= 1" }, { status: 400 });
      }
    }

    const finals = rounds.filter((r) => r.is_final === true);
    if (finals.length > 1) {
      return NextResponse.json({ error: "Only one round may be marked final" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(`SELECT id FROM job_interview_rounds WHERE job_id = $1`, [jobId]);
      const existingIds = new Set((existing.rows as { id: number }[]).map((x) => x.id));
      const keptIds = new Set<number>();

      for (const r of rounds) {
        const label = r.round_label.trim();
        const ord = Math.trunc(Number(r.round_order));
        const isFinal = Boolean(r.is_final);
        const rid = r.id != null ? Number(r.id) : NaN;

        if (Number.isFinite(rid) && rid > 0 && existingIds.has(rid)) {
          await client.query(
            `
            UPDATE job_interview_rounds
            SET round_label = $1,
                round_order = $2,
                is_final = $3
            WHERE id = $4 AND job_id = $5
            `,
            [label, ord, isFinal, rid, jobId]
          );
          keptIds.add(rid);
        } else {
          const key =
            typeof r.round_key === "string" && r.round_key.trim()
              ? r.round_key.trim().replace(/\s+/g, "_").slice(0, 64)
              : `rnd_${ord}_${Math.random().toString(36).slice(2, 10)}`;
          const ins = await client.query(
            `
            INSERT INTO job_interview_rounds (job_id, round_key, round_label, round_order, is_final, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (job_id, round_key) DO UPDATE SET
              round_label = EXCLUDED.round_label,
              round_order = EXCLUDED.round_order,
              is_final = EXCLUDED.is_final
            RETURNING id
            `,
            [jobId, key, label, ord, isFinal, user.user_id]
          );
          const newId = (ins.rows[0] as { id: number }).id;
          keptIds.add(newId);
        }
      }

      for (const row of existing.rows as { id: number }[]) {
        if (keptIds.has(row.id)) continue;
        const inUse = await client.query(
          `SELECT 1 FROM applications WHERE current_interview_round_id = $1 LIMIT 1`,
          [row.id]
        );
        if (inUse.rowCount && inUse.rowCount > 0) {
          throw new Error(
            `Cannot remove round #${row.id}: candidates are still on this round. Move them first.`
          );
        }
        await client.query(`DELETE FROM job_interview_rounds WHERE id = $1 AND job_id = $2`, [row.id, jobId]);
      }

      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    const result = await query(
      `
      SELECT id, job_id, round_key, round_label, round_order, is_final
      FROM job_interview_rounds
      WHERE job_id = $1
      ORDER BY round_order ASC, id ASC
      `,
      [jobId]
    );

    return NextResponse.json({ rounds: result.rows as RoundRow[] });
  } catch (e: any) {
    if (e?.code === "42P01") {
      return NextResponse.json({ error: "Interview rounds table not available" }, { status: 503 });
    }
    const msg = typeof e?.message === "string" ? e.message : "Failed to save interview rounds";
    if (msg.includes("Cannot remove round")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("interview-rounds PUT", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
