import { NextRequest, NextResponse } from "next/server";
import { evaluateCandidateSemantically } from "@/lib/semanticCandidateEvaluation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { jobDescription, candidateResume, jobTitle } = await request.json();

    // Validate inputs
    if (!jobDescription || !candidateResume) {
      return NextResponse.json(
        { error: "jobDescription and candidateResume are required" },
        { status: 400 }
      );
    }

    // Perform semantic evaluation
    const evaluation = await evaluateCandidateSemantically(
      jobDescription,
      candidateResume,
      jobTitle || "Senior Role"
    );

    return NextResponse.json(evaluation);

  } catch (error) {
    console.error("Semantic evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate candidate" },
      { status: 500 }
    );
  }
}
