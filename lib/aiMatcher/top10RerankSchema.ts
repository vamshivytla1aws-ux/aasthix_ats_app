/**
 * Strict JSON schema for OpenAI Responses API structured output (top-10 rerank).
 * Root must be an object with `additionalProperties: false` for strict mode.
 */
export const TOP10_RERANK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ranked_candidates: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidate_id: { type: "string" },
          final_rank: { type: "integer", minimum: 1, maximum: 10 },
          ai_match_score: { type: "integer", minimum: 0, maximum: 100 },
          ai_decision: { type: "string", enum: ["Proceed", "Hold", "Reject"] },
          reasoning: { type: "string", maxLength: 400 },
        },
        required: ["candidate_id", "final_rank", "ai_match_score", "ai_decision", "reasoning"],
      },
    },
  },
  required: ["ranked_candidates"],
} as const;

export type Top10RerankAiRow = {
  candidate_id: string;
  final_rank: number;
  ai_match_score: number;
  ai_decision: "Proceed" | "Hold" | "Reject";
  reasoning: string;
};

export type Top10RerankParsed = {
  ranked_candidates: Top10RerankAiRow[];
};
