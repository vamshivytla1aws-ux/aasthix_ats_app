import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import path from "path";
import { readFile } from "fs/promises";

export type PayslipPdfPayload = {
  companyName: string;
  monthLabel: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  pan: string;
  uanNumber: string;
  pfNumber: string;
  bankAccountNumber: string;
  workLocation: string;
  paidDays: number;
  lopDays: number;
  earnings: Array<{ name: string; annual: number; monthly: number; amountForMonth: number }>;
  deductions: Array<{ name: string; annual: number; monthly: number; amountForMonth: number }>;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  netSalaryInWords: string;
};

const PAGE_W = 842;
const PAGE_H = 595;
const PAGE_MARGIN_X = 32;
const HEADER_TOP = PAGE_H - 18;
const HEADER_HEIGHT = 112;
const FOOTER_HEIGHT = 70;
const CONTENT_TOP = PAGE_H - HEADER_HEIGHT - 18;
const CONTENT_BOTTOM = FOOTER_HEIGHT + 16;
const ROW_H = 22;
const CYAN = rgb(0.13, 0.71, 0.95);
const NAVY = rgb(0.2, 0.22, 0.29);
const TITLE = rgb(0.15, 0.2, 0.29);
const BORDER = rgb(0.8, 0.84, 0.9);

type Flow = { page: any; cursorY: number };

function inr(v: number) {
  return Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  const candidates = [
    path.join(process.cwd(), "public", "aasthix-brand.png"),
    path.join(process.cwd(), "public", "logo.png"),
  ];
  for (const file of candidates) {
    try {
      const bytes = await readFile(file);
      if (file.endsWith(".png")) return await pdf.embedPng(bytes);
      return await pdf.embedJpg(bytes);
    } catch {
      continue;
    }
  }
  return null;
}

function fitContain(img: PDFImage, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
}

function drawHeader(page: any, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  const logoX = PAGE_MARGIN_X + 10;
  const logoY = PAGE_H - 93;
  const logoW = 82;
  const logoH = 74;
  if (logo) {
    const fit = fitContain(logo, logoW, logoH);
    page.drawImage(logo, { x: logoX + (logoW - fit.width) / 2, y: logoY + (logoH - fit.height) / 2, width: fit.width, height: fit.height });
  }
  const brandX = logoX + logoW + 12;
  page.drawText("AASTHIX TALENT", { x: brandX, y: PAGE_H - 50, size: 18, font: bold, color: rgb(0.2, 0.21, 0.23) });
  page.drawText("Talent That Drives Success", { x: brandX, y: PAGE_H - 68, size: 12, font, color: rgb(0.27, 0.31, 0.36) });

  const cx = PAGE_W - 210;
  page.drawText("+91 9573543933", { x: cx, y: PAGE_H - 50, size: 10, font, color: TITLE });
  page.drawText("contact@aasthix.com", { x: cx, y: PAGE_H - 68, size: 10, font, color: TITLE });
  page.drawText("www.aasthix.com", { x: cx, y: PAGE_H - 86, size: 10, font, color: TITLE });

  const dividerY = PAGE_H - 102;
  const splitX = PAGE_MARGIN_X + (PAGE_W - PAGE_MARGIN_X * 2) * 0.46;
  page.drawRectangle({ x: PAGE_MARGIN_X, y: dividerY, width: splitX - PAGE_MARGIN_X, height: 7, color: CYAN });
  page.drawRectangle({ x: splitX, y: dividerY, width: PAGE_W - PAGE_MARGIN_X - splitX, height: 7, color: NAVY });
}

