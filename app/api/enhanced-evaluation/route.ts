import { NextRequest, NextResponse } from "next/server";
import { computeEnhancedMatch } from "@/lib/enhancedAtsMatching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { jobDescription, candidateResume, jobTitle, experienceRequirement } = await request.json();

    // Validate inputs
    if (!jobDescription || !candidateResume) {
      return NextResponse.json(
        { error: "jobDescription and candidateResume are required" },
        { status: 400 }
      );
    }

    // Perform enhanced evaluation with transferable skills recognition
    const evaluation = await computeEnhancedMatch(
      jobDescription,
      candidateResume,
      jobTitle || "Senior Role",
      experienceRequirement || "5+ years"
    );

    return NextResponse.json(evaluation);

  } catch (error) {
    console.error("Enhanced evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate candidate with enhanced system" },
      { status: 500 }
    );
  }
}
