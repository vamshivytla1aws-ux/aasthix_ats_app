import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = ["Applied", "Screening", "Interview", "Selected", "Rejected"] as const;

export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (access.permissions["pipeline.view"] === false && access.permissions["jobs.view"] === false) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = access.role === "admin";
    const uid = access.user_id;

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch { /* not migrated */ }

    const ownerOrTeam = hasTeamTable
      ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
      : `j.created_by_user_id = $1`;
    const jobWhere = isAdmin ? "TRUE" : ownerOrTeam;
    const params = isAdmin ? [] : [uid];

    // Stage counts
    const stageRes = await query(
      `SELECT a.stage, COUNT(*)::int AS count
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${jobWhere}
       GROUP BY a.stage`,
      params
    );
    const stageCounts: Record<string, number> = {};
    for (const r of stageRes.rows as Array<{ stage: string; count: number }>) {
      stageCounts[r.stage] = r.count;
    }

    // Avg time in each stage (days since last update for current occupants)
    const avgTimeRes = await query(
      `SELECT a.stage,
              AVG(EXTRACT(EPOCH FROM (NOW() - a.updated_at)) / 86400)::numeric(10,1) AS avg_days
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${jobWhere}
         AND a.stage NOT IN ('Selected', 'Rejected')
       GROUP BY a.stage`,
      params
    );
    const avgTime: Record<string, number> = {};
    for (const r of avgTimeRes.rows as Array<{ stage: string; avg_days: string }>) {
      avgTime[r.stage] = Number(r.avg_days);
    }

    // Stage transition velocity (how many days between creation and reaching each stage)
    const velocityRes = await query(
      `SELECT a.stage,
              AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 86400)::numeric(10,1) AS avg_days_to_reach
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${jobWhere}
       GROUP BY a.stage`,
      params
    );
    const velocity: Record<string, number> = {};
    for (const r of velocityRes.rows as Array<{ stage: string; avg_days_to_reach: string }>) {
      velocity[r.stage] = Number(r.avg_days_to_reach);
    }

    // Bottleneck detection
    const bottlenecks: Array<{ stage: string; reason: string; severity: "high" | "medium" | "low" }> = [];
    const totalActive = STAGES.filter(s => s !== "Selected" && s !== "Rejected")
      .reduce((sum, s) => sum + (stageCounts[s] ?? 0), 0);

    for (const stage of STAGES) {
      if (stage === "Selected" || stage === "Rejected") continue;
      const count = stageCounts[stage] ?? 0;
      const days = avgTime[stage] ?? 0;

      if (totalActive > 0 && count / totalActive > 0.5) {
        bottlenecks.push({
          stage,
          reason: `${Math.round((count / totalActive) * 100)}% of active candidates stuck here`,
          severity: "high",
        });
      } else if (days > 7) {
        bottlenecks.push({
          stage,
          reason: `Average ${days.toFixed(1)} days in stage`,
          severity: days > 14 ? "high" : "medium",
        });
      }
    }

    // Stage flow (conversion between consecutive stages)
    const flow: Array<{ from: string; to: string; conversion_pct: number }> = [];
    const ordered = ["Applied", "Screening", "Interview", "Selected"];
    for (let i = 0; i < ordered.length - 1; i++) {
      const fromCount = stageCounts[ordered[i]] ?? 0;
      const toCount = stageCounts[ordered[i + 1]] ?? 0;
      const total = fromCount + toCount;
      flow.push({
        from: ordered[i],
        to: ordered[i + 1],
        conversion_pct: total > 0 ? Math.round((toCount / (fromCount + toCount)) * 100) : 0,
      });
    }

    return NextResponse.json({
      stage_counts: stageCounts,
      avg_time_in_stage: avgTime,
      stage_velocity: velocity,
      bottlenecks,
      flow,
    });
  } catch (error) {
    console.error("analytics/pipeline GET", error);
    return NextResponse.json({ error: "Failed to load pipeline analytics" }, { status: 500 });
  }
}
