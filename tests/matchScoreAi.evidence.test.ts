import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchOpenAiChatCompletions } = vi.hoisted(() => ({
  fetchOpenAiChatCompletions: vi.fn(),
}));

vi.mock("@/lib/openaiChat", () => ({
  fetchOpenAiChatCompletions,
  isAbortError: () => false,
  openAiChatTimeoutMs: () => 1_000,
}));

import { scoreCandidatesBatchWithOpenAI } from "@/lib/matchScoreAi";

describe("scoreCandidatesBatchWithOpenAI evidence reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.MATCH_OPENAI_MODEL = "gpt-4o";
  });

  it("removes false AI/backend gaps when the resume explicitly proves them", async () => {
    fetchOpenAiChatCompletions.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  {
                    candidate_id: 1,
                    match_score: 52,
                    matched_skills: ["Python", "AWS"],
                    missing_skills: [
                      "No experience with LLM frameworks or agent systems",
                      "Lacks experience in building RESTful APIs",
                      "No demonstrated experience with vector databases",
                      "No demonstrated experience with voice systems or real-time architecture",
                    ],
                    reasoning: "Initial model pass underweighted explicit resume evidence.",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await scoreCandidatesBatchWithOpenAI({
      jobTitle: "Senior Software Engineer - AI & Backend",
      jobDescriptionExcerpt:
        "Build AI-powered agents using LLM frameworks, build RESTful APIs, integrate vector databases and RAG systems, and work on voice systems with STT/TTS.",
      experienceRequirement: "5+ years",
      mustHave: ["Python", "LLM frameworks", "RESTful APIs", "vector DBs"],
      niceToHave: ["voice systems", "real-time architecture"],
      keywords: ["agents", "LangGraph", "RAG"],
      candidates: [
        {
          id: 1,
          full_name: "Candidate",
          skills: null,
          location: "Bangalore",
          resumeText:
            "Built multi-agent systems with LangGraph and LLM gateways. Designed RESTful APIs in FastAPI and Python. Implemented RAG flows over Pinecone vector databases on AWS. Mentored team members on backend architecture.",
        },
      ],
    });

    const ai = result?.get(1);
    expect(ai).toBeTruthy();
    expect(ai?.missing_skills).not.toContain("No experience with LLM frameworks or agent systems");
    expect(ai?.missing_skills).not.toContain("Lacks experience in building RESTful APIs");
    expect(ai?.missing_skills).not.toContain("No demonstrated experience with vector databases");
    expect(ai?.missing_skills).toContain("No demonstrated experience with voice systems or real-time architecture");
    expect(ai?.match_score).toBeGreaterThan(52);
    expect(ai?.matched_skills.some((item) => /LangGraph/i.test(item))).toBe(true);
  });

  it("stays strict for specialized requirements that are not explicitly proven", async () => {
    fetchOpenAiChatCompletions.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  {
                    candidate_id: 2,
                    match_score: 48,
                    matched_skills: ["Python", "Microservices", "AWS"],
                    missing_skills: [
                      "No demonstrated experience with voice systems or real-time architecture",
                      "No demonstrated experience with vector databases",
                    ],
                    reasoning: "Generic backend profile without specialized AI voice stack.",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await scoreCandidatesBatchWithOpenAI({
      jobTitle: "Senior Software Engineer - AI & Backend",
      jobDescriptionExcerpt:
        "Need microservices, vector databases, and voice systems using STT/TTS with real-time streaming.",
      experienceRequirement: "5+ years",
      mustHave: ["microservices", "vector databases"],
      niceToHave: ["voice systems", "STT/TTS"],
      keywords: ["real-time"],
      candidates: [
        {
          id: 2,
          full_name: "Backend Only",
          skills: null,
          location: "Bangalore",
          resumeText:
            "Built Python microservices on AWS with Docker, Kubernetes, and event-driven systems. Designed APIs and backend observability for enterprise products.",
        },
      ],
    });

    const ai = result?.get(2);
    expect(ai).toBeTruthy();
    expect(ai?.missing_skills).toContain("No demonstrated experience with voice systems or real-time architecture");
    expect(ai?.missing_skills).toContain("No demonstrated experience with vector databases");
  });
});
