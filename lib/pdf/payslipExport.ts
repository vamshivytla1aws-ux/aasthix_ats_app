import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import path from "path";
import { readFile } from "fs/promises";
import type { PayslipTaxSheetSnapshot } from "@/lib/salary/types";

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
  taxSheetSnapshot?: PayslipTaxSheetSnapshot | null;
};

const PAGE_W = 595;
const PAGE_H = 842;
const PAGE_MARGIN_X = 26;
const PAGE_MARGIN_TOP = 24;
const PAGE_MARGIN_BOTTOM = 22;
const HEADER_HEIGHT = 110;
const FOOTER_HEIGHT = 72;
const CONTENT_TOP = PAGE_H - PAGE_MARGIN_TOP - HEADER_HEIGHT - 12;
const CONTENT_BOTTOM = PAGE_MARGIN_BOTTOM + FOOTER_HEIGHT + 10;
const CYAN = rgb(0.13, 0.71, 0.95);
const NAVY = rgb(0.2, 0.22, 0.29);
const TEXT = rgb(0.15, 0.2, 0.29);
const BORDER = rgb(0.2, 0.2, 0.2);
const HEADER_FILL = rgb(0.97, 0.97, 0.97);

type ScaleBand = {
  baseFont: number;
  smallFont: number;
  rowH: number;
  tableTitleH: number;
  padX: number;
  sectionGap: number;
};

const SCALE_BANDS: ScaleBand[] = [
  { baseFont: 8.6, smallFont: 7.8, rowH: 19, tableTitleH: 18, padX: 4, sectionGap: 10 },
  { baseFont: 8.1, smallFont: 7.3, rowH: 18, tableTitleH: 17, padX: 3.5, sectionGap: 8 },
  { baseFont: 7.6, smallFont: 6.8, rowH: 17, tableTitleH: 16, padX: 3, sectionGap: 7 },
];

function inr(v: number) {
  return Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDoj(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}-${m}-${y}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, "0");
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const y = parsed.getFullYear();
    return `${d}-${m}-${y}`;
  }
  return raw;
}

