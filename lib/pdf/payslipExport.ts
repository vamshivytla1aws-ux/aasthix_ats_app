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
  page.drawText(`Payslip For : ${payload.monthLabel}`, { x: PAGE_W - 220, y: y + 6, size: 11, font, color: TITLE });
  page.drawText("Amount in INR", { x: PAGE_W - 190, y: y - 14, size: 10, font, color: TITLE });

  const boxY = y - 180;
  const boxH = 170;
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: boxY,
    width: PAGE_W - PAGE_MARGIN_X * 2,
    height: boxH,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.2, 0.2),
  });
  page.drawRectangle({
    x: PAGE_MARGIN_X,
    y: boxY + boxH - 24,
    width: PAGE_W - PAGE_MARGIN_X * 2,
    height: 24,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.2, 0.2),
  });
  const heading = "Personal details";
  const headingW = bold.widthOfTextAtSize(heading, 12);
  page.drawText(heading, { x: PAGE_MARGIN_X + (PAGE_W - PAGE_MARGIN_X * 2 - headingW) / 2, y: boxY + boxH - 17, size: 12, font: bold, color: TITLE });

  const leftX = PAGE_MARGIN_X + 10;
  const leftValX = PAGE_MARGIN_X + 130;
  const rightX = PAGE_MARGIN_X + 410;
  const rightValX = PAGE_MARGIN_X + 520;
  const rowsLeft = [
    ["Employee Name", payload.employeeName],
    ["Designation", payload.designation],
    ["DOJ", payload.dateOfJoining],
    ["UAN", payload.uanNumber],
    ["PF No.", payload.pfNumber],
    ["Bank Name", payload.companyName || "AASTHIX TALENT"],
    ["Account Number", payload.bankAccountNumber],
  ];
  const rowsRight = [
    ["CS ID", payload.employeeCode],
    ["PAN", payload.pan],
    ["Department", payload.department],
    ["Location", payload.workLocation],
    ["Pay Days", String(payload.paidDays)],
    ["LOP Days", String(payload.lopDays)],
    ["IFSC Code", "-"],
  ];
  let cy = boxY + boxH - 44;
  for (let i = 0; i < rowsLeft.length; i += 1) {
    page.drawText(rowsLeft[i][0], { x: leftX, y: cy, size: 9, font, color: TITLE });
    page.drawText(rowsLeft[i][1] || "-", { x: leftValX, y: cy, size: 9, font: bold, color: TITLE });
    page.drawText(rowsRight[i][0], { x: rightX, y: cy, size: 9, font, color: TITLE });
    page.drawText(rowsRight[i][1] || "-", { x: rightValX, y: cy, size: 9, font: bold, color: TITLE });
    cy -= 20;
  }
  return boxY - 14;
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
  payload: PayslipPdfPayload
) {
  drawTableTitle(page, bold, `Payslip of ${payload.monthLabel}`, y);
  const tableY = y - 20;
  const x = PAGE_MARGIN_X;
  const w = PAGE_W - PAGE_MARGIN_X * 2;
  const colX = [x, x + 135, x + 220, x + 300, x + 380, x + 510, x + 595, x + 675];
  const headers = ["EARNINGS", "RATE", "MONTHLY", "ARREARS", "YTD", "DEDUCTIONS", "MONTHLY", "YTD"];
  page.drawRectangle({ x, y: tableY - ROW_H, width: w, height: ROW_H, color: rgb(0.96, 0.97, 0.99), borderWidth: 1, borderColor: BORDER });
  headers.forEach((h, i) => page.drawText(h, { x: colX[i] + 4, y: tableY - 15, size: 9, font: bold, color: TITLE }));

  const maxRows = Math.max(payload.earnings.length, payload.deductions.length);
  let cy = tableY - ROW_H;
  for (let i = 0; i < maxRows; i += 1) {
    page.drawRectangle({ x, y: cy - ROW_H, width: w, height: ROW_H, borderWidth: 1, borderColor: BORDER });
    const e = payload.earnings[i];
    const d = payload.deductions[i];
    if (e) {
      page.drawText(e.name, { x: colX[0] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText(inr(e.monthly), { x: colX[1] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText(inr(e.amountForMonth), { x: colX[2] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText("0.00", { x: colX[3] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText(inr(e.amountForMonth), { x: colX[4] + 4, y: cy - 15, size: 9, font, color: TITLE });
    }
    if (d) {
      page.drawText(d.name, { x: colX[5] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText(inr(d.amountForMonth), { x: colX[6] + 4, y: cy - 15, size: 9, font, color: TITLE });
      page.drawText(inr(d.amountForMonth), { x: colX[7] + 4, y: cy - 15, size: 9, font, color: TITLE });
    }
    cy -= ROW_H;
  }
  page.drawRectangle({ x, y: cy - ROW_H, width: w, height: ROW_H, borderWidth: 1, borderColor: BORDER });
  page.drawText("GROSS EARNINGS", { x: colX[0] + 4, y: cy - 15, size: 10, font: bold, color: TITLE });
  page.drawText(inr(payload.grossSalary), { x: colX[2] + 4, y: cy - 15, size: 10, font: bold, color: TITLE });
  page.drawText("GROSS DEDUCTIONS", { x: colX[5] + 4, y: cy - 15, size: 10, font: bold, color: TITLE });
  page.drawText(inr(payload.totalDeductions), { x: colX[6] + 4, y: cy - 15, size: 10, font: bold, color: TITLE });
  cy -= ROW_H;
  page.drawRectangle({ x, y: cy - ROW_H, width: w, height: ROW_H, borderWidth: 1, borderColor: BORDER });
  page.drawText("NET PAY", { x: colX[5] + 170, y: cy - 15, size: 10, font: bold, color: TITLE });
  page.drawText(inr(payload.netSalary), { x: colX[7] + 4, y: cy - 15, size: 10, font: bold, color: TITLE });
  return cy - 12;
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

  flow = ensureSpace(pdf, flow, 220, bold, font, logo);
  flow.cursorY = drawEmployeeInfo(flow.page, bold, font, flow.cursorY, payload);

  const rowsHeight = 40 + (Math.max(payload.earnings.length, payload.deductions.length) + 3) * ROW_H;
  flow = ensureSpace(pdf, flow, rowsHeight + 40, bold, font, logo);
  flow.cursorY = drawEarningsDeductionsTable(flow.page, bold, font, flow.cursorY, payload);
  flow.page.drawText(`Net Salary in Words: ${payload.netSalaryInWords}`, {
    x: PAGE_MARGIN_X + 8,
    y: flow.cursorY - 8,
    size: 9,
    font,
    color: TITLE,
  });
  flow.page.drawText("Employee Signature", { x: PAGE_MARGIN_X + 18, y: flow.cursorY - 28, size: 9, font, color: TITLE });
  flow.page.drawText("Employer Signature", { x: PAGE_W - 180, y: flow.cursorY - 28, size: 9, font, color: TITLE });

  return Buffer.from(await pdf.save());
}
