import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";
import { logScreeningAudit } from "@/lib/screeningAudit";
import { recordDispositionEvent, validateDispositionReason } from "@/lib/dispositionAudit";

export const runtime = "nodejs";

const STAGES = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;
type Stage = (typeof STAGES)[number];

function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/**
 * POST { application_ids: number[], stage: Stage, disposition_reason_id?: number, stage_change_reason?: string }
 * Guardrails: max 50 rows; Rejected requires disposition_reason_id; single reason applied to all rejections.
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const raw = Array.isArray(body?.application_ids) ? body.application_ids : [];
    const ids: number[] = Array.from(
      new Set(
        raw
          .map((x: unknown) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );
    const stage = body?.stage;
    const stage_change_reason =
      typeof body?.stage_change_reason === "string" && body.stage_change_reason.trim()
        ? body.stage_change_reason.trim().slice(0, 2000)
        : null;
    const disposition_reason_id = body?.disposition_reason_id != null ? Number(body.disposition_reason_id) : null;

    if (ids.length === 0) {
      return NextResponse.json({ error: "application_ids must be a non-empty array" }, { status: 400 });
    }
    if (ids.length > 50) {
      return NextResponse.json({ error: "Too many applications (max 50 per bulk stage)" }, { status: 400 });
    }
    if (!isStage(stage)) {
      return NextResponse.json({ error: `stage must be one of: ${STAGES.join(", ")}` }, { status: 400 });
    }

    let validatedRejectReasonId: number | null = null;
    if (stage === "Rejected") {
      const v = await validateDispositionReason(Number(disposition_reason_id), ["reject", "withdraw"]);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.error || "disposition_reason_id is required when moving to Rejected" },
          { status: 400 }
        );
      }
      validatedRejectReasonId = Number(disposition_reason_id);
    }

    const hasTeam = await hasJobTeamTable();
    const access = applicationAccessPredicate("applications", "$2", hasTeam);

    let ok = 0;
    const errors: { id: number; error: string }[] = [];

    for (const appId of ids) {
      try {
        const prevRes = await query(
          `SELECT id, candidate_id, stage AS prev_stage FROM applications WHERE id = $1 AND (${access})`,
          [appId, user.user_id]
        );
        if (prevRes.rowCount === 0) {
          errors.push({ id: appId, error: "not found or forbidden" });
          continue;
        }
        const row = prevRes.rows[0] as { id: number; candidate_id: number; prev_stage: string };
        const prevStage = row.prev_stage as Stage;
        const candId = Number(row.candidate_id);

        await query(
          `
          UPDATE applications
          SET stage = $3,
              status = $3,
              updated_at = NOW()
          WHERE id = $1 AND (${access})
          `,
          [appId, user.user_id, stage]
        );

        await logScreeningAudit({
          event_type: "stage_override",
          application_id: appId,
          candidate_id: candId,
          created_by_user_id: Number(user.user_id),
          metadata: {
            from_stage: prevStage,
            to_stage: stage,
            reason: stage_change_reason,
            bulk: true,
          },
        });

        if (stage === "Rejected" && validatedRejectReasonId) {
          await recordDispositionEvent({
            userId: Number(user.user_id),
            entityType: "application",
            entityId: appId,
            reasonId: validatedRejectReasonId,
            notes: stage_change_reason,
            metadata: { bulk: true },
          });
        }

        ok += 1;
      } catch (e: any) {
        errors.push({ id: appId, error: e?.message || "update failed" });
      }
    }

    return NextResponse.json({ ok: true, updated: ok, errors });
  } catch (e) {
    console.error("applications/bulk-stage", e);
    return NextResponse.json({ error: "Bulk stage failed" }, { status: 500 });
  }
}
