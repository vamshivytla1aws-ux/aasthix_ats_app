import { fetchOpenAiChatCompletions } from "@/lib/openaiChat";

const SYSTEM_PROMPT = `You are an enterprise recruiting copilot embedded in an ATS. You receive structured context about a job, candidate, or application (only what the user is allowed to see).

Rules:
- Answer using the provided context. If something is missing, say so—do not invent candidate details, scores, or pipeline facts.
- Be concise and professional. Use markdown when it helps (headings, bullets).
- For compliance: avoid discriminatory language; focus on skills, scope, and qualifications. When reviewing JD wording, flag potentially biased or exclusionary phrases and suggest inclusive alternatives.
- When asked to draft emails, produce ready-to-send text; use the candidate's name from context when present.
- Never output secrets or internal system identifiers beyond what appears in context.`;

function openAiChatUrl(): string {
  const raw = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const base = raw.endsWith("/v1") ? raw : `${raw}/v1`;
  return `${base}/chat/completions`;
}

export type ContextualHistoryTurn = { role: "user" | "assistant"; content: string };

export async function runContextualCopilotChat(input: {
  contextBlock: string;
  userMessage: string;
  history: ContextualHistoryTurn[];
}): Promise<{ text: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "OPENAI_API_KEY is not configured." };
  }

  const model = process.env.CONTEXTUAL_AI_MODEL?.trim() || "gpt-4o";
  const maxTokens = Math.min(
    8192,
    Math.max(256, Number(process.env.CONTEXTUAL_AI_MAX_OUTPUT_TOKENS ?? 2048) || 2048)
  );
  const timeoutMs = Math.min(
    180_000,
    Math.max(15_000, Number(process.env.CONTEXTUAL_AI_TIMEOUT_MS ?? 120_000) || 120_000)
  );

  const hist = input.history
    .slice(-8)
    .map((h) => ({
      role: h.role,
      content: h.content.slice(0, 6000),
    }));

  const userContent = [
    "## ATS context (authoritative for this thread)\n",
    input.contextBlock,
    "\n\n## Recruiter request\n",
    input.userMessage.trim(),
  ].join("");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...hist.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];

  const body = {
    model,
    temperature: Number(process.env.CONTEXTUAL_AI_TEMPERATURE ?? 0.35) || 0.35,
    max_tokens: maxTokens,
    messages,
  };

  try {
    const useCustomBase = Boolean(process.env.OPENAI_BASE_URL?.trim());
    let res: Response;
    if (useCustomBase) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        res = await fetch(openAiChatUrl(), {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    } else {
      res = await fetchOpenAiChatCompletions(body, timeoutMs);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("contextualAi chat", res.status, errText);
      return { error: "The AI service returned an error. Try again or shorten your request." };
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") {
      return { error: "Empty response from the model." };
    }
    return { text: text.trim() };
  } catch (e) {
    console.error("contextualAi chat", e);
    return { error: "Request failed or timed out. Try again." };
  }
}
