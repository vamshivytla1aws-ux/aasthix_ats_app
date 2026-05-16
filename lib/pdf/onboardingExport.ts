import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import { readFile } from "fs/promises";

type DocRow = {
  doc_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  mime?: string | null;
  file_blob?: string | null;
};

type PacketMeta = {
  packetId: number;
  candidateName: string;
  jobTitle: string;
  status: string;
  submittedAt: string | null;
};

type EducationRow = {
  education?: string;
  institute?: string;
  from?: string;
  to?: string;
  specialization?: string;
  percentage?: string;
};

type EmploymentRow = {
  employer?: string;
  empId?: string;
  from?: string;
  to?: string;
  designation?: string;
  salary?: string;
};

type ReferenceRow = {
  nameDesignation?: string;
  emailPhone?: string;
  association?: string;
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN_X = 26;
// Fixed layout rails so every page keeps the same safe drawing area.
const HEADER_HEIGHT = 120;
const FOOTER_HEIGHT = 80;
const HEADER_TOP_PAD = 16;
const HEADER_STRIP_Y = PAGE_H - 116;
const CONTENT_TOP_Y = PAGE_H - 136;
const FOOTER_LINE_Y = 56;
const FOOTER_TEXT_Y = 24;
const CONTENT_BOTTOM_Y = 78;
const HEADER_LOGO_MAX_W = 142;
const HEADER_LOGO_MAX_H = 108;
const HEADER_TEXT_X = MARGIN_X + 146;
const HEADER_RIGHT_X = PAGE_W - 206;
const PASSPORT_SHIFT_UP = 52;

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

function loadDocBytesFromRow(doc: DocRow) {
  if (!doc.file_blob) return null;
  try {
    return Buffer.from(doc.file_blob, "base64");
  } catch {
    return null;
  }
}

function fitImage(img: PDFImage, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
}

function isPng(bytes: Buffer) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Buffer) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Buffer) {
  return bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function extensionOf(name: string) {
  return path.extname(name || "").toLowerCase();
}

async function embedFromBytes(pdf: PDFDocument, bytes: Buffer, nameHint: string, mime?: string | null) {
  const ext = extensionOf(nameHint);
  const mimeLower = String(mime || "").toLowerCase();
  if (isPng(bytes) || ext === ".png" || mimeLower === "image/png") {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  }
  if (isJpeg(bytes) || ext === ".jpg" || ext === ".jpeg" || mimeLower === "image/jpeg" || mimeLower === "image/jpg") {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
  // pdf-lib does not support WEBP directly.
  if (isWebp(bytes) || ext === ".webp" || mimeLower === "image/webp") return null;
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

function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number) {
  const src = text || "-";
  if (font.widthOfTextAtSize(src, size) <= maxWidth) return src;
  const suffix = "...";
  const suffixW = font.widthOfTextAtSize(suffix, size);
  let out = src;
  while (out.length > 1 && font.widthOfTextAtSize(out, size) + suffixW > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${suffix}`;
}

function drawHeader(params: {
  page: any;
  font: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
}) {
  const { page, font, bold, logo } = params;
  const leftX = MARGIN_X + 8;
  const blockTop = PAGE_H - HEADER_TOP_PAD;

  if (logo) {
    const fit = fitImage(logo, HEADER_LOGO_MAX_W, HEADER_LOGO_MAX_H);
    page.drawImage(logo, { x: leftX + 2, y: blockTop - fit.height - 8, width: fit.width, height: fit.height });
  }

  page.drawText("AASTHIX TALENT", {
    x: HEADER_TEXT_X,
    y: blockTop - 33,
    size: 17,
    font: bold,
    color: rgb(0.16, 0.18, 0.22),
  });
  page.drawText("Talent That Drives Success", {
    x: HEADER_TEXT_X,
    y: blockTop - 54,
    size: 10.5,
    font,
    color: rgb(0.28, 0.31, 0.36),
  });

  const line1Y = blockTop - 30;
  const line2Y = blockTop - 48;
  const line3Y = blockTop - 66;
  page.drawText("+91 9573543933", { x: HEADER_RIGHT_X, y: line1Y, size: 11, font, color: rgb(0.16, 0.18, 0.22) });
  page.drawText("contact@aasthix.com", { x: HEADER_RIGHT_X, y: line2Y, size: 11, font, color: rgb(0.16, 0.18, 0.22) });
  page.drawText("www.aasthix.com", { x: HEADER_RIGHT_X, y: line3Y, size: 11, font, color: rgb(0.16, 0.18, 0.22) });

  const iconX = HEADER_RIGHT_X + 136;
  const iconColor = rgb(0.13, 0.71, 0.95);

  // Phone icon
  page.drawRectangle({ x: iconX - 4, y: line1Y + 1, width: 8, height: 6, borderWidth: 1, borderColor: iconColor });
  page.drawRectangle({ x: iconX - 2.2, y: line1Y - 0.5, width: 4.4, height: 1.2, color: iconColor });

  // Mail icon
  page.drawRectangle({ x: iconX - 4.5, y: line2Y + 1, width: 9, height: 6.5, borderWidth: 1, borderColor: iconColor });
  page.drawLine({ start: { x: iconX - 4.5, y: line2Y + 7.5 }, end: { x: iconX, y: line2Y + 4.5 }, thickness: 1, color: iconColor });
  page.drawLine({ start: { x: iconX + 4.5, y: line2Y + 7.5 }, end: { x: iconX, y: line2Y + 4.5 }, thickness: 1, color: iconColor });

  // Globe icon
  page.drawCircle({ x: iconX, y: line3Y + 4, size: 3.8, borderWidth: 1, borderColor: iconColor });
  page.drawLine({ start: { x: iconX - 2.8, y: line3Y + 4 }, end: { x: iconX + 2.8, y: line3Y + 4 }, thickness: 1, color: iconColor });
  page.drawLine({ start: { x: iconX, y: line3Y + 1.2 }, end: { x: iconX, y: line3Y + 6.8 }, thickness: 1, color: iconColor });

  page.drawRectangle({
    x: MARGIN_X - 10,
    y: HEADER_STRIP_Y,
    width: PAGE_W - (MARGIN_X - 10) * 2,
    height: 8,
    color: rgb(0.2, 0.22, 0.29),
  });
  page.drawRectangle({ x: MARGIN_X - 10, y: HEADER_STRIP_Y, width: 430, height: 8, color: rgb(0.13, 0.71, 0.95) });
}

function drawFooter(params: {
  page: any;
  font: PDFFont;
}) {
  const { page, font } = params;
  page.drawRectangle({
    x: MARGIN_X - 10,
    y: FOOTER_LINE_Y,
    width: PAGE_W - (MARGIN_X - 10) * 2,
    height: 4,
    color: rgb(0.2, 0.22, 0.29),
  });
  page.drawRectangle({ x: MARGIN_X - 10, y: FOOTER_LINE_Y, width: 350, height: 4, color: rgb(0.13, 0.71, 0.95) });
  const line1 =
    "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar,";
  const line2 =
    "Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.";
  const footerSize = 8.7;
  const line1X = (PAGE_W - font.widthOfTextAtSize(line1, footerSize)) / 2;
  const line2X = (PAGE_W - font.widthOfTextAtSize(line2, footerSize)) / 2;
  page.drawText(line1, { x: line1X, y: FOOTER_TEXT_Y + 12, size: footerSize, font, color: rgb(0.2, 0.22, 0.27) });
  page.drawText(line2, { x: line2X, y: FOOTER_TEXT_Y + 1, size: footerSize, font, color: rgb(0.2, 0.22, 0.27) });
}

function drawSectionHeader(page: any, text: string, x: number, y: number, width: number, bold: PDFFont) {
  page.drawRectangle({
    x,
    y: y - 18,
    width,
    height: 18,
    color: rgb(0.9, 0.93, 0.98),
    borderWidth: 1,
    borderColor: rgb(0.62, 0.7, 0.92),
  });
  const size = 9.5;
  const tx = x + (width - bold.widthOfTextAtSize(text, size)) / 2;
  page.drawText(text, { x: tx, y: y - 13, size, font: bold, color: rgb(0.08, 0.2, 0.46) });
}

function drawLineField(
  page: any,
  input: {
    label: string;
    value: string;
    x: number;
    y: number;
    width: number;
    labelWidth: number;
    font: PDFFont;
    bold: PDFFont;
  }
) {
  const { label, value, x, y, width, labelWidth, font, bold } = input;
  page.drawText(label, { x, y: y + 3, size: 10, font: bold, color: rgb(0.1, 0.13, 0.2) });
  const lineStart = Math.min(x + width - 26, x + labelWidth);
  const lineEnd = x + width;
  page.drawLine({ start: { x: lineStart, y }, end: { x: lineEnd, y }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
  const maxTextW = Math.max(10, lineEnd - lineStart - 8);
  const text = ellipsize(value || "-", font, 10, maxTextW);
  const textW = font.widthOfTextAtSize(text, 10);
  const centeredX = lineStart + Math.max(3, (lineEnd - lineStart - textW) / 2);
  page.drawText(text, { x: centeredX, y: y + 3, size: 10, font, color: rgb(0.16, 0.2, 0.26) });
}

function newPage(pdf: PDFDocument, font: PDFFont, bold: PDFFont, logo: PDFImage | null) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader({ page, font, bold, logo });
  drawFooter({ page, font });
  return page;
}

type FlowState = {
  page: any;
  y: number;
};

/**
 * Ensures there is enough vertical space for the next block.
 * If not, it creates a new page and redraws header/footer before continuing.
 */
function ensurePageBreak(
  state: FlowState,
  requiredHeight: number,
  context: { pdf: PDFDocument; font: PDFFont; bold: PDFFont; logo: PDFImage | null; resetY?: number }
) {
  const resetY = context.resetY ?? CONTENT_TOP_Y - 6;
  if (state.y - requiredHeight < CONTENT_BOTTOM_Y) {
    state.page = newPage(context.pdf, context.font, context.bold, context.logo);
    state.y = resetY;
  }
}

function drawTableRow(
  page: any,
  cols: number[],
  yTop: number,
  rowHeight: number,
  values: string[],
  options: { font: PDFFont; size: number; bold?: boolean; verticalAlign?: "middle" | "top" }
) {
  const { font, size, bold, verticalAlign = "middle" } = options;
  page.drawRectangle({
    x: cols[0],
    y: yTop - rowHeight,
    width: cols[cols.length - 1] - cols[0],
    height: rowHeight,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  for (let i = 1; i < cols.length - 1; i++) {
    page.drawLine({ start: { x: cols[i], y: yTop - rowHeight }, end: { x: cols[i], y: yTop }, thickness: 1, color: rgb(0, 0, 0) });
  }
  values.forEach((raw, i) => {
    const text = ellipsize(raw || "-", font, size, Math.max(10, cols[i + 1] - cols[i] - 8));
    const y = verticalAlign === "top" ? yTop - size - 4 : yTop - rowHeight / 2 - size / 2 + 1;
    page.drawText(text, {
      x: cols[i] + 4,
      y,
      size,
      font,
      color: bold ? rgb(0.08, 0.11, 0.16) : rgb(0.12, 0.14, 0.18),
    });
  });
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
  const logo = logoBytes ? await embedFromBytes(pdf, logoBytes, "aasthix-brand.png", "image/png") : null;

  const payload = input.payload;
  const educationRows = asRows<EducationRow>(payload.education_rows);
  const prevRows = asRows<EmploymentRow>(payload.previous_employment_rows);
  const refRows = asRows<ReferenceRow>(payload.professional_references);

  const first = newPage(pdf, font, bold, logo);
  const summaryTitle = "Employee Onboarding Summary";
  first.drawText(summaryTitle, {
    x: (PAGE_W - bold.widthOfTextAtSize(summaryTitle, 14)) / 2,
    y: CONTENT_TOP_Y - 16,
    size: 14,
    font: bold,
    color: rgb(0.12, 0.18, 0.28),
  });

  // Two-column summary fields with fixed gutters so lines never overlap.
  drawLineField(first, { label: "Candidate :", value: input.packet.candidateName, x: 40, y: CONTENT_TOP_Y - 56, width: 255, labelWidth: 84, font, bold });
  drawLineField(first, { label: "Job Title :", value: input.packet.jobTitle, x: 300, y: CONTENT_TOP_Y - 56, width: 285, labelWidth: 84, font, bold });
  drawLineField(first, { label: "Status :", value: input.packet.status, x: 40, y: CONTENT_TOP_Y - 86, width: 255, labelWidth: 84, font, bold });
  drawLineField(first, {
    label: "Submitted At :",
    value: formatDate(input.packet.submittedAt),
    x: 300,
    y: CONTENT_TOP_Y - 86,
    width: 285,
    labelWidth: 96,
    font,
    bold,
  });

  const passportBox = { x: PAGE_W - 196, y: CONTENT_TOP_Y - 186 + PASSPORT_SHIFT_UP, w: 118, h: 144 };
  first.drawRectangle({ x: passportBox.x, y: passportBox.y, width: passportBox.w, height: passportBox.h, borderWidth: 2, borderColor: rgb(0.12, 0.12, 0.12) });

  const photoDoc =
    input.docs.find((d) => d.doc_type === "passport_photo") ||
    input.docs.find((d) => String(d.doc_type || "").toLowerCase().includes("passport"));
  if (photoDoc) {
    const blobBytes = loadDocBytesFromRow(photoDoc);
    const photoBytes =
      blobBytes && blobBytes.length > 0
        ? blobBytes
        : await loadFile(path.join(process.cwd(), "public", photoDoc.file_url.replace(/^\//, "")));
    if (photoBytes) {
      const photo = await embedFromBytes(pdf, photoBytes, photoDoc.file_name, photoDoc.mime);
      if (photo) {
        const fit = fitImageCover(photo, passportBox.w - 4, passportBox.h - 4);
        first.drawImage(photo, {
          x: passportBox.x + (passportBox.w - fit.width) / 2,
          y: passportBox.y + (passportBox.h - fit.height) / 2,
          width: fit.width,
          height: fit.height,
        });
      } else {
        first.drawText("Preview unavailable", { x: passportBox.x + 12, y: passportBox.y + 60, size: 9, font, color: rgb(0.34, 0.37, 0.42) });
      }
    }
  }

  // Keep Personal & Employment completely below the photo block so fields never overlap the passport area.
  const pStartY = passportBox.y - 28;
  drawSectionHeader(first, "Personal & Employment", 40, pStartY + 10, 752, bold);
  drawLineField(first, { label: "Full Name", value: asText(payload.full_name), x: 40, y: pStartY - 26, width: 250, labelWidth: 82, font, bold });
  drawLineField(first, { label: "Date of Birth", value: asText(payload.date_of_birth), x: 300, y: pStartY - 26, width: 250, labelWidth: 96, font, bold });
  drawLineField(first, { label: "Gender", value: asText(payload.gender), x: 560, y: pStartY - 26, width: 232, labelWidth: 58, font, bold });
  drawLineField(first, { label: "Contact Number", value: asText(payload.contact_number), x: 40, y: pStartY - 54, width: 250, labelWidth: 104, font, bold });
  drawLineField(first, { label: "Email", value: asText(payload.personal_email), x: 300, y: pStartY - 54, width: 250, labelWidth: 54, font, bold });
  drawLineField(first, { label: "Joining Date", value: asText(payload.joining_date), x: 560, y: pStartY - 54, width: 232, labelWidth: 92, font, bold });
  drawLineField(first, { label: "Employment Type", value: asText(payload.employment_type), x: 40, y: pStartY - 82, width: 250, labelWidth: 116, font, bold });
  drawLineField(first, { label: "Work Mode", value: asText(payload.work_mode), x: 300, y: pStartY - 82, width: 250, labelWidth: 78, font, bold });
  drawLineField(first, { label: "Work Location", value: asText(payload.work_location), x: 560, y: pStartY - 82, width: 232, labelWidth: 92, font, bold });
  drawLineField(first, { label: "Declaration Date", value: asText(payload.declaration_date), x: 40, y: pStartY - 110, width: 250, labelWidth: 118, font, bold });

  // Page 2+: education / employment / references with overflow guards
  const flow: FlowState = { page: newPage(pdf, font, bold, logo), y: CONTENT_TOP_Y - 18 };

  const eduCols = [40, 210, 430, 514, 598, 710, 800];
  const eduHeaderH = 22;
  const eduRowH = 28;
  const educationSectionHeight = 18 + eduHeaderH + Math.max(5, educationRows.length || 5) * eduRowH;
  ensurePageBreak(flow, educationSectionHeight, { pdf, font, bold, logo });
  drawSectionHeader(flow.page, "Education Details", 40, flow.y, 760, bold);
  flow.y -= 24;
  drawTableRow(
    flow.page,
    eduCols,
    flow.y,
    eduHeaderH,
    ["Education", "College/University (with Location)", "From", "To", "Specialization", "Percentage"],
    { font: bold, size: 9, bold: true }
  );
  flow.y -= eduHeaderH;
  const eduData = educationRows.length
    ? educationRows
    : [
        { education: "Matriculation/SSC/Equivalent" },
        { education: "Intermediate/HSC/Equivalent" },
        { education: "Diploma/Equivalent" },
        { education: "Graduation/Equivalent" },
        { education: "Post-Graduation/Equivalent" },
      ];
  for (const row of eduData) {
    ensurePageBreak(flow, eduRowH, { pdf, font, bold, logo });
    if (flow.y === CONTENT_TOP_Y - 6) {
      drawSectionHeader(flow.page, "Education Details (cont.)", 40, flow.y, 760, bold);
      flow.y -= 24;
      drawTableRow(
        flow.page,
        eduCols,
        flow.y,
        eduHeaderH,
        ["Education", "College/University (with Location)", "From", "To", "Specialization", "Percentage"],
        { font: bold, size: 9, bold: true }
      );
      flow.y -= eduHeaderH;
    }
    drawTableRow(
      flow.page,
      eduCols,
      flow.y,
      eduRowH,
      [asText(row.education), asText(row.institute), asText(row.from), asText(row.to), asText(row.specialization), asText(row.percentage)],
      { font, size: 8 }
    );
    flow.y -= eduRowH;
  }

  flow.y -= 16;
  const empCols = [40, 74, 280, 350, 430, 510, 640, 800];
  const empHeaderH = 22;
  const empRowH = 24;
  const empRows = prevRows.length ? prevRows : [{}];
  const empSectionHeight = 18 + empHeaderH + empRows.length * empRowH;
  ensurePageBreak(flow, empSectionHeight, { pdf, font, bold, logo });
  drawSectionHeader(flow.page, "Previous Employment / Jobs", 40, flow.y, 760, bold);
  flow.y -= 24;
  drawTableRow(flow.page, empCols, flow.y, empHeaderH, ["S.No", "Employer", "Emp Id", "From", "To", "Designation", "Last Salary"], {
    font: bold,
    size: 8.5,
    bold: true,
  });
  flow.y -= empHeaderH;
  empRows.forEach((row, index) => {
    ensurePageBreak(flow, empRowH, { pdf, font, bold, logo });
    if (flow.y === CONTENT_TOP_Y - 6) {
      drawSectionHeader(flow.page, "Previous Employment / Jobs (cont.)", 40, flow.y, 760, bold);
      flow.y -= 24;
      drawTableRow(flow.page, empCols, flow.y, empHeaderH, ["S.No", "Employer", "Emp Id", "From", "To", "Designation", "Last Salary"], {
        font: bold,
        size: 8.5,
        bold: true,
      });
      flow.y -= empHeaderH;
    }
    drawTableRow(
      flow.page,
      empCols,
      flow.y,
      empRowH,
      [String(index + 1), asText(row.employer), asText(row.empId), asText(row.from), asText(row.to), asText(row.designation), asText(row.salary)],
      { font, size: 8 }
    );
    flow.y -= empRowH;
  });

  flow.y -= 16;
  const refCols = [40, 240, 426, 612, 800];
  const refHeaderH = 22;
  const refRowH = 24;
  const refFields: Array<{ label: string; key: keyof ReferenceRow }> = [
    { label: "Name / Designation", key: "nameDesignation" },
    { label: "Email id and Mob. No.", key: "emailPhone" },
    { label: "Nature of Association", key: "association" },
  ];
  const refs = [refRows[0] || {}, refRows[1] || {}, refRows[2] || {}];
  const refSectionHeight = 18 + refHeaderH + refFields.length * refRowH;
  ensurePageBreak(flow, refSectionHeight, { pdf, font, bold, logo });
  drawSectionHeader(flow.page, "Professional References", 40, flow.y, 760, bold);
  flow.y -= 24;
  drawTableRow(flow.page, refCols, flow.y, refHeaderH, ["Field", "Reference No 1", "Reference No 2", "Reference No 3"], {
    font: bold,
    size: 8.5,
    bold: true,
  });
  flow.y -= refHeaderH;
  for (const field of refFields) {
    drawTableRow(
      flow.page,
      refCols,
      flow.y,
      refRowH,
      [field.label, asText(refs[0][field.key]), asText(refs[1][field.key]), asText(refs[2][field.key])],
      { font, size: 8 }
    );
    flow.y -= refRowH;
  }

  // Manifest pages with wrapping/pagination
  flow.page = newPage(pdf, font, bold, logo);
  flow.y = CONTENT_TOP_Y - 18;
  drawSectionHeader(flow.page, "Document Manifest", 40, flow.y, 760, bold);
  flow.y -= 24;
  const manCols = [40, 180, 510, 800];
  const manHeaderH = 22;
  const manRowH = 20;
  drawTableRow(flow.page, manCols, flow.y, manHeaderH, ["Document Type", "File Name", "Uploaded At"], { font: bold, size: 8.5, bold: true });
  flow.y -= manHeaderH;
  if (input.docs.length === 0) {
    drawTableRow(flow.page, manCols, flow.y, manRowH, ["-", "No uploaded documents.", "-"], { font, size: 8.5 });
  } else {
    for (const d of input.docs) {
      ensurePageBreak(flow, manRowH, { pdf, font, bold, logo, resetY: CONTENT_TOP_Y - 18 });
      if (flow.y === CONTENT_TOP_Y - 18) {
        drawSectionHeader(flow.page, "Document Manifest (cont.)", 40, flow.y, 760, bold);
        flow.y -= 24;
        drawTableRow(flow.page, manCols, flow.y, manHeaderH, ["Document Type", "File Name", "Uploaded At"], { font: bold, size: 8.5, bold: true });
        flow.y -= manHeaderH;
      }
      drawTableRow(
        flow.page,
        manCols,
        flow.y,
        manRowH,
        [asText(d.doc_type), asText(d.file_name), formatDate(d.uploaded_at)],
        { font, size: 8 }
      );
      flow.y -= manRowH;
    }
  }

  // 4-per-page attachment previews
  const imageDocs = input.docs.filter((d) => {
    const ext = extensionOf(d.file_name);
    const mime = String(d.mime || "").toLowerCase();
    return mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
  });

  const ATTACH_SECTION_TOP = CONTENT_TOP_Y - 8;
  const ATTACH_SECTION_GAP = 34;
  const cells = [
    { x: 40, y: 294, w: 360, h: 165 },
    { x: 430, y: 294, w: 360, h: 165 },
    { x: 40, y: 104, w: 360, h: 165 },
    { x: 430, y: 104, w: 360, h: 165 },
  ];

  function drawAttachmentCard(
    p: any,
    cell: { x: number; y: number; w: number; h: number },
    doc: DocRow,
    img: PDFImage | null
  ) {
    p.drawRectangle({ x: cell.x, y: cell.y, width: cell.w, height: cell.h, borderWidth: 1, borderColor: rgb(0.72, 0.75, 0.8) });
    p.drawText(ellipsize(doc.file_name, bold, 8.5, cell.w - 12), { x: cell.x + 6, y: cell.y + cell.h - 14, size: 8.5, font: bold });
    p.drawText(asText(doc.doc_type), { x: cell.x + 6, y: cell.y + cell.h - 26, size: 7.5, font, color: rgb(0.32, 0.35, 0.42) });
    if (!img) {
      p.drawRectangle({ x: cell.x + 10, y: cell.y + 14, width: cell.w - 20, height: cell.h - 52, borderWidth: 1, borderColor: rgb(0.85, 0.87, 0.91) });
      p.drawText("Preview unavailable", {
        x: cell.x + 18,
        y: cell.y + cell.h / 2,
        size: 9,
        font,
        color: rgb(0.35, 0.38, 0.44),
      });
      return;
    }
    const fit = fitImage(img, cell.w - 20, cell.h - 56);
    p.drawImage(img, {
      x: cell.x + (cell.w - fit.width) / 2,
      y: cell.y + 12 + (cell.h - 56 - fit.height) / 2,
      width: fit.width,
      height: fit.height,
    });
  }

  for (let i = 0; i < imageDocs.length; i += 4) {
    const chunk = imageDocs.slice(i, i + 4);
    const p = newPage(pdf, font, bold, logo);
    drawSectionHeader(p, "Attachment Preview", 40, ATTACH_SECTION_TOP, 760, bold);
    for (let j = 0; j < chunk.length; j++) {
      const doc = chunk[j];
      const cell = { ...cells[j], y: cells[j].y - ATTACH_SECTION_GAP };
      const bytes = await loadFile(path.join(process.cwd(), "public", doc.file_url.replace(/^\//, "")));
      const blobBytes = loadDocBytesFromRow(doc);
      const effectiveBytes = blobBytes && blobBytes.length > 0 ? blobBytes : bytes;
      if (!effectiveBytes) {
        drawAttachmentCard(p, cell, doc, null);
        continue;
      }
      const img = await embedFromBytes(pdf, effectiveBytes, doc.file_name, doc.mime);
      drawAttachmentCard(p, cell, doc, img);
    }
  }

  return Buffer.from(await pdf.save());
}
function fitImageCover(img: PDFImage, boxW: number, boxH: number) {
  const ratio = Math.max(boxW / img.width, boxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
}