function fitContain(img: PDFImage, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return { width: Math.max(1, img.width * ratio), height: Math.max(1, img.height * ratio) };
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

async function loadPayslipTemplateBackground(pdf: PDFDocument): Promise<PDFImage | null> {
  const candidates = [
    path.join(process.cwd(), "public", "payslip-template.png"),
    path.join(process.cwd(), "public", "Payslip-template.png"),
    path.join(process.cwd(), "payslip-template.png"),
    path.join("/app", "public", "payslip-template.png"),
    path.join(process.cwd(), "public", "payslip-background.png"),
    path.join(process.cwd(), "public", "payslip-bg.png"),
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

function drawHeader(page: any, bold: PDFFont, font: PDFFont, logo: PDFImage | null) {
  const boxTop = PAGE_H - PAGE_MARGIN_TOP;
  const logoX = PAGE_MARGIN_X + 8;
  const logoY = boxTop - 58;
  const logoW = 58;
  const logoH = 52;
  if (logo) {
    const fit = fitContain(logo, logoW, logoH);
    page.drawImage(logo, { x: logoX + (logoW - fit.width) / 2, y: logoY + (logoH - fit.height) / 2, width: fit.width, height: fit.height });
  }

  const brandX = logoX + logoW + 9;
  page.drawText("AASTHIX TALENT", { x: brandX, y: boxTop - 34, size: 17, font: bold, color: rgb(0.2, 0.21, 0.23) });
  page.drawText("Talent That Drives Success", { x: brandX, y: boxTop - 50, size: 10.5, font, color: rgb(0.27, 0.31, 0.36) });

  const rightX = PAGE_W - 178;
  page.drawText("+91 9573543933", { x: rightX, y: boxTop - 34, size: 9.2, font, color: TEXT });
  page.drawText("contact@aasthix.com", { x: rightX, y: boxTop - 48, size: 9.2, font, color: TEXT });
  page.drawText("www.aasthix.com", { x: rightX, y: boxTop - 62, size: 9.2, font, color: TEXT });

  const lineY = boxTop - 78;
  const splitX = PAGE_MARGIN_X + (PAGE_W - PAGE_MARGIN_X * 2) * 0.51;
  page.drawRectangle({ x: PAGE_MARGIN_X, y: lineY, width: splitX - PAGE_MARGIN_X, height: 4.8, color: CYAN });
  page.drawRectangle({ x: splitX, y: lineY, width: PAGE_W - PAGE_MARGIN_X - splitX, height: 4.8, color: NAVY });
}

function drawFooter(page: any, font: PDFFont) {
  const dividerY = PAGE_MARGIN_BOTTOM + 34;
  const splitX = PAGE_MARGIN_X + (PAGE_W - PAGE_MARGIN_X * 2) * 0.38;
  page.drawRectangle({ x: PAGE_MARGIN_X, y: dividerY, width: splitX - PAGE_MARGIN_X, height: 4.8, color: CYAN });
  page.drawRectangle({ x: splitX, y: dividerY, width: PAGE_W - PAGE_MARGIN_X - splitX, height: 4.8, color: NAVY });
  const t1 = "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar,";
  const t2 = "Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.";
  const w1 = font.widthOfTextAtSize(t1, 7.8);
  const w2 = font.widthOfTextAtSize(t2, 7.8);
  page.drawText(t1, { x: (PAGE_W - w1) / 2, y: PAGE_MARGIN_BOTTOM + 18, size: 7.8, font, color: TEXT });
  page.drawText(t2, { x: (PAGE_W - w2) / 2, y: PAGE_MARGIN_BOTTOM + 7, size: 7.8, font, color: TEXT });
}

// Kept for parity with shared renderer contract.
function ensureSpace(_requiredHeight: number) {
  return;
}

function drawCellText(page: any, font: PDFFont, text: string, x: number, y: number, w: number, size: number, bold = false, boldFont?: PDFFont) {
  const value = String(text || "-");
  const activeFont = bold && boldFont ? boldFont : font;
  let out = value;
  while (out.length > 0 && activeFont.widthOfTextAtSize(out, size) > w) out = `${out.slice(0, -1)}`;
  if (out !== value && out.length > 2) out = `${out.slice(0, -2)}..`;
  page.drawText(out || "-", { x, y, size, font: activeFont, color: TEXT });
}

function drawSectionHeader(page: any, bold: PDFFont, title: string, x: number, y: number, w: number, h: number, fontSize: number) {
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: HEADER_FILL, borderWidth: 1, borderColor: BORDER });
  const titleW = bold.widthOfTextAtSize(title, fontSize);
  page.drawText(title, { x: x + (w - titleW) / 2, y: y - h + (h - fontSize) / 2 + 1.2, size: fontSize, font: bold, color: TEXT });
}

function drawPersonalDetailsBlock(page: any, bold: PDFFont, font: PDFFont, y: number, payload: PayslipPdfPayload, s: ScaleBand) {
  page.drawText(`Payslip For : ${payload.monthLabel}    Amount in INR`, {
    x: PAGE_W - 285,
    y: y + 10,
    size: s.baseFont + 1.1,
    font,
    color: TEXT,
  });

  const x = PAGE_MARGIN_X;
  const w = PAGE_W - PAGE_MARGIN_X * 2;
  const headH = s.tableTitleH;
  const rowH = s.rowH;
  const leftRows = [
    ["Employee Name", payload.employeeName],
    ["Designation", payload.designation],
    ["DOJ", formatDoj(payload.dateOfJoining)],
    ["Bank A/c", payload.bankAccountNumber],
    ["PAN", payload.pan],
    ["UAN", payload.uanNumber],
    ["PF No.", payload.pfNumber],
    ["Net Pay", inr(payload.netSalary)],
  ].filter((row): row is [string, string] => String(row[1] || "").trim() !== "");
  const rightRows = [
    ["Employee Code", payload.employeeCode],
    ["Department", payload.department],
    ["Location", payload.workLocation],
    ["Pay Days", String(payload.paidDays)],
    ["LOP Days", String(payload.lopDays)],
    ["Gross Earnings", inr(payload.grossSalary)],
    ["Gross Deductions", inr(payload.totalDeductions)],
    ["Salary Month", payload.monthLabel],
  ].filter((row): row is [string, string] => String(row[1] || "").trim() !== "");
  const rowCount = Math.max(leftRows.length, rightRows.length);
  const totalH = headH + rowCount * rowH;
  const topY = y - 18;
  drawSectionHeader(page, bold, "Personal details", x, topY, w, headH, s.baseFont + 1);

  const tableTop = topY - headH;
  // Two label/value pairs that consume full table width (no trailing empty column).
  const col1X = x;
  const col2X = x + w * 0.16;
  const col3X = x + w * 0.40;
  const col4X = x + w * 0.55;
  const col5X = x + w;
  const leftLabelW = col2X - col1X;
  const leftValW = col3X - col2X;
  const rightLabelW = col4X - col3X;
  const rightValW = col5X - col4X;

  page.drawRectangle({ x, y: tableTop - rowCount * rowH, width: w, height: rowCount * rowH, borderWidth: 1, borderColor: BORDER });
  [col2X, col3X, col4X, col5X].forEach((vx) =>
    page.drawLine({ start: { x: vx, y: tableTop }, end: { x: vx, y: tableTop - rowCount * rowH }, thickness: 1, color: BORDER }),
  );
  for (let i = 1; i < rowCount; i += 1) {
    const ly = tableTop - i * rowH;
    page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 1, color: BORDER });
  }

  let cy = tableTop - rowH + (rowH - s.baseFont) / 2;
  for (let i = 0; i < rowCount; i += 1) {
    const l = leftRows[i] || ["", ""];
    const r = rightRows[i] || ["", ""];
    drawCellText(page, font, l[0], col1X + s.padX, cy, leftLabelW - s.padX * 2, s.baseFont);
    drawCellText(page, font, l[1] || "-", col2X + s.padX, cy, leftValW - s.padX * 2, s.baseFont, true, bold);
    drawCellText(page, font, r[0], col3X + s.padX, cy, rightLabelW - s.padX * 2, s.baseFont);
    drawCellText(page, font, r[1] || "-", col4X + s.padX, cy, rightValW - s.padX * 2, s.baseFont, true, bold);
    cy -= rowH;
  }

  return topY - totalH - s.sectionGap;
}

