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

// Shared layout constants for every page render.
const PAGE_MARGIN_X = 32;
const HEADER_TOP = PAGE_H - 16;
const LOGO_X = 58;
const LOGO_Y = PAGE_H - 106;
const LOGO_WIDTH = 110;
const LOGO_HEIGHT = 110;
const BRAND_TEXT_X = LOGO_X + 84;
const BRAND_TITLE_Y = PAGE_H - 54;
const BRAND_SUBTITLE_Y = PAGE_H - 70;
const CONTACT_X = PAGE_W - 198;
const DIVIDER_Y = PAGE_H - 112;
const HEADER_HEIGHT = 120;
const FOOTER_HEIGHT = 80;
const CONTENT_TOP = DIVIDER_Y - 35;
const CONTENT_BOTTOM = FOOTER_HEIGHT + 10;
const FOOTER_DIVIDER_Y = 56;

const CYAN = rgb(0.13, 0.71, 0.95);
const NAVY = rgb(0.2, 0.22, 0.29);
const TITLE = rgb(0.12, 0.18, 0.28);
const BODY = rgb(0.16, 0.2, 0.26);

type FlowState = {
  page: any;
  cursorY: number;
};

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function firstValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asText(payload[key]);
    if (value) return value;
  }
  return "";
}

async function loadFileBytes(filePath: string) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function blobBytes(doc: DocRow) {
  if (!doc.file_blob) return null;
  try {
    return Buffer.from(doc.file_blob, "base64");
  } catch {
    return null;
  }
}

function fitContain(img: PDFImage, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
}

function fitCover(img: PDFImage, boxW: number, boxH: number) {
  const ratio = Math.max(boxW / img.width, boxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
}

function isPng(bytes: Buffer) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Buffer) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function ext(name: string) {
  return path.extname(name || "").toLowerCase();
}

