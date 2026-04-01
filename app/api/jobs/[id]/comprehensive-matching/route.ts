import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { comprehensiveJDResumeMatch } from "@/lib/comprehensiveJDResumeMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const jobId = Number(params.id);
    if (!Number.isFinite(jobId)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

    // Get job details
    const jobRes = await query(
      `SELECT j.title, j.description, j.experience_requirement
       FROM jobs j
       WHERE j.id = $1 AND j.created_by_user_id = $2`,
      [jobId, user.user_id]
    );

    if (jobRes.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = jobRes.rows[0];
    const jobDescription = job.description || '';
    const jobTitle = job.title || '';
    const experienceRequirement = job.experience_requirement || '';

    // Get all candidates for this job
    const candidatesRes = await query(
      `SELECT c.id, c.full_name, c.skills, c.location, c.notice_period
       FROM candidates c
       JOIN candidate_job_matches m ON m.candidate_id = c.id
       WHERE m.job_id = $1 AND c.created_by_user_id = $2`,
      [jobId, user.user_id]
    );

    console.log(`🚀 Comprehensive matching for ${candidatesRes.rows.length} candidates...`);

    const updatePromises = candidatesRes.rows.map(async (candidate: any) => {
      try {
        // Compute comprehensive match
        const comprehensiveResult = await comprehensiveJDResumeMatch(
          jobDescription,
          candidate.skills || '',
          jobTitle
        );

        // Update the database with new score
        await query(
          `UPDATE candidate_job_matches 
           SET match_score = $1, match_breakdown = $2, matched_skills = $3, missing_must_have = $4, computed_at = NOW()
           WHERE job_id = $5 AND candidate_id = $6`,
          [
            comprehensiveResult.overall_score,
            JSON.stringify(comprehensiveResult),
            comprehensiveResult.detailed_analysis.strengths.slice(0, 5), // Top 5 strengths
            comprehensiveResult.detailed_analysis.gaps.slice(0, 3), // Top 3 gaps
            jobId,
            candidate.id
          ]
        );

        console.log(`✅ Updated ${candidate.full_name}: ${comprehensiveResult.overall_score}% (${comprehensiveResult.decision})`);
        
        return {
          candidate_id: candidate.id,
          full_name: candidate.full_name,
          new_score: comprehensiveResult.overall_score,
          decision: comprehensiveResult.decision,
          processing_time_ms: comprehensiveResult.performance_metrics.processing_time_ms,
          confidence_level: comprehensiveResult.performance_metrics.confidence_level,
          strengths: comprehensiveResult.detailed_analysis.strengths,
          gaps: comprehensiveResult.detailed_analysis.gaps,
          risk_factors: comprehensiveResult.detailed_analysis.risk_factors
        };

      } catch (error: any) {
        console.error(`Failed to update candidate ${candidate.id}:`, error);
        return {
          candidate_id: candidate.id,
          full_name: candidate.full_name,
          error: error.message || 'Unknown error'
        };
      }
    });

    const results = await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      message: `Comprehensive matching completed for ${results.length} candidates`,
      results: results,
      system_info: {
        analysis_type: "comprehensive semantic JD-resume matching",
        features: [
          "Full JD understanding",
          "Complete resume analysis", 
          "Semantic role alignment",
          "Transferable skills recognition",
          "Leadership experience evaluation",
          "Business impact assessment",
          "Risk factor identification"
        ],
        performance: {
          average_processing_time: results.reduce((sum: number, r: any) => sum + (r.processing_time_ms || 0), 0) / results.length,
          total_candidates: results.length
        }
      }
    });

  } catch (error: any) {
    console.error("comprehensive-matching", error);
    return NextResponse.json({ error: "Failed to run comprehensive matching" }, { status: 500 });
  }
}