function drawEarningsDeductionsBlock(page: any, bold: PDFFont, font: PDFFont, y: number, payload: PayslipPdfPayload, s: ScaleBand) {
  const x = PAGE_MARGIN_X;
  const w = PAGE_W - PAGE_MARGIN_X * 2;
  drawSectionHeader(page, bold, `Payslip of ${payload.monthLabel}`, x, y, w, s.tableTitleH, s.baseFont + 1);

  const tableTop = y - s.tableTitleH;
  const rowH = s.rowH;
  const maxRows = Math.max(payload.earnings.length, payload.deductions.length);
  const rows = Math.max(1, maxRows);
  const totalRows = rows + 2;

  // 8 columns total: 5 for earnings + 3 for deductions, ending exactly at table width.
  const colWidths = [0.18, 0.11, 0.10, 0.10, 0.11, 0.21, 0.10, 0.09];
  const colX = [x];
  for (const ratio of colWidths) colX.push(colX[colX.length - 1] + w * ratio);
  colX[colX.length - 1] = x + w;
  page.drawRectangle({ x, y: tableTop - rowH * (totalRows + 1), width: w, height: rowH * (totalRows + 1), borderWidth: 1, borderColor: BORDER });
  colX.slice(1).forEach((vx) => page.drawLine({ start: { x: vx, y: tableTop }, end: { x: vx, y: tableTop - rowH * (totalRows + 1) }, thickness: 1, color: BORDER }));

  for (let i = 1; i <= totalRows + 1; i += 1) {
    const ly = tableTop - i * rowH;
    page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 1, color: BORDER });
  }

  const headers = ["EARNINGS", "RATE", "MONTHLY", "ARREARS", "YTD", "DEDUCTIONS", "MONTHLY", "YTD"];
  headers.forEach((header, i) => {
    const hx = colX[i] + s.padX;
    const hw = colX[i + 1] - colX[i] - s.padX * 2;
    drawCellText(page, font, header, hx, tableTop - rowH + (rowH - s.baseFont) / 2, hw, s.baseFont, true, bold);
  });

  let cy = tableTop - rowH * 2 + (rowH - s.baseFont) / 2;
  for (let i = 0; i < rows; i += 1) {
    const e = payload.earnings[i];
    const d = payload.deductions[i];
    if (e) {
      drawCellText(page, font, e.name, colX[0] + s.padX, cy, colX[1] - colX[0] - s.padX * 2, s.smallFont);
      drawCellText(page, font, inr(e.monthly), colX[1] + s.padX, cy, colX[2] - colX[1] - s.padX * 2, s.smallFont);
      drawCellText(page, font, inr(e.amountForMonth), colX[2] + s.padX, cy, colX[3] - colX[2] - s.padX * 2, s.smallFont);
      drawCellText(page, font, "0.00", colX[3] + s.padX, cy, colX[4] - colX[3] - s.padX * 2, s.smallFont);
      drawCellText(page, font, inr(e.amountForMonth), colX[4] + s.padX, cy, colX[5] - colX[4] - s.padX * 2, s.smallFont);
    }
    if (d) {
      drawCellText(page, font, d.name, colX[5] + s.padX, cy, colX[6] - colX[5] - s.padX * 2, s.smallFont);
      drawCellText(page, font, inr(d.amountForMonth), colX[6] + s.padX, cy, colX[7] - colX[6] - s.padX * 2, s.smallFont);
      drawCellText(page, font, inr(d.amountForMonth), colX[7] + s.padX, cy, colX[8] - colX[7] - s.padX * 2, s.smallFont);
    }
    cy -= rowH;
  }

  const grossY = tableTop - rowH * (rows + 2) + (rowH - s.baseFont) / 2;
  drawCellText(page, font, "GROSS EARNINGS", colX[0] + s.padX, grossY, colX[2] - colX[0] - s.padX * 2, s.baseFont, true, bold);
  drawCellText(page, font, inr(payload.grossSalary), colX[4] + s.padX, grossY, colX[5] - colX[4] - s.padX * 2, s.baseFont, true, bold);
  drawCellText(page, font, "GROSS DEDUCTIONS", colX[5] + s.padX, grossY, colX[7] - colX[5] - s.padX * 2, s.baseFont, true, bold);
  drawCellText(page, font, inr(payload.totalDeductions), colX[7] + s.padX, grossY, colX[8] - colX[7] - s.padX * 2, s.baseFont, true, bold);

  const netY = tableTop - rowH * (rows + 3) + (rowH - s.baseFont) / 2;
  drawCellText(page, font, "NET PAY", colX[5] + s.padX, netY, colX[7] - colX[5], s.baseFont, true, bold);
  drawCellText(page, font, inr(payload.netSalary), colX[7] + s.padX, netY, colX[8] - colX[7], s.baseFont, true, bold);

  return tableTop - rowH * (totalRows + 1) - s.sectionGap;
}