async function embedImage(pdf: PDFDocument, bytes: Buffer, nameHint: string, mime?: string | null) {
  const extension = ext(nameHint);
  const m = String(mime || "").toLowerCase();
  if (isPng(bytes) || extension === ".png" || m === "image/png") {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  }
  if (isJpeg(bytes) || extension === ".jpg" || extension === ".jpeg" || m === "image/jpeg" || m === "image/jpg") {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
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
  const source = text || "-";
  if (font.widthOfTextAtSize(source, size) <= maxWidth) return source;
  const suffix = "...";
  const suffixW = font.widthOfTextAtSize(suffix, size);
  let out = source;
  while (out.length > 1 && font.widthOfTextAtSize(out, size) + suffixW > maxWidth) out = out.slice(0, -1);
  return `${out}${suffix}`;
}

function drawPhoneIcon(page: any, x: number, y: number) {
  page.drawRectangle({ x: x + 1.4, y: y + 0.8, width: 4.2, height: 7, borderWidth: 1, borderColor: CYAN });
  page.drawRectangle({ x: x + 2.2, y: y + 6.8, width: 2.6, height: 0.9, color: CYAN });
  page.drawRectangle({ x: x + 2.2, y: y + 0.9, width: 2.6, height: 0.9, color: CYAN });
}

function drawMailIcon(page: any, x: number, y: number) {
  page.drawRectangle({ x, y, width: 7, height: 5, borderWidth: 1, borderColor: CYAN });
  page.drawLine({ start: { x, y: y + 5 }, end: { x: x + 3.5, y: y + 2.5 }, thickness: 1, color: CYAN });
  page.drawLine({ start: { x: x + 7, y: y + 5 }, end: { x: x + 3.5, y: y + 2.5 }, thickness: 1, color: CYAN });
}

function drawWebIcon(page: any, x: number, y: number) {
  page.drawCircle({ x: x + 3.5, y: y + 3.5, size: 3.4, borderWidth: 1, borderColor: CYAN });
  page.drawLine({ start: { x: x + 0.7, y: y + 3.5 }, end: { x: x + 6.3, y: y + 3.5 }, thickness: 1, color: CYAN });
  page.drawLine({ start: { x: x + 3.5, y: y + 0.7 }, end: { x: x + 3.5, y: y + 6.3 }, thickness: 1, color: CYAN });
}

function drawHeader(page: any, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  if (logo) {
    const fit = fitContain(logo, LOGO_WIDTH, LOGO_HEIGHT);
    page.drawImage(logo, {
      x: LOGO_X + (LOGO_WIDTH - fit.width) / 2,
      y: LOGO_Y + (LOGO_HEIGHT - fit.height) / 2,
      width: fit.width,
      height: fit.height,
    });
  }

  page.drawText("AASTHIX TALENT", { x: BRAND_TEXT_X, y: BRAND_TITLE_Y, size: 20, font: bold, color: rgb(0.2, 0.21, 0.23) });
  page.drawText("Talent That Drives Success", { x: BRAND_TEXT_X, y: BRAND_SUBTITLE_Y, size: 12, font, color: rgb(0.27, 0.31, 0.36) });

  const l1 = HEADER_TOP - 30;
  const l2 = HEADER_TOP - 48;
  const l3 = HEADER_TOP - 66;
  const contact1 = "+91 9573543933";
  const contact2 = "contact@aasthix.com";
  const contact3 = "www.aasthix.com";
  page.drawText(contact1, { x: CONTACT_X, y: l1, size: 11, font, color: rgb(0.2, 0.21, 0.23) });
  page.drawText(contact2, { x: CONTACT_X, y: l2, size: 11, font, color: rgb(0.2, 0.21, 0.23) });
  page.drawText(contact3, { x: CONTACT_X, y: l3, size: 11, font, color: rgb(0.2, 0.21, 0.23) });
  drawPhoneIcon(page, CONTACT_X + font.widthOfTextAtSize(contact1, 11) + 2, l1 + 2);
  drawMailIcon(page, CONTACT_X + font.widthOfTextAtSize(contact2, 11) + 2, l2 + 3);
  drawWebIcon(page, CONTACT_X + font.widthOfTextAtSize(contact3, 11) + 2, l3 + 2);

  page.drawRectangle({ x: PAGE_MARGIN_X - 16, y: DIVIDER_Y, width: PAGE_W - (PAGE_MARGIN_X - 16) * 2, height: 8, color: NAVY });
  page.drawRectangle({ x: PAGE_MARGIN_X - 16, y: DIVIDER_Y, width: 430, height: 8, color: CYAN });
}

function drawFooter(page: any, font: PDFFont) {
  page.drawRectangle({ x: PAGE_MARGIN_X - 16, y: FOOTER_DIVIDER_Y, width: PAGE_W - (PAGE_MARGIN_X - 16) * 2, height: 4, color: NAVY });
  page.drawRectangle({ x: PAGE_MARGIN_X - 16, y: FOOTER_DIVIDER_Y, width: 350, height: 4, color: CYAN });
  const line1 = "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar,";
  const line2 = "Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.";
  const s = 8.7;
  page.drawText(line1, { x: (PAGE_W - font.widthOfTextAtSize(line1, s)) / 2, y: 36, size: s, font, color: rgb(0.2, 0.22, 0.27) });
  page.drawText(line2, { x: (PAGE_W - font.widthOfTextAtSize(line2, s)) / 2, y: 24, size: s, font, color: rgb(0.2, 0.22, 0.27) });
}

function newPage(pdf: PDFDocument, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, bold, font, logo);
  drawFooter(page, font);
  return page;
}

/**
 * Ensures vertical room before drawing a block. If there is not enough room,
 * a new page is created and the fixed header/footer are redrawn.
 */
function ensureSpace(state: FlowState, requiredHeight: number, pdf: PDFDocument, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  if (state.cursorY - requiredHeight < CONTENT_BOTTOM) {
    state.page = newPage(pdf, bold, font, logo);
    state.cursorY = CONTENT_TOP;
  }
}

function drawSectionHeader(page: any, x: number, y: number, width: number, title: string, bold: PDFFont) {
  page.drawRectangle({ x, y: y - 18, width, height: 18, color: rgb(0.9, 0.93, 0.98), borderWidth: 1, borderColor: rgb(0.62, 0.7, 0.92) });
  const s = 9.5;
  page.drawText(title, { x: x + (width - bold.widthOfTextAtSize(title, s)) / 2, y: y - 13, size: s, font: bold, color: rgb(0.08, 0.2, 0.46) });
}

