import { describe, expect, it } from "vitest";
import { buildAdvancedPureAiInsights } from "@/lib/singleMatch/advancedPureAi";
import type { AiMatchResult } from "@/lib/matchScoreAi";

function baseAi(overrides?: Partial<AiMatchResult>): AiMatchResult {
  return {
    candidate_id: 1,
    match_score: 62,
    matched_skills: ["Python backend", "AWS"],
    missing_skills: ["Voice systems"],
    reasoning: "Initial recruiter summary.",
    recruiter_summary: "Initial recruiter summary.",
    recruiter_decision: "Hold",
    strengths: ["Python backend", "REST APIs", "LangGraph"],
    gaps: ["Voice systems"],
    risk_flags: [],
    ...overrides,
  };
}

async function score(input: Parameters<typeof buildAdvancedPureAiInsights>[0]) {
  return buildAdvancedPureAiInsights({
    ...input,
    embeddingProvider: async (texts: string[]) =>
      texts.map((text) => {
        const lower = text.toLowerCase();
        return [
          /(python|fastapi|rest|grpc|microservice|backend|redis|celery|aws|docker|ci\/cd)/.test(lower) ? 1 : 0,
          /(vector|pinecone|rag|retrieval|embedding)/.test(lower) ? 1 : 0,
          /(llm|langgraph|langchain|agent|autogen|crewai)/.test(lower) ? 1 : 0,
          /(real-time|realtime|sse|websocket|streaming)/.test(lower) ? 1 : 0,
          /(voice|stt|tts|speech|audio|telephony)/.test(lower) ? 1 : 0,
          /(mcp|model context protocol)/.test(lower) ? 1 : 0,
        ];
      }),
  });
}