function drawTaxDeductionDetailsBlock(page: any, bold: PDFFont, font: PDFFont, y: number, payload: PayslipPdfPayload, s: ScaleBand) {
  const x = PAGE_MARGIN_X;
  const w = PAGE_W - PAGE_MARGIN_X * 2;
  const snapshot = payload.taxSheetSnapshot;
  const tdsMonthly = Number(snapshot?.monthlyTaxDeduction?.[0] ?? payload.deductions.find((d) => d.name.toLowerCase().includes("tds"))?.amountForMonth ?? 0);
  drawSectionHeader(page, bold, "Tax deduction details", x, y, w, s.tableTitleH, s.baseFont + 1);
  const monthsY = y - s.tableTitleH - s.sectionGap;
  const rowH = s.rowH - 2;
  const stripH = rowH + 2;
  const monthCols = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  const mw = w / monthCols.length;
  page.drawRectangle({ x, y: monthsY - stripH, width: w, height: stripH, borderWidth: 1, borderColor: BORDER });
  for (let i = 1; i < monthCols.length; i += 1) {
    const lx = x + i * mw;
    page.drawLine({ start: { x: lx, y: monthsY }, end: { x: lx, y: monthsY - stripH }, thickness: 1, color: BORDER });
  }
  monthCols.forEach((m, i) => {
    const label = `${m}'${m === "Jan" || m === "Feb" || m === "Mar" ? String(new Date().getFullYear() + 1).slice(-2) : String(new Date().getFullYear()).slice(-2)}`;
    drawCellText(page, font, label, x + i * mw + s.padX, monthsY - stripH + (stripH - s.smallFont) / 2 + 1, mw - s.padX * 2, s.smallFont, true, bold);
  });

  const valY = monthsY - stripH - (rowH - 2);
  page.drawRectangle({ x, y: valY, width: w, height: rowH - 2, borderWidth: 1, borderColor: BORDER });
  for (let i = 1; i < monthCols.length; i += 1) {
    const lx = x + i * mw;
    page.drawLine({ start: { x: lx, y: valY + (rowH - 2) }, end: { x: lx, y: valY }, thickness: 1, color: BORDER });
  }
  monthCols.forEach((_, i) => {
    const value = inr(Number(snapshot?.monthlyTaxDeduction?.[i] ?? (i === 0 ? tdsMonthly : 0)));
    drawCellText(page, font, value, x + i * mw + s.padX, valY + ((rowH - 2) - s.smallFont) / 2, mw - s.padX * 2, s.smallFont);
  });

  return valY - s.sectionGap - 6;
}

