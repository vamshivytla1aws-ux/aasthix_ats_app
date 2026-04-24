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

function buildFallbackDraft(input: InterviewInviteDraftInput) {
  const candidateName = clean(input.candidateName) || "Candidate";
  const jobTitle = clean(input.jobTitle) || "the role";
  const company = clean(input.company);
  const companyLine = company ? ` with ${company}` : "";
  const meetingMode = clean(input.meetingMode) || (input.meetLink ? "Google Meet" : "Interview");
  const meetingLocation = clean(input.meetingLocation);
  const recruiterName = clean(input.recruiterName) || "Aasthix Talent";
  const notes = clean(input.notes);

  const subjectPrefix = input.isReschedule ? "Updated Interview Schedule" : "Interview Invitation";
  const subject = `${subjectPrefix} - ${jobTitle}`;

  const paragraphs = normalizeParagraphs([
    input.isReschedule
      ? `Your interview for ${jobTitle}${companyLine} has been rescheduled.`
      : `Thank you for your interest in ${jobTitle}${companyLine}. We would like to invite you to the next interview round.`,
    `Interview details: ${input.interviewDateTimeLabel}${input.timezoneLabel ? ` (${input.timezoneLabel})` : ""}.`,
    input.meetLink
      ? `Meeting mode: ${meetingMode}. Please use the following link to join: ${input.meetLink}`
      : meetingLocation
        ? `Meeting mode: ${meetingMode}. Location / access details: ${meetingLocation}`
        : `Meeting mode: ${meetingMode}.`,
    input.panelEmails?.length ? `Panel members: ${input.panelEmails.join(", ")}.` : "",
    notes ? `Additional notes: ${notes}` : "",
    `Please confirm your availability and let us know if you need any changes.`,
    `We look forward to speaking with you, ${candidateName}.`,
  ]);

  return {
    source: "fallback" as const,
    subject,
    body: paragraphs.join("\n\n"),
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
    `Company: ${clean(input.company) || ""}`,
    `Job location: ${clean(input.jobLocation) || ""}`,
    `Interview datetime: ${input.interviewDateTimeLabel}`,
    `Timezone: ${clean(input.timezoneLabel) || ""}`,
    `Meeting mode: ${clean(input.meetingMode) || (input.meetLink ? "Google Meet" : "")}`,
    `Meeting details: ${clean(input.meetingLocation) || ""}`,
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
    "Act as a senior technical recruiter writing a professional interview invitation email.",
    "Use the JD context to make the message feel tailored to the role, but do not invent facts.",
    "Write a concise, polished subject and body in plain text.",
    "Include the interview date/time, meeting mode, and the join/location details if available.",
    "If panel members exist, acknowledge that the panel will be part of the interview, but do not dump raw CC formatting into the body.",
    "If this is a reschedule, make that clear.",
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
              "You help recruiters draft interview invitation emails. Output valid JSON only. Never invent compensation, office addresses, or interviewers not present in the context.",
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
    const subject = clean(parsed.subject).slice(0, 500);
    const body = clean(parsed.body).slice(0, 100_000);
    if (!subject || !body) return fallback;

    return { source: "ai", subject, body };
  } catch (error) {
    console.error("draftInterviewInviteWithAi", error);
    return fallback;
  }
}
