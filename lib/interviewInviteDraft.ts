type InterviewInviteDraftInput = {
  candidateName?: string | null;
  candidateEmail?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  jobLocation?: string | null;
  jdExcerpt?: string | null;
  interviewDateTimeLabel: string;
  timezoneLabel?: string | null;
  meetingMode?: string | null;
  meetingLocation?: string | null;
  meetLink?: string | null;
  panelEmails?: string[];
  durationLabel?: string | null;
  recruiterName?: string | null;
  notes?: string | null;
  isReschedule?: boolean;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeParagraphs(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function stripCompanyMentions(text: string, company?: string | null) {
  const value = String(text || "");
  const c = clean(company);
  if (!c) return value;
  const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\s+at\\s+${escaped}\\b`, "gi"),
    new RegExp(`\\s*\\(${escaped}\\)`, "gi"),
    new RegExp(`\\b${escaped}\\b`, "gi"),
  ];
  let next = value;
  for (const pattern of patterns) {
    next = next.replace(pattern, "");
  }
  return next.replace(/\s{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

function sanitizeDraftBody(body: string) {
  const lines = String(body || "").split(/\r?\n/);
  const blocked = /^(best regards|regards|thanks|thank you|sincerely|warm regards|kind regards)\b/i;
  const placeholder = /\[(your\s*name|name)\]/i;
  const greeting = /^(hi|hello|dear)\b/i;
  const out: string[] = [];
  let greetingSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (greeting.test(trimmed)) {
      if (greetingSeen) continue;
      greetingSeen = true;
    }
    if (blocked.test(trimmed)) continue;
    if (placeholder.test(trimmed)) continue;
    if (/^aasthix talent$/i.test(trimmed)) continue;
    if (/recruitment team$/i.test(trimmed)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildFallbackDraft(input: InterviewInviteDraftInput) {
  const candidateName = clean(input.candidateName) || "Candidate";
  const jobTitle = clean(input.jobTitle) || "the role";
  const meetingMode = clean(input.meetingMode) || (input.meetLink ? "Google Meet" : "Interview");
  const meetingLocation = clean(input.meetingLocation);
  const notes = clean(input.notes);
  const durationLabel = clean(input.durationLabel);

  const subject = input.isReschedule
    ? `Updated interview schedule for ${jobTitle}`
    : `Interview invitation for ${jobTitle}`;

  const paragraphs = normalizeParagraphs([
    `Hi ${candidateName},`,
    input.isReschedule
      ? `Your interview for the ${jobTitle} role has been rescheduled.`
      : `You have been shortlisted for the ${jobTitle} role.`,
    `Your interview is scheduled on ${input.interviewDateTimeLabel}${input.timezoneLabel ? ` (${input.timezoneLabel})` : ""}.`,
    durationLabel ? `Duration: ${durationLabel}.` : "",
    input.meetLink
      ? `Please join through Google Meet using this link: ${input.meetLink}`
      : meetingLocation
        ? `Interview mode: ${meetingMode}. Details: ${meetingLocation}`
        : `Interview mode: ${meetingMode}.`,
    "Please join a few minutes before the scheduled time.",
    notes ? `Additional details: ${notes}` : "",
    "Please let me know if you have any questions.",
  ]);

  const fallbackBody = sanitizeDraftBody(paragraphs.join("\n\n"));
  return {
    source: "fallback" as const,
    subject: stripCompanyMentions(subject, input.company),
    body: stripCompanyMentions(fallbackBody, input.company),
  };
}

export async function draftInterviewInviteWithAi(
  input: InterviewInviteDraftInput
): Promise<{ source: "ai" | "fallback"; subject: string; body: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const fallback = buildFallbackDraft(input);
  if (!apiKey) return fallback;

  const model = process.env.EMAIL_DRAFT_MODEL?.trim() || "gpt-4o-mini";
  const context = [
    `Candidate: ${clean(input.candidateName) || "Unknown"}`,
    `Candidate email: ${clean(input.candidateEmail) || "(not on file)"}`,
    `Job title: ${clean(input.jobTitle) || ""}`,
    `Job location: ${clean(input.jobLocation) || ""}`,
    `Interview datetime: ${input.interviewDateTimeLabel}`,
    `Timezone: ${clean(input.timezoneLabel) || ""}`,
    `Meeting mode: ${clean(input.meetingMode) || (input.meetLink ? "Google Meet" : "")}`,
    `Meeting details: ${clean(input.meetingLocation) || ""}`,
    `Duration: ${clean(input.durationLabel) || ""}`,
    `Google Meet link: ${clean(input.meetLink) || ""}`,
    `Panel emails: ${(input.panelEmails ?? []).join(", ") || ""}`,
    `Recruiter: ${clean(input.recruiterName) || "Aasthix Talent"}`,
    `Reschedule: ${input.isReschedule ? "yes" : "no"}`,
    `Recruiter notes: ${clean(input.notes) || ""}`,
    "",
    "Job description excerpt:",
    clean(input.jdExcerpt) || "(none)",
  ].join("\n");

  const userPrompt = [
    "You are writing an interview invitation email for an ATS platform.",
    "Write the email like a real recruiter would write it. The tone should be polite, simple, professional, and natural. It should not sound overly formal, robotic, promotional, or AI-generated.",
    "Use plain text only.",
    "Do not use Markdown.",
    "Do not use asterisks.",
    "Do not use bold text.",
    "Do not use bullet points.",
    "Do not use emojis.",
    "Do not use HTML.",
    'Do not add unnecessary greetings like "I hope this email finds you well."',
    'Do not use generic AI-style phrases such as "we are delighted", "exciting opportunity", "seamless experience", or "kindly be informed."',
    "Keep the email short and realistic.",
    "Write only the subject and email body.",
    "The body should invite the candidate to join the interview through Google Meet when a Meet link is available, mention the date and time clearly, and ask them to join a few minutes before the scheduled time.",
    "Do not mention the company name anywhere in subject or body.",
    "Do not add sign-off lines like Best regards / Thanks / recruiter name.",
    "If this is a reschedule, make that clear naturally.",
    "Use the JD context to make the message feel tailored to the role, but do not invent facts.",
    'Return JSON only with keys "subject" and "body".',
    "",
    context,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You help recruiters draft plain-text interview invitation emails. Output valid JSON only. Never invent compensation, office addresses, interviewers, durations, or logistics not present in the context.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("draftInterviewInviteWithAi", res.status, detail);
      return fallback;
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return fallback;

    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const subject = stripCompanyMentions(clean(parsed.subject).slice(0, 500), input.company);
    const body = sanitizeDraftBody(stripCompanyMentions(clean(parsed.body).slice(0, 100_000), input.company));
    if (!subject || !body) return fallback;

    return { source: "ai", subject, body };
  } catch (error) {
    console.error("draftInterviewInviteWithAi", error);
    return fallback;
  }
}
