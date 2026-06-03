import { describe, expect, it } from "vitest";
import { buildAdvancedPureAiInsights } from "@/lib/singleMatch/advancedPureAi";
import type { AiMatchResult } from "@/lib/matchScoreAi";

function baseAi(overrides?: Partial<AiMatchResult>): AiMatchResult {
  return {
    candidate_id: 1,
    match_score: 58,
    matched_skills: ["Python", "AWS"],
    missing_skills: ["Voice systems", "Real-time architecture"],
    reasoning: "Initial recruiter summary.",
    recruiter_summary: "Initial recruiter summary.",
    recruiter_decision: "Hold",
    strengths: ["Python backend", "AWS"],
    gaps: ["Voice systems"],
    risk_flags: [],
    ...overrides,
  };
}

describe("buildAdvancedPureAiInsights", () => {
  it("recomputes score from requirement evidence and keeps specialized gaps strict", () => {
    const result = buildAdvancedPureAiInsights({
      jobTitle: "Senior Software Engineer - AI & Backend",
      jobDescription:
        "Design scalable backend services using Python. Build microservices, RESTful APIs, and event-driven systems. Develop AI-powered agents using LLM frameworks and multi-agent systems. Integrate vector databases and RAG systems. Work on voice systems using STT/TTS and real-time streaming architectures. Mentor junior engineers.",
      mustHave: ["Python", "microservices", "RESTful APIs", "LLM frameworks", "vector databases"],
      niceToHave: ["voice systems", "real-time architecture"],
      keywords: ["LangGraph", "RAG", "AWS"],
      resumeText:
        "Built Python and FastAPI backend services with event-driven microservices on AWS. Designed RESTful APIs and LangGraph-based multi-agent orchestration. Implemented RAG flows with Pinecone vector databases and mentored junior engineers across backend platform work.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 4200,
      jdCharsScored: 1200,
      baseAi: baseAi(),
    });

    expect(result.match_score).toBeGreaterThanOrEqual(70);
    expect(result.confidence_score).toBeGreaterThanOrEqual(70);
    expect(result.requirement_breakdown?.some((item) => item.label.toLowerCase().includes("python") && item.status === "met")).toBe(
      true
    );
    expect(
      result.requirement_breakdown?.some(
        (item) => item.label.toLowerCase().includes("voice systems") && item.status === "not_met"
      )
    ).toBe(true);
    expect(result.missing_required_skills.some((item) => item.toLowerCase().includes("voice"))).toBe(true);
    expect(result.interview_focus_areas?.length).toBeGreaterThan(0);
    expect(result.follow_up_questions?.length).toBeGreaterThan(0);
  });

  it("marks unclear requirements and lowers confidence for fallback summary scoring", () => {
    const result = buildAdvancedPureAiInsights({
      jobTitle: "Senior Frontend Engineer",
      jobDescription:
        "Build React and TypeScript applications. Lead frontend architecture. Collaborate with cross-functional teams and mentor engineers. Nice to have Playwright and performance testing experience.",
      mustHave: ["React", "TypeScript"],
      niceToHave: ["Playwright", "performance testing"],
      keywords: ["frontend architecture", "cross-functional"],
      resumeText: "Senior frontend engineer with React, TypeScript, and mentoring experience.",
      resumeSource: "experience_summary_or_skills",
      resumeCharsScored: 180,
      jdCharsScored: 420,
      baseAi: baseAi({
        match_score: 62,
        matched_skills: ["React", "TypeScript"],
        missing_skills: ["Playwright"],
        strengths: ["React", "TypeScript"],
        gaps: ["Performance testing"],
      }),
    });

    expect(result.confidence_score).toBeLessThan(65);
    expect(result.resume_quality_flags?.some((item) => item.toLowerCase().includes("fallback"))).toBe(true);
    expect(
      result.requirement_breakdown?.some((item) => item.status === "unclear_due_to_source_quality")
    ).toBe(true);
    expect(result.recommended_next_step?.toLowerCase().includes("resume")).toBe(true);
  });

  it("deduplicates repeated JD concepts and stays strict on specialized gaps", () => {
    const result = buildAdvancedPureAiInsights({
      jobTitle: "Senior Backend Engineer",
      jobDescription:
        "Design and develop scalable backend services using Python. Build microservices, RESTful APIs, and event-driven systems. Integrate APIs and vector databases. Work on voice systems using STT/TTS and real-time streaming architectures.",
      mustHave: ["Python", "microservices", "RESTful APIs", "vector databases"],
      niceToHave: ["voice systems", "MCP"],
      keywords: ["Python", "microservices", "REST APIs", "vector DBs"],
      resumeText:
        "Built Python FastAPI backend services with event-driven microservices and REST APIs. Integrated Pinecone vector databases and RAG pipelines. Worked on streaming architecture and realtime services, but not on protocol-driven orchestration frameworks or multimodal systems.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 1200,
      jdCharsScored: 520,
      baseAi: baseAi({
        match_score: 71,
        strengths: ["Python backend", "Microservices", "REST APIs"],
        gaps: ["Voice systems", "MCP"],
      }),
    });

    const pythonRequirements = result.requirement_breakdown?.filter((item) => item.label.toLowerCase().includes("python")) ?? [];
    expect(pythonRequirements.length).toBe(1);
    const mcpRequirement = result.requirement_breakdown?.find((item) => item.label.toLowerCase().includes("mcp"));
    expect(mcpRequirement?.status).not.toBe("met");
  });
});
