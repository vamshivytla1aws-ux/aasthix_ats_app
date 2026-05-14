type CandidateEmailTemplateOpts = {
  candidateName?: string | null;
  paragraphs?: string[];
  job?: {
    title?: string | null;
    company?: string | null;
    location?: string | null;
    employmentType?: string | null;
    openPositions?: string | number | null;
    description?: string | null;
  };
  cta?: {
    label: string;
    url: string;
  } | null;
};

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeParagraphs(paragraphs: string[] | undefined) {
  return (paragraphs ?? []).map((line) => String(line || "").trim()).filter(Boolean);
}

function startsWithGreeting(line: string) {
  return /^(hi|hello|dear)\b/i.test(String(line || "").trim());
}

export function buildCandidateEmailTemplate(opts: CandidateEmailTemplateOpts) {
  const greetingName = String(opts.candidateName || "Candidate").trim() || "Candidate";
  const paragraphs = normalizeParagraphs(opts.paragraphs);
  const hasInlineGreeting = paragraphs.length > 0 && startsWithGreeting(paragraphs[0]);
  const job = opts.job ?? {};
  const title = String(job.title || "").trim();
  const company = String(job.company || "").trim();
  const location = String(job.location || "").trim();
  const employmentType = String(job.employmentType || "").trim();
  const openPositions =
    job.openPositions === null || job.openPositions === undefined ? "" : String(job.openPositions).trim();
  const description = String(job.description || "").trim();
  const hasJobCard = [title, company, location, employmentType, openPositions, description].some(Boolean);
  const cta = opts.cta && opts.cta.label && opts.cta.url ? opts.cta : null;

  const htmlParagraphs = paragraphs
    .map((line) => `<p style="margin:0 0 12px;font-size:14px;">${escapeHtml(line).replaceAll("\n", "<br/>")}</p>`)
    .join("\n");

  const htmlJobCard = hasJobCard
    ? `
          <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px;">
            ${title ? `<div style="font-size:14px;font-weight:700;margin-bottom:8px;">${escapeHtml(title)}</div>` : ""}
            ${company ? `<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Company:</strong> ${escapeHtml(company)}</div>` : ""}
            ${location ? `<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Location:</strong> ${escapeHtml(location)}</div>` : ""}
            ${employmentType ? `<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Employment Type:</strong> ${escapeHtml(employmentType)}</div>` : ""}
            ${openPositions ? `<div style="font-size:13px;color:#334155;margin-bottom:10px;"><strong>Open Positions:</strong> ${escapeHtml(openPositions)}</div>` : ""}
            ${description ? `<div style="font-size:13px;color:#0F172A;line-height:1.5;white-space:pre-wrap;">${escapeHtml(description)}</div>` : ""}
          </div>`
    : "";

  const htmlCta = cta
    ? `
          <p style="margin:16px 0 18px;">
            <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">
              ${escapeHtml(cta.label)}
            </a>
          </p>
          <p style="margin:0 0 12px;color:#475569;font-size:13px;">
            If the button does not open, copy this URL in your browser:<br/>
            <span style="word-break:break-all;">${escapeHtml(cta.url)}</span>
          </p>`
    : "";

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F8FAFC;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 22px;background:#0F172A;">
          <div style="font-family:Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:700;">Aasthix Talent</div>
        </div>
        <div style="padding:20px 22px;font-family:Arial,sans-serif;color:#0F172A;">
          ${hasInlineGreeting ? "" : `<p style="margin:0 0 10px;font-size:14px;">Hi ${escapeHtml(greetingName)},</p>`}
          ${htmlParagraphs}
          ${htmlCta}
          ${htmlJobCard}
          <p style="margin:16px 0 0;font-size:14px;">Thanks,</p>
          <p style="margin:2px 0 0;font-size:14px;">Aasthix Talent.</p>
          <p style="margin:2px 0 0;font-size:14px;">www.aasthix.com</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const textParts = [
    ...(hasInlineGreeting ? [] : [`Hi ${greetingName},`, ""]),
    ...paragraphs,
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    ...(hasJobCard
      ? [
          "",
          ...(title ? [`Job Title: ${title}`] : []),
          ...(company ? [`Company: ${company}`] : []),
          ...(location ? [`Location: ${location}`] : []),
          ...(employmentType ? [`Employment Type: ${employmentType}`] : []),
          ...(openPositions ? [`Open Positions: ${openPositions}`] : []),
          ...(description ? ["", "Description:", description] : []),
        ]
      : []),
    "",
    "Thanks,",
    "Aasthix Talent.",
    "www.aasthix.com",
  ];

  return {
    html,
    text: textParts.join("\n"),
  };
}