function drawFieldRow(
  page: any,
  font: PDFFont,
  bold: PDFFont,
  opts: { label: string; value: string; x: number; y: number; width: number; labelWidth: number }
) {
  const { label, value, x, y, width, labelWidth } = opts;
  page.drawText(label, { x, y: y + 3, size: 10, font: bold, color: rgb(0.1, 0.13, 0.2) });
  const lineStart = Math.min(x + width - 20, x + labelWidth);
  const lineEnd = x + width;
  page.drawLine({ start: { x: lineStart, y }, end: { x: lineEnd, y }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
  const text = ellipsize(value || "-", font, 10, Math.max(10, lineEnd - lineStart - 8));
  const w = font.widthOfTextAtSize(text, 10);
  page.drawText(text, { x: lineStart + Math.max(2, (lineEnd - lineStart - w) / 2), y: y + 3, size: 10, font, color: BODY });
}

function drawTableRow(page: any, cols: number[], yTop: number, rowH: number, values: string[], font: PDFFont, size = 8, isHeader = false) {
  page.drawRectangle({ x: cols[0], y: yTop - rowH, width: cols[cols.length - 1] - cols[0], height: rowH, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  for (let i = 1; i < cols.length - 1; i++) {
    page.drawLine({ start: { x: cols[i], y: yTop - rowH }, end: { x: cols[i], y: yTop }, thickness: 1, color: rgb(0, 0, 0) });
  }
  values.forEach((v, i) => {
    page.drawText(ellipsize(v || "-", font, size, Math.max(10, cols[i + 1] - cols[i] - 8)), {
      x: cols[i] + 4,
      y: yTop - rowH / 2 - size / 2 + 1,
      size,
      font,
      color: isHeader ? rgb(0.08, 0.11, 0.16) : rgb(0.12, 0.14, 0.18),
    });
  });
}

async function drawAttachmentCard(
  page: any,
  pdf: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  card: { x: number; y: number; w: number; h: number },
  doc: DocRow
) {
  page.drawRectangle({ x: card.x, y: card.y, width: card.w, height: card.h, borderWidth: 1, borderColor: rgb(0.72, 0.75, 0.8) });
  page.drawText(ellipsize(doc.file_name, bold, 8.5, card.w - 12), { x: card.x + 6, y: card.y + card.h - 14, size: 8.5, font: bold });
  page.drawText(asText(doc.doc_type), { x: card.x + 6, y: card.y + card.h - 26, size: 7.5, font, color: rgb(0.32, 0.35, 0.42) });

  const bytes = blobBytes(doc) || (await loadFileBytes(path.join(process.cwd(), "public", doc.file_url.replace(/^\//, ""))));
  if (!bytes) {
    page.drawText("Preview unavailable", { x: card.x + 12, y: card.y + card.h / 2, size: 9, font, color: rgb(0.35, 0.38, 0.44) });
    return;
  }

  const image = await embedImage(pdf, bytes, doc.file_name, doc.mime);
  if (!image) {
    page.drawText("Preview unavailable", { x: card.x + 12, y: card.y + card.h / 2, size: 9, font, color: rgb(0.35, 0.38, 0.44) });
    return;
  }
  const mediaW = card.w - 20;
  const mediaH = card.h - 48;
  const fit = fitContain(image, mediaW, mediaH);
  page.drawImage(image, {
    x: card.x + (card.w - fit.width) / 2,
    y: card.y + 10 + (mediaH - fit.height) / 2,
    width: fit.width,
    height: fit.height,
  });
}

export async function buildOnboardingPdf(input: { packet: PacketMeta; payload: Record<string, unknown>; docs: DocRow[] }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadFileBytes(path.join(process.cwd(), "public", "aasthix-brand.png"));
  const logo = logoBytes ? await embedImage(pdf, logoBytes, "aasthix-brand.png", "image/png") : null;

  const payload = input.payload || {};
  const educationRows = asRows<EducationRow>(payload.education_rows);
  const prevRows = asRows<EmploymentRow>(payload.previous_employment_rows);
  const refRows = asRows<ReferenceRow>(payload.professional_references);

  const page1 = newPage(pdf, bold, font, logo);
  page1.drawText("Employee Onboarding Summary", {
    x: (PAGE_W - bold.widthOfTextAtSize("Employee Onboarding Summary", 14)) / 2,
    y: CONTENT_TOP - 16,
    size: 14,
    font: bold,
    color: TITLE,
  });

  drawFieldRow(page1, font, bold, { label: "Candidate :", value: input.packet.candidateName, x: 40, y: CONTENT_TOP - 56, width: 255, labelWidth: 84 });
  drawFieldRow(page1, font, bold, { label: "Job Title :", value: input.packet.jobTitle, x: 300, y: CONTENT_TOP - 56, width: 285, labelWidth: 84 });
  drawFieldRow(page1, font, bold, { label: "Status :", value: input.packet.status, x: 40, y: CONTENT_TOP - 86, width: 255, labelWidth: 84 });
  drawFieldRow(page1, font, bold, { label: "Submitted At :", value: safeDate(input.packet.submittedAt), x: 300, y: CONTENT_TOP - 86, width: 285, labelWidth: 96 });

  const photoBox = { x: PAGE_W - 198, y: CONTENT_TOP - 184, w: 134, h: 164 };
  page1.drawRectangle({ x: photoBox.x, y: photoBox.y, width: photoBox.w, height: photoBox.h, borderWidth: 2, borderColor: rgb(0.12, 0.12, 0.12) });
  const photoDoc = input.docs.find((d) => d.doc_type === "passport_photo") || input.docs.find((d) => String(d.doc_type || "").toLowerCase().includes("passport"));
  if (photoDoc) {
    const bytes = blobBytes(photoDoc) || (await loadFileBytes(path.join(process.cwd(), "public", photoDoc.file_url.replace(/^\//, ""))));
    if (bytes) {
      const pic = await embedImage(pdf, bytes, photoDoc.file_name, photoDoc.mime);
      if (pic) {
        const fit = fitCover(pic, photoBox.w - 4, photoBox.h - 4);
        page1.drawImage(pic, {
          x: photoBox.x + (photoBox.w - fit.width) / 2,
          y: photoBox.y + (photoBox.h - fit.height) / 2,
          width: fit.width,
          height: fit.height,
        });
      } else {
        page1.drawText("Passport Size Photo", { x: photoBox.x + 13, y: photoBox.y + photoBox.h / 2, size: 9, font, color: rgb(0.34, 0.37, 0.42) });
      }
    }
  } else {
    page1.drawText("Passport Size Photo", { x: photoBox.x + 13, y: photoBox.y + photoBox.h / 2, size: 9, font, color: rgb(0.34, 0.37, 0.42) });
  }

  const summaryFieldsBottomY = CONTENT_TOP - 86;
  const profilePhotoBottomY = photoBox.y;
  const personalStartY = Math.min(summaryFieldsBottomY, profilePhotoBottomY) - 30;
  drawSectionHeader(page1, 40, personalStartY + 10, 752, "Personal & Employment", bold);

  const positionDesignation = firstValue(payload, ["designation", "position", "jobTitle"]);
  const department = firstValue(payload, ["department", "dept"]);
  const reportingManager = firstValue(payload, ["reporting_manager", "reportingManager", "manager"]);
  const workLocation = firstValue(payload, ["work_location", "workLocation", "location"]);
  const uan = firstValue(payload, ["uan", "UAN"]) || "-";

  drawFieldRow(page1, font, bold, { label: "Full Name", value: firstValue(payload, ["full_name"]), x: 40, y: personalStartY - 26, width: 250, labelWidth: 84 });
  drawFieldRow(page1, font, bold, { label: "Date of Birth", value: firstValue(payload, ["date_of_birth"]), x: 300, y: personalStartY - 26, width: 250, labelWidth: 98 });
  drawFieldRow(page1, font, bold, { label: "Gender", value: firstValue(payload, ["gender"]), x: 560, y: personalStartY - 26, width: 232, labelWidth: 58 });
  drawFieldRow(page1, font, bold, { label: "Contact Number", value: firstValue(payload, ["contact_number"]), x: 40, y: personalStartY - 54, width: 250, labelWidth: 106 });
  drawFieldRow(page1, font, bold, { label: "Email", value: firstValue(payload, ["personal_email"]), x: 300, y: personalStartY - 54, width: 250, labelWidth: 56 });
  drawFieldRow(page1, font, bold, { label: "Joining Date", value: firstValue(payload, ["joining_date"]), x: 560, y: personalStartY - 54, width: 232, labelWidth: 94 });
  drawFieldRow(page1, font, bold, { label: "Employment Type", value: firstValue(payload, ["employment_type"]), x: 40, y: personalStartY - 82, width: 250, labelWidth: 118 });
  drawFieldRow(page1, font, bold, { label: "Work Mode", value: firstValue(payload, ["work_mode"]), x: 300, y: personalStartY - 82, width: 250, labelWidth: 80 });
  drawFieldRow(page1, font, bold, { label: "Work Location", value: workLocation, x: 560, y: personalStartY - 82, width: 232, labelWidth: 96 });
  drawFieldRow(page1, font, bold, { label: "Position / Designation", value: positionDesignation, x: 40, y: personalStartY - 110, width: 250, labelWidth: 145 });
  drawFieldRow(page1, font, bold, { label: "Department", value: department, x: 300, y: personalStartY - 110, width: 250, labelWidth: 90 });
  drawFieldRow(page1, font, bold, { label: "Reporting Manager", value: reportingManager, x: 560, y: personalStartY - 110, width: 232, labelWidth: 120 });
  drawFieldRow(page1, font, bold, { label: "UAN", value: uan, x: 40, y: personalStartY - 138, width: 250, labelWidth: 58 });
  drawFieldRow(page1, font, bold, { label: "Declaration Date", value: firstValue(payload, ["declaration_date"]), x: 300, y: personalStartY - 138, width: 250, labelWidth: 118 });

  const flow: FlowState = { page: newPage(pdf, bold, font, logo), cursorY: CONTENT_TOP };

  const eduCols = [40, 210, 430, 514, 598, 710, 800];
  const eduHeaderH = 22;
  const eduRowH = 28;
  const eduData = educationRows.length
    ? educationRows
    : [
        { education: "Matriculation/SSC/Equivalent" },
        { education: "Intermediate/HSC/Equivalent" },
        { education: "Diploma/Equivalent" },
        { education: "Graduation/Equivalent" },
        { education: "Post-Graduation/Equivalent" },
      ];
  ensureSpace(flow, 18 + eduHeaderH + eduData.length * eduRowH + 10, pdf, bold, font, logo);
  drawSectionHeader(flow.page, 40, flow.cursorY, 760, "Education Details", bold);
  flow.cursorY -= 24;
  drawTableRow(flow.page, eduCols, flow.cursorY, eduHeaderH, ["Education", "College/University (with Location)", "From", "To", "Specialization", "Percentage"], bold, 9, true);
  flow.cursorY -= eduHeaderH;
  for (const row of eduData) {
    ensureSpace(flow, eduRowH, pdf, bold, font, logo);
    drawTableRow(flow.page, eduCols, flow.cursorY, eduRowH, [asText(row.education), asText(row.institute), asText(row.from), asText(row.to), asText(row.specialization), asText(row.percentage)], font, 8);
    flow.cursorY -= eduRowH;
  }

  flow.cursorY -= 16;
  const empCols = [40, 74, 280, 350, 430, 510, 640, 800];
  const empHeaderH = 22;
  const empRowH = 24;
  const empRows = prevRows.length ? prevRows : [{}];
  ensureSpace(flow, 18 + empHeaderH + empRows.length * empRowH + 10, pdf, bold, font, logo);
  drawSectionHeader(flow.page, 40, flow.cursorY, 760, "Previous Employment / Jobs", bold);
  flow.cursorY -= 24;
  drawTableRow(flow.page, empCols, flow.cursorY, empHeaderH, ["S.No", "Employer", "Emp Id", "From", "To", "Designation", "Last Salary"], bold, 8.5, true);
  flow.cursorY -= empHeaderH;
  empRows.forEach((row, i) => {
    ensureSpace(flow, empRowH, pdf, bold, font, logo);
    drawTableRow(flow.page, empCols, flow.cursorY, empRowH, [String(i + 1), asText(row.employer), asText(row.empId), asText(row.from), asText(row.to), asText(row.designation), asText(row.salary)], font, 8);
    flow.cursorY -= empRowH;
  });

  flow.cursorY -= 16;
  const refCols = [40, 240, 426, 612, 800];
  const refHeaderH = 22;
  const refRowH = 24;
  ensureSpace(flow, 18 + refHeaderH + 3 * refRowH + 10, pdf, bold, font, logo);
  drawSectionHeader(flow.page, 40, flow.cursorY, 760, "Professional References", bold);
  flow.cursorY -= 24;
  drawTableRow(flow.page, refCols, flow.cursorY, refHeaderH, ["Field", "Reference No 1", "Reference No 2", "Reference No 3"], bold, 8.5, true);
  flow.cursorY -= refHeaderH;
  const refs = [refRows[0] || {}, refRows[1] || {}, refRows[2] || {}];
  drawTableRow(flow.page, refCols, flow.cursorY, refRowH, ["Name / Designation", asText(refs[0].nameDesignation), asText(refs[1].nameDesignation), asText(refs[2].nameDesignation)], font, 8);
  flow.cursorY -= refRowH;
  drawTableRow(flow.page, refCols, flow.cursorY, refRowH, ["Email id and Mob. No.", asText(refs[0].emailPhone), asText(refs[1].emailPhone), asText(refs[2].emailPhone)], font, 8);
  flow.cursorY -= refRowH;
  drawTableRow(flow.page, refCols, flow.cursorY, refRowH, ["Nature of Association", asText(refs[0].association), asText(refs[1].association), asText(refs[2].association)], font, 8);
  flow.cursorY -= refRowH;

  flow.page = newPage(pdf, bold, font, logo);
  flow.cursorY = CONTENT_TOP;
  drawSectionHeader(flow.page, 40, flow.cursorY, 760, "Document Manifest", bold);
  flow.cursorY -= 24;
  const manCols = [40, 180, 510, 800];
  const manHeaderH = 22;
  const manRowH = 20;
  drawTableRow(flow.page, manCols, flow.cursorY, manHeaderH, ["Document Type", "File Name", "Uploaded At"], bold, 8.5, true);
  flow.cursorY -= manHeaderH;

  const docs = input.docs.length ? input.docs : [{ doc_type: "-", file_name: "No uploaded documents.", file_url: "", uploaded_at: "", mime: null, file_blob: null }];
  for (const doc of docs) {
    ensureSpace(flow, manRowH + 2, pdf, bold, font, logo);
    drawTableRow(flow.page, manCols, flow.cursorY, manRowH, [asText(doc.doc_type), asText(doc.file_name), safeDate(doc.uploaded_at)], font, 8);
    flow.cursorY -= manRowH;
  }

  const imageDocs = input.docs.filter((d) => {
    const e = ext(d.file_name);
    const m = String(d.mime || "").toLowerCase();
    return m.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(e);
  });

  if (imageDocs.length > 0) {
    const cardW = 360;
    const cardH = 165;
    const gapX = 26;
    const gapY = 24;
    let index = 0;
    while (index < imageDocs.length) {
      flow.page = newPage(pdf, bold, font, logo);
      flow.cursorY = CONTENT_TOP;
      drawSectionHeader(flow.page, 40, flow.cursorY, 760, "Attachment Preview", bold);
      flow.cursorY -= 30;

      const cardsPerRow = 2;
      const rowHeight = cardH + gapY;
      while (index < imageDocs.length) {
        ensureSpace(flow, rowHeight, pdf, bold, font, logo);
        const rowY = flow.cursorY - cardH;
        for (let col = 0; col < cardsPerRow && index < imageDocs.length; col++) {
          const x = 40 + col * (cardW + gapX);
          await drawAttachmentCard(flow.page, pdf, font, bold, { x, y: rowY, w: cardW, h: cardH }, imageDocs[index]);
          index += 1;
        }
        flow.cursorY = rowY - gapY;
        if (flow.cursorY - rowHeight < CONTENT_BOTTOM) break;
      }
    }
  }

  return Buffer.from(await pdf.save());
}
