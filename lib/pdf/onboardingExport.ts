import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import { readFile } from "fs/promises";

type DocRow = {
  doc_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  mime?: string | null;
};

type PacketMeta = {
  packetId: number;
  candidateName: string;
  jobTitle: string;
  status: string;
  submittedAt: string | null;
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN_X = 26;
const TOP_HEADER_H = 108;
const FOOTER_Y = 32;

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function asRows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

async function loadFile(filePath: string) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function fitImage(img: PDFImage, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { width: img.width * ratio, height: img.height * ratio };
}

async function tryEmbedImage(pdf: PDFDocument, bytes: Buffer, nameHint: string) {
  const lower = nameHint.toLowerCase();
  if (lower.endsWith(".png")) return pdf.embedPng(bytes);
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) return pdf.embedJpg(bytes);
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawLineField(page: any, label: string, value: string, x: number, y: number, width: number, font: PDFFont, bold: PDFFont) {
  page.drawText(label, { x, y: y + 3, size: 10, font: bold, color: rgb(0.1, 0.13, 0.2) });
  const lineStart = x + 76;
  page.drawLine({ start: { x: lineStart, y }, end: { x: x + width, y }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(value || "-", { x: lineStart + 4, y: y + 3, size: 10, font, color: rgb(0.16, 0.2, 0.26) });
}

function drawHeaderAndFooter(params: {
  page: any;
  font: PDFFont;
  bold: PDFFont;
  logo?: PDFImage | null;
  headerBanner?: PDFImage | null;
}) {
  const { page, font, bold, logo, headerBanner } = params;
  const yTop = PAGE_H - 22;

  if (headerBanner) {
    const fit = fitImage(headerBanner, PAGE_W - MARGIN_X * 2, 74);
    page.drawImage(headerBanner, {
      x: MARGIN_X,
      y: PAGE_H - fit.height - 14,
      width: fit.width,
      height: fit.height,
    });
  } else {
    if (logo) {
      const fitted = fitImage(logo, 58, 58);
      page.drawImage(logo, { x: MARGIN_X + 6, y: yTop - fitted.height - 14, width: fitted.width, height: fitted.height });
    }
    page.drawText("AASTHIX TALENT", { x: MARGIN_X + 80, y: yTop - 16, size: 18, font: bold, color: rgb(0.16, 0.18, 0.22) });
    page.drawText("Talent That Drives Success", { x: MARGIN_X + 80, y: yTop - 42, size: 13, font, color: rgb(0.25, 0.29, 0.36) });
    page.drawText("+91 9573543933", { x: PAGE_W - 220, y: yTop - 16, size: 11, font, color: rgb(0.16, 0.18, 0.22) });
    page.drawText("contact@aasthix.com", { x: PAGE_W - 220, y: yTop - 42, size: 11, font, color: rgb(0.16, 0.18, 0.22) });
    page.drawText("www.aasthix.com", { x: PAGE_W - 220, y: yTop - 68, size: 11, font, color: rgb(0.16, 0.18, 0.22) });
  }

  page.drawRectangle({ x: MARGIN_X - 10, y: PAGE_H - TOP_HEADER_H, width: PAGE_W - (MARGIN_X - 10) * 2, height: 6, color: rgb(0.2, 0.22, 0.29) });
  page.drawRectangle({ x: MARGIN_X - 10, y: PAGE_H - TOP_HEADER_H, width: 430, height: 6, color: rgb(0.13, 0.71, 0.95) });

  page.drawRectangle({ x: MARGIN_X - 10, y: FOOTER_Y + 22, width: PAGE_W - (MARGIN_X - 10) * 2, height: 4, color: rgb(0.2, 0.22, 0.29) });
  page.drawRectangle({ x: MARGIN_X - 10, y: FOOTER_Y + 22, width: 350, height: 4, color: rgb(0.13, 0.71, 0.95) });
  page.drawText(
    "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar, Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.",
    { x: MARGIN_X + 100, y: FOOTER_Y, size: 9, font, color: rgb(0.18, 0.2, 0.24) }
  );
}

export async function buildOnboardingPdf(input: {
  packet: PacketMeta;
  payload: Record<string, unknown>;
  docs: DocRow[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadFile(path.join(process.cwd(), "public", "aasthix-brand.png"));
  const bannerBytes = await loadFile(path.join(process.cwd(), "public", "brand-logo.png"));
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  const headerBanner = bannerBytes ? await tryEmbedImage(pdf, bannerBytes, "brand-logo.png") : null;

  const first = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeaderAndFooter({ page: first, font, bold, logo, headerBanner });

  const payload = input.payload;
  const summaryTitle = "Employee Onboarding Summary";
  const titleWidth = bold.widthOfTextAtSize(summaryTitle, 14);
  first.drawText(summaryTitle, { x: (PAGE_W - titleWidth) / 2, y: PAGE_H - 132, size: 14, font: bold, color: rgb(0.12, 0.18, 0.28) });

  drawLineField(first, "Candidate :", input.packet.candidateName, 40, PAGE_H - 168, 250, font, bold);
  drawLineField(first, "Job Title :", input.packet.jobTitle, 300, PAGE_H - 168, 250, font, bold);
  drawLineField(first, "Status :", input.packet.status, 40, PAGE_H - 188, 250, font, bold);
  drawLineField(first, "Submitted At :", formatDate(input.packet.submittedAt), 300, PAGE_H - 188, 250, font, bold);

  const passportBox = { x: PAGE_W - 196, y: PAGE_H - 248, w: 110, h: 128 };
  first.drawRectangle({ x: passportBox.x, y: passportBox.y, width: passportBox.w, height: passportBox.h, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.1) });
  first.drawText("Passport Size Photo", { x: passportBox.x + 12, y: passportBox.y + passportBox.h - 16, size: 9, font: bold, color: rgb(0.18, 0.2, 0.24) });

  const photoDoc = input.docs.find((d) => d.doc_type === "passport_photo");
  if (photoDoc) {
    const photoBytes = await loadFile(path.join(process.cwd(), "public", photoDoc.file_url.replace(/^\//, "")));
    if (photoBytes) {
      const img = await tryEmbedImage(pdf, photoBytes, photoDoc.file_name);
      if (img) {
        const fit = fitImage(img, passportBox.w - 12, passportBox.h - 26);
        first.drawImage(img, { x: passportBox.x + (passportBox.w - fit.width) / 2, y: passportBox.y + 6, width: fit.width, height: fit.height });
      }
    }
  } else {
    first.drawText("No photo", { x: passportBox.x + 30, y: passportBox.y + 52, size: 10, font, color: rgb(0.35, 0.38, 0.44) });
  }

  const pStartY = PAGE_H - 236;
  first.drawText("Personal & Employment", { x: 40, y: pStartY, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
  drawLineField(first, "Full Name", asText(payload.full_name), 40, pStartY - 26, 250, font, bold);
  drawLineField(first, "Date of Birth", asText(payload.date_of_birth), 300, pStartY - 26, 250, font, bold);
  drawLineField(first, "Gender", asText(payload.gender), 560, pStartY - 26, 230, font, bold);
  drawLineField(first, "Contact Number", asText(payload.contact_number), 40, pStartY - 54, 250, font, bold);
  drawLineField(first, "Email", asText(payload.personal_email), 300, pStartY - 54, 250, font, bold);
  drawLineField(first, "Joining Date", asText(payload.joining_date), 560, pStartY - 54, 230, font, bold);
  drawLineField(first, "Employment Type", asText(payload.employment_type), 40, pStartY - 82, 250, font, bold);
  drawLineField(first, "Work Mode", asText(payload.work_mode), 300, pStartY - 82, 250, font, bold);
  drawLineField(first, "Work Location", asText(payload.work_location), 560, pStartY - 82, 230, font, bold);
  drawLineField(first, "Declaration Date", asText(payload.declaration_date), 40, pStartY - 110, 250, font, bold);

  const educationRows = asRows<{ education?: string; institute?: string; from?: string; to?: string; specialization?: string; percentage?: string }>(
    payload.education_rows
  );
  const prevRows = asRows<{ employer?: string; empId?: string; from?: string; to?: string; designation?: string; salary?: string }>(
    payload.previous_employment_rows
  );
  const refRows = asRows<{ nameDesignation?: string; emailPhone?: string; association?: string }>(payload.professional_references);

  const p2 = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeaderAndFooter({ page: p2, font, bold, logo, headerBanner });
  let y = PAGE_H - 114;
  p2.drawText("Education Details", { x: 40, y, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
  y -= 16;
  const eduCols = [40, 200, 420, 500, 580, 710, 800];
  p2.drawRectangle({ x: eduCols[0], y: y - 18, width: eduCols[6] - eduCols[0], height: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  ["Education", "College/University (with Location)", "From", "To", "Specialization", "Percentage"].forEach((h, i) => {
    p2.drawText(h, { x: eduCols[i] + 4, y: y - 12, size: 8, font: bold });
    if (i > 0) p2.drawLine({ start: { x: eduCols[i], y: y - 18 }, end: { x: eduCols[i], y }, thickness: 1, color: rgb(0, 0, 0) });
  });
  y -= 18;
  for (const row of educationRows.slice(0, 8)) {
    p2.drawRectangle({ x: eduCols[0], y: y - 18, width: eduCols[6] - eduCols[0], height: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    const vals = [asText(row.education), asText(row.institute), asText(row.from), asText(row.to), asText(row.specialization), asText(row.percentage)];
    vals.forEach((v, i) => {
      p2.drawText((v || "-").slice(0, 34), { x: eduCols[i] + 4, y: y - 12, size: 8, font });
      if (i > 0) p2.drawLine({ start: { x: eduCols[i], y: y - 18 }, end: { x: eduCols[i], y }, thickness: 1, color: rgb(0, 0, 0) });
    });
    y -= 18;
  }

  y -= 14;
  p2.drawText("Previous Employment / Jobs", { x: 40, y, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
  y -= 16;
  const empCols = [40, 74, 260, 330, 406, 484, 600, 740, 800];
  p2.drawRectangle({ x: empCols[0], y: y - 18, width: empCols[8] - empCols[0], height: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  ["SNo", "Employer", "Emp Id", "From", "To", "Designation", "Last Salary"].forEach((h, i) => {
    p2.drawText(h, { x: empCols[i] + 3, y: y - 12, size: 8, font: bold });
    if (i > 0) p2.drawLine({ start: { x: empCols[i], y: y - 18 }, end: { x: empCols[i], y }, thickness: 1, color: rgb(0, 0, 0) });
  });
  y -= 18;
  prevRows.slice(0, 8).forEach((r, idx) => {
    p2.drawRectangle({ x: empCols[0], y: y - 18, width: empCols[8] - empCols[0], height: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    const vals = [String(idx + 1), asText(r.employer), asText(r.empId), asText(r.from), asText(r.to), asText(r.designation), asText(r.salary)];
    vals.forEach((v, i) => {
      p2.drawText((v || "-").slice(0, 28), { x: empCols[i] + 3, y: y - 12, size: 8, font });
      if (i > 0) p2.drawLine({ start: { x: empCols[i], y: y - 18 }, end: { x: empCols[i], y }, thickness: 1, color: rgb(0, 0, 0) });
    });
    y -= 18;
  });

  y -= 14;
  p2.drawText("Professional References", { x: 40, y, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
  y -= 16;
  const refCols = [40, 240, 426, 612, 800];
  const refRowsDef = [
    { label: "Name / Designation", key: "nameDesignation" as const },
    { label: "Email id and Mob. No.", key: "emailPhone" as const },
    { label: "Nature of Association", key: "association" as const },
  ];
  p2.drawRectangle({ x: refCols[0], y: y - 18, width: refCols[4] - refCols[0], height: 18, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  p2.drawText("Field", { x: refCols[0] + 4, y: y - 12, size: 8, font: bold });
  p2.drawText("Reference No 1", { x: refCols[1] + 4, y: y - 12, size: 8, font: bold });
  p2.drawText("Reference No 2", { x: refCols[2] + 4, y: y - 12, size: 8, font: bold });
  p2.drawText("Reference No 3", { x: refCols[3] + 4, y: y - 12, size: 8, font: bold });
  [refCols[1], refCols[2], refCols[3]].forEach((x) => p2.drawLine({ start: { x, y: y - 18 }, end: { x, y }, thickness: 1, color: rgb(0, 0, 0) }));
  y -= 18;
  for (const rr of refRowsDef) {
    p2.drawRectangle({ x: refCols[0], y: y - 20, width: refCols[4] - refCols[0], height: 20, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    p2.drawText(rr.label, { x: refCols[0] + 4, y: y - 13, size: 8, font: bold });
    for (let i = 0; i < 3; i++) {
      const ref = refRows[i] || {};
      p2.drawText(asText(ref[rr.key]).slice(0, 30) || "-", { x: refCols[i + 1] + 4, y: y - 13, size: 8, font });
    }
    [refCols[1], refCols[2], refCols[3]].forEach((x) => p2.drawLine({ start: { x, y: y - 20 }, end: { x, y }, thickness: 1, color: rgb(0, 0, 0) }));
    y -= 20;
  }

  const p3 = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeaderAndFooter({ page: p3, font, bold, logo, headerBanner });
  let my = PAGE_H - 114;
  p3.drawText("Document Manifest", { x: 40, y: my, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
  my -= 16;
  if (input.docs.length === 0) {
    p3.drawText("No uploaded documents.", { x: 40, y: my, size: 10, font });
  } else {
    for (const d of input.docs) {
      p3.drawText(`${d.doc_type} | ${d.file_name} | ${formatDate(d.uploaded_at)}`, { x: 40, y: my, size: 8, font });
      my -= 10;
      if (my < 84) break;
    }
  }

  const imageDocs = input.docs.filter((d) => {
    const n = d.file_name.toLowerCase();
    return n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp");
  });
  for (let i = 0; i < imageDocs.length; i += 4) {
    const chunk = imageDocs.slice(i, i + 4);
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    drawHeaderAndFooter({ page: p, font, bold, logo, headerBanner });
    p.drawText("Attachment Preview", { x: 40, y: PAGE_H - 114, size: 12, font: bold, color: rgb(0.12, 0.18, 0.28) });
    const cells = [
      { x: 40, y: 300, w: 360, h: 185 },
      { x: 430, y: 300, w: 360, h: 185 },
      { x: 40, y: 92, w: 360, h: 185 },
      { x: 430, y: 92, w: 360, h: 185 },
    ];
    for (let j = 0; j < chunk.length; j++) {
      const doc = chunk[j];
      const cell = cells[j];
      p.drawRectangle({ x: cell.x, y: cell.y, width: cell.w, height: cell.h, borderWidth: 1, borderColor: rgb(0.7, 0.74, 0.8) });
      p.drawText(doc.file_name.slice(0, 56), { x: cell.x + 6, y: cell.y + cell.h - 14, size: 8, font: bold });
      const bytes = await loadFile(path.join(process.cwd(), "public", doc.file_url.replace(/^\//, "")));
      if (!bytes) continue;
      const img = await tryEmbedImage(pdf, bytes, doc.file_name);
      if (!img) continue;
      const fit = fitImage(img, cell.w - 12, cell.h - 28);
      p.drawImage(img, { x: cell.x + (cell.w - fit.width) / 2, y: cell.y + (cell.h - 20 - fit.height) / 2, width: fit.width, height: fit.height });
    }
  }

  return Buffer.from(await pdf.save());
}