function drawFooter(page: any, font: PDFFont) {
  const dividerY = FOOTER_HEIGHT - 12;
  const splitX = PAGE_MARGIN_X + (PAGE_W - PAGE_MARGIN_X * 2) * 0.42;
  page.drawRectangle({ x: PAGE_MARGIN_X, y: dividerY, width: splitX - PAGE_MARGIN_X, height: 7, color: CYAN });
  page.drawRectangle({ x: splitX, y: dividerY, width: PAGE_W - PAGE_MARGIN_X - splitX, height: 7, color: NAVY });
  const t1 = "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar,";
  const t2 = "Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.";
  const w1 = font.widthOfTextAtSize(t1, 9);
  const w2 = font.widthOfTextAtSize(t2, 9);
  page.drawText(t1, { x: (PAGE_W - w1) / 2, y: 26, size: 9, font, color: TITLE });
  page.drawText(t2, { x: (PAGE_W - w2) / 2, y: 14, size: 9, font, color: TITLE });
}

function ensureSpace(pdf: PDFDocument, flow: Flow, requiredHeight: number, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  if (flow.cursorY - requiredHeight >= CONTENT_BOTTOM) return flow;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, bold, font, logo);
  drawFooter(page, font);
  return { page, cursorY: CONTENT_TOP };
}

function drawEmployeeInfo(page: any, bold: PDFFont, font: PDFFont, y: number, payload: PayslipPdfPayload) {
  page.drawText("Salary Payslip", { x: PAGE_MARGIN_X, y, size: 16, font: bold, color: TITLE });
  page.drawText(`Month: ${payload.monthLabel}`, { x: PAGE_W - 220, y, size: 11, font: bold, color: TITLE });
  const rows = [
    ["Employee Name", payload.employeeName],
    ["Employee Code", payload.employeeCode],
    ["Department", payload.department],
    ["Designation", payload.designation],
    ["Date of Joining", payload.dateOfJoining],
    ["PAN", payload.pan],
    ["UAN Number", payload.uanNumber],
    ["PF Number", payload.pfNumber],
    ["Bank Account Number", payload.bankAccountNumber],
    ["Work Location", payload.workLocation],
    ["Total Paid Days", String(payload.paidDays)],
    ["LOP Days", String(payload.lopDays)],
  ];

  let cy = y - 26;
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    page.drawText(`${left[0]}:`, { x: PAGE_MARGIN_X, y: cy, size: 10, font: bold, color: TITLE });
    page.drawText(left[1] || "-", { x: PAGE_MARGIN_X + 120, y: cy, size: 10, font, color: TITLE });
    if (right) {
      page.drawText(`${right[0]}:`, { x: PAGE_MARGIN_X + 380, y: cy, size: 10, font: bold, color: TITLE });
      page.drawText(right[1] || "-", { x: PAGE_MARGIN_X + 500, y: cy, size: 10, font, color: TITLE });
    }
    cy -= 18;
  }
  return cy - 4;
}

function drawTableTitle(page: any, bold: PDFFont, title: string, y: number) {
  page.drawRectangle({ x: PAGE_MARGIN_X, y: y - 16, width: PAGE_W - PAGE_MARGIN_X * 2, height: 20, color: rgb(0.91, 0.95, 1) });
  page.drawRectangle({ x: PAGE_MARGIN_X, y: y - 16, width: PAGE_W - PAGE_MARGIN_X * 2, height: 20, borderWidth: 1, borderColor: rgb(0.58, 0.71, 0.92) });
  page.drawText(title, { x: PAGE_MARGIN_X + 8, y: y - 11, size: 11, font: bold, color: rgb(0.1, 0.28, 0.6) });
}