function drawSignatures(page: any, _bold: PDFFont, font: PDFFont, y: number, _payload: PayslipPdfPayload, s: ScaleBand) {
  const note = "** This is a computer generated payslip and does not require signature and stamp.";
  const size = s.smallFont;
  const textW = font.widthOfTextAtSize(note, size);
  page.drawText(note, { x: Math.max(PAGE_MARGIN_X + 2, (PAGE_W - textW) / 2), y, size, font, color: TEXT });
}

function estimateHeight(payload: PayslipPdfPayload, s: ScaleBand) {
  const rows = Math.max(6, Math.max(payload.earnings.length, payload.deductions.length));
  const personal = 24 + s.tableTitleH + 8 * s.rowH + s.sectionGap;
  const earnDed = s.tableTitleH + (rows + 3) * s.rowH + s.sectionGap;
  const tax = s.tableTitleH + s.sectionGap + (s.rowH + 2) + (s.rowH - 2) + s.sectionGap + 6;
  const signs = 34;
  const topMeta = 20;
  return personal + earnDed + tax + signs + topMeta;
}

export async function buildPayslipPdf(payload: PayslipPdfPayload) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bg = await loadPayslipTemplateBackground(pdf);
  if (!bg) {
    throw new Error("Payslip template background is missing. Upload /public/payslip-template.png to generate payslip.");
  }
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  page.drawImage(bg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  const availableHeight = CONTENT_TOP - CONTENT_BOTTOM;
  let scale = SCALE_BANDS[SCALE_BANDS.length - 1];
  for (const band of SCALE_BANDS) {
    if (estimateHeight(payload, band) <= availableHeight) {
      scale = band;
      break;
    }
  }

  ensureSpace(0);
  // Keep body safely within template white content area.
  let cursorY = PAGE_H - 162;
  cursorY = drawPersonalDetailsBlock(page, bold, font, cursorY, payload, scale);
  cursorY = drawEarningsDeductionsBlock(page, bold, font, cursorY, payload, scale);
  cursorY = drawTaxDeductionDetailsBlock(page, bold, font, cursorY, payload, scale);
  drawSignatures(page, bold, font, Math.max(cursorY - 3, 108), payload, scale);

  return Buffer.from(await pdf.save());
}