describe("buildAdvancedPureAiInsights", () => {
  it("matches LangGraph, Pinecone, RAG, REST APIs, and microservices as true evidence", async () => {
    const result = await score({
      jobTitle: "Senior Software Engineer - AI Backend",
      jobDescription:
        "Build scalable backend services using Python. Build microservices, RESTful APIs, and event-driven systems. Develop AI-powered agents using LLM frameworks and multi-agent systems. Integrate vector databases and RAG systems. Nice to have voice systems using STT/TTS and real-time streaming.",
      experienceRequirement: "5-8 years",
      mustHave: ["Python backend", "RESTful APIs", "microservices", "LLM frameworks", "vector databases", "RAG systems"],
      niceToHave: ["voice systems", "MCP"],
      keywords: ["LangGraph", "multi-agent systems", "distributed systems"],
      resumeText:
        "Senior backend engineer with 5+ years building Python FastAPI backend services. Designed REST APIs, gRPC services, API Gateway, Celery workers, Redis PubSub, and event-driven microservices. Built LangGraph supervisor plus specialist agent orchestration, RAG pipelines, and Pinecone vector search on AWS with Docker and CI/CD.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 4200,
      jdCharsScored: 1300,
      baseAi: baseAi({
        strengths: ["LangGraph", "Pinecone vector search", "REST APIs", "microservices"],
        gaps: ["Voice systems", "MCP"],
      }),
    });

    expect(result.match_score).toBeGreaterThanOrEqual(70);
    expect(result.fit_level === "Good Match" || result.fit_level === "Strong Match").toBe(true);
    expect(result.missing_required_skills.some((item) => /llm|rest|microservices|vector|rag/i.test(item))).toBe(false);
    expect(result.requirement_breakdown?.find((item) => /llm frameworks/i.test(item.label))?.match_type).toBe("synonym_match");
    expect(result.requirement_breakdown?.find((item) => /vector databases/i.test(item.label))?.status).toBe("met");
    expect(result.requirement_breakdown?.find((item) => /rag systems/i.test(item.label))?.status).toBe("met");
    expect(result.requirement_breakdown?.find((item) => /voice systems/i.test(item.label))?.status).not.toBe("met");
  });

  it("treats missing STT/TTS and MCP as nice-to-have gaps only when they are nice-to-have", async () => {
    const result = await score({
      jobTitle: "Senior AI Backend Engineer",
      jobDescription:
        "Build Python backend systems, REST APIs, and AI agents. Nice to have STT/TTS voice systems and MCP or similar frameworks.",
      experienceRequirement: "5+ years",
      mustHave: ["Python backend", "RESTful APIs", "AI agents"],
      niceToHave: ["voice systems", "MCP"],
      keywords: ["LangGraph", "RAG"],
      resumeText:
        "Engineer with 6 years building Python services, FastAPI endpoints, LangGraph agent orchestration, and RAG platforms.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 1800,
      jdCharsScored: 600,
      baseAi: baseAi(),
    });
    expect(result.missing_required_skills.some((item) => /voice|mcp/i.test(item))).toBe(false);
    expect(result.missing_nice_to_have_requirements?.some((item) => /voice/i.test(item))).toBe(true);
    expect(result.missing_nice_to_have_requirements?.some((item) => /mcp/i.test(item))).toBe(true);
  });

  it("marks immediate notice as unknown instead of missing", async () => {
    const result = await score({
      jobTitle: "Backend Engineer",
      jobDescription: "Location: Bangalore\nNotice: Immediate\nBuild Python APIs.",
      experienceRequirement: "5+ years",
      mustHave: ["Python backend"],
      niceToHave: [],
      keywords: ["backend"],
      resumeText: "Backend engineer with 5+ years building Python APIs from Hyderabad.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 1000,
      jdCharsScored: 120,
      baseAi: baseAi(),
    });

    expect(result.critical_unknowns?.some((item) => /immediate notice/i.test(item))).toBe(true);
    expect(result.missing_required_skills.some((item) => /immediate notice/i.test(item))).toBe(false);
  });

  it("treats 5+ years as meeting a 5-8 year requirement", async () => {
    const result = await score({
      jobTitle: "Senior Backend Engineer",
      jobDescription: "We need 5-8 years of backend engineering experience with Python and AWS.",
      experienceRequirement: "5-8 years",
      mustHave: ["Python backend", "AWS"],
      niceToHave: [],
      keywords: ["backend"],
      resumeText: "Software engineer with 5+ years building Python backend services on AWS.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 900,
      jdCharsScored: 140,
      baseAi: baseAi(),
    });

    expect(result.requirement_breakdown?.find((item) => /5-8 years/i.test(item.label))?.status).toBe("met");
  });

  it("keeps fallback source runs low confidence without inventing hard gaps", async () => {
    const result = await score({
      jobTitle: "Senior Frontend Engineer",
      jobDescription:
        "Build React and TypeScript applications, lead frontend architecture, and collaborate with cross-functional teams. Nice to have Playwright.",
      experienceRequirement: "5+ years",
      mustHave: ["React", "TypeScript"],
      niceToHave: ["Playwright"],
      keywords: ["frontend architecture"],
      resumeText: "Senior frontend engineer with React and TypeScript.",
      resumeSource: "experience_summary_or_skills",
      resumeCharsScored: 120,
      jdCharsScored: 260,
      baseAi: baseAi({
        strengths: ["React", "TypeScript"],
        gaps: ["Playwright"],
      }),
    });

    expect(result.confidence_score).toBeLessThan(70);
    expect(result.resume_quality_flags?.some((item) => /fallback/i.test(item))).toBe(true);
    expect(result.requirement_breakdown?.some((item) => item.status === "unclear_due_to_source_quality")).toBe(true);
  });

  it("does not let a strong AI backend profile collapse into the 25-35% range", async () => {
    const result = await score({
      jobTitle: "Senior Software Engineer (SDE III) – AI & Backend",
      jobDescription:
        "Design scalable backend services using Python. Build microservices, RESTful APIs, and event-driven systems. Develop AI-powered agents using LLM frameworks and multi-agent systems. Work on voice systems using STT/TTS and real-time streaming architectures. Integrate APIs, vector databases, and RAG-based systems. Collaborate with cross-functional teams and mentor junior engineers.",
      experienceRequirement: "5-8 Years",
      mustHave: ["Python backend", "microservices", "RESTful APIs", "LLM frameworks", "vector databases", "cloud platforms"],
      niceToHave: ["voice systems", "MCP", "multi-modal systems"],
      keywords: ["RAG systems", "real-time architecture", "agent frameworks"],
      resumeText:
        "SDE III with 5+ years of experience building Python FastAPI platforms. Built REST APIs, gRPC services, API Gateway, Celery workers, Redis queues, event-driven systems, and backend microservices. Designed LangGraph supervisor and specialist agents, AI-powered agent workflows, RAG pipelines, Pinecone vector search, SSE and gRPC streaming, Docker, CI/CD, AWS S3, and mentoring across cross-functional teams.",
      resumeSource: "uploaded_resume_file",
      resumeCharsScored: 5200,
      jdCharsScored: 1400,
      baseAi: baseAi({
        recruiter_summary: "Strong AI backend fit with missing voice-specific depth only.",
        strengths: ["LangGraph", "Pinecone", "SSE", "gRPC streaming", "microservices", "REST APIs"],
        gaps: ["MCP"],
      }),
    });

    expect(result.match_score).toBeGreaterThanOrEqual(70);
    expect(result.decision === "Send to interview" || result.decision === "Needs recruiter review").toBe(true);
    expect(result.missing_required_skills.some((item) => /microservices|restful apis|llm frameworks|vector databases/i.test(item))).toBe(false);
  });
});