function drawEarningsDeductionsTable(
  page: any,
  bold: PDFFont,
  font: PDFFont,
  y: number,
  title: string,
  rows: Array<{ name: string; annual: number; monthly: number; amountForMonth: number }>
) {
  drawTableTitle(page, bold, title, y);
  const tableY = y - 20;
  const colX = [PAGE_MARGIN_X, PAGE_MARGIN_X + 360, PAGE_MARGIN_X + 505, PAGE_MARGIN_X + 650];
  const headers = ["Particulars", "Annual", "Monthly", "Amount For Month"];
  page.drawRectangle({ x: PAGE_MARGIN_X, y: tableY - ROW_H, width: PAGE_W - PAGE_MARGIN_X * 2, height: ROW_H, color: rgb(0.96, 0.97, 0.99) });
  headers.forEach((h, idx) => page.drawText(h, { x: colX[idx] + 6, y: tableY - 15, size: 9, font: bold, color: TITLE }));
  let cy = tableY - ROW_H;
  for (const row of rows) {
    page.drawRectangle({ x: PAGE_MARGIN_X, y: cy - ROW_H, width: PAGE_W - PAGE_MARGIN_X * 2, height: ROW_H, borderWidth: 1, borderColor: BORDER });
    page.drawText(row.name, { x: colX[0] + 6, y: cy - 15, size: 9, font, color: TITLE });
    page.drawText(inr(row.annual), { x: colX[1] + 6, y: cy - 15, size: 9, font, color: TITLE });
    page.drawText(inr(row.monthly), { x: colX[2] + 6, y: cy - 15, size: 9, font, color: TITLE });
    page.drawText(inr(row.amountForMonth), { x: colX[3] + 6, y: cy - 15, size: 9, font, color: TITLE });
    cy -= ROW_H;
  }
  return cy - 10;
}

function drawNetSalarySummary(page: any, bold: PDFFont, font: PDFFont, y: number, payload: PayslipPdfPayload) {
  page.drawRectangle({ x: PAGE_MARGIN_X, y: y - 74, width: PAGE_W - PAGE_MARGIN_X * 2, height: 74, borderWidth: 1, borderColor: BORDER });
  page.drawText(`Gross Salary: ${inr(payload.grossSalary)}`, { x: PAGE_MARGIN_X + 10, y: y - 20, size: 10, font: bold, color: TITLE });
  page.drawText(`Total Deductions: ${inr(payload.totalDeductions)}`, { x: PAGE_MARGIN_X + 280, y: y - 20, size: 10, font: bold, color: TITLE });
  page.drawText(`Net Salary: ${inr(payload.netSalary)}`, { x: PAGE_MARGIN_X + 560, y: y - 20, size: 10, font: bold, color: TITLE });
  page.drawText(`Net Salary in Words: ${payload.netSalaryInWords}`, { x: PAGE_MARGIN_X + 10, y: y - 40, size: 9, font, color: TITLE });

  page.drawText("Employee Signature", { x: PAGE_MARGIN_X + 30, y: y - 62, size: 9, font, color: TITLE });
  page.drawText("Employer Signature", { x: PAGE_W - 200, y: y - 62, size: 9, font, color: TITLE });
}

export async function buildPayslipPdf(payload: PayslipPdfPayload) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, bold, font, logo);
  drawFooter(page, font);
  let flow: Flow = { page, cursorY: CONTENT_TOP };

  flow = ensureSpace(pdf, flow, 240, bold, font, logo);
  flow.cursorY = drawEmployeeInfo(flow.page, bold, font, flow.cursorY, payload);

  const earningsHeight = 40 + (payload.earnings.length + 1) * ROW_H;
  flow = ensureSpace(pdf, flow, earningsHeight + 20, bold, font, logo);
  flow.cursorY = drawEarningsDeductionsTable(flow.page, bold, font, flow.cursorY, "Earnings", payload.earnings);

  const deductionsHeight = 40 + (payload.deductions.length + 1) * ROW_H;
  flow = ensureSpace(pdf, flow, deductionsHeight + 20, bold, font, logo);
  flow.cursorY = drawEarningsDeductionsTable(flow.page, bold, font, flow.cursorY, "Deductions", payload.deductions);

  flow = ensureSpace(pdf, flow, 84, bold, font, logo);
  drawNetSalarySummary(flow.page, bold, font, flow.cursorY, payload);

  return Buffer.from(await pdf.save());
}

