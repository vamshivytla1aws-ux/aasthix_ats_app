export type EmailDraftIntent = "offer_letter" | "next_steps" | "rejection" | "general";

const INTENT_GUIDANCE: Record<EmailDraftIntent, string> = {
  offer_letter:
    "Draft an email regarding a job offer / next steps toward an offer. Be warm and professional. Do NOT invent salary, start date, benefits, or legal terms—use placeholders like [Compensation], [Start date] if specifics are not in the context.",
  next_steps:
    "Draft an email explaining next steps in the process (e.g. interviews, feedback timeline). Be clear and concise.",
  rejection:
    "Draft a short, respectful rejection email. Thank them for their time. Do not promise future opportunities unless generic.",
  general:
    "Draft a short professional email appropriate to the pipeline stage and context below.",
};

export async function draftApplicationEmailWithAi(input: {
  intent: EmailDraftIntent;
  customPrompt?: string;
  contextBlock: string;
}): Promise<{ subject: string; body: string } | { error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "OPENAI_API_KEY is not configured." };
  }

  const model = process.env.EMAIL_DRAFT_MODEL?.trim() || "gpt-4o-mini";
  const guidance = INTENT_GUIDANCE[input.intent] ?? INTENT_GUIDANCE.general;
  const extra = input.customPrompt?.trim() ? `\nAdditional instructions from recruiter:\n${input.customPrompt.trim().slice(0, 2000)}` : "";

  const userContent = [
    "## ATS context\n",
    input.contextBlock,
    "\n\n## Task\n",
    guidance,
    extra,
    '\n\nReturn a JSON object ONLY with keys "subject" and "body". Body should be plain text, suitable for email (greeting, paragraphs, sign-off). Use candidate name from context when available.',
  ].join("");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You help recruiters draft emails. Output valid JSON only. Never invent compensation, dates, or legal commitments. Keep tone inclusive and professional.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("draftWithAi", res.status, t);
      return { error: "The AI service returned an error. Try again." };
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return { error: "Empty AI response." };
    }

    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!subject || !body) {
      return { error: "Could not parse subject/body from AI response." };
    }
    return { subject: subject.slice(0, 500), body: body.slice(0, 100_000) };
  } catch (e) {
    console.error("draftWithAi", e);
    return { error: "Failed to generate draft." };
  }
}
