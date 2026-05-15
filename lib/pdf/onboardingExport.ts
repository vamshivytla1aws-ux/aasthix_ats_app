import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
const MARGIN = 28;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

async function loadImageBytes(filePath: string) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function buildOnboardingPdf(input: {
  packet: PacketMeta;
  payload: Record<string, unknown>;
  docs: DocRow[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoPath = path.join(process.cwd(), "public", "aasthix-brand.png");
  const logoBytes = await loadImageBytes(logoPath);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const drawHeader = (p: typeof page) => {
    const yTop = PAGE_H - MARGIN;
    if (logo) {
      const scaled = logo.scale(0.18);
      p.drawImage(logo, { x: MARGIN, y: yTop - scaled.height + 4, width: scaled.width, height: scaled.height });
    }
    p.drawText("AASTHIX TALENT", { x: MARGIN + 86, y: yTop - 12, size: 16, font: fontBold, color: rgb(0.14, 0.16, 0.19) });
    p.drawText("Talent That Drives Success", { x: MARGIN + 86, y: yTop - 30, size: 11, font, color: rgb(0.3, 0.33, 0.37) });
    p.drawText("+91 9573543933", { x: PAGE_W - 200, y: yTop - 10, size: 11, font, color: rgb(0.2, 0.22, 0.25) });
    p.drawText("contact@aasthix.com", { x: PAGE_W - 200, y: yTop - 26, size: 11, font, color: rgb(0.2, 0.22, 0.25) });
    p.drawText("www.aasthix.com", { x: PAGE_W - 200, y: yTop - 42, size: 11, font, color: rgb(0.2, 0.22, 0.25) });
    p.drawRectangle({ x: MARGIN, y: yTop - 52, width: PAGE_W - MARGIN * 2, height: 6, color: rgb(0.22, 0.24, 0.29) });
    p.drawRectangle({ x: MARGIN, y: yTop - 52, width: 410, height: 6, color: rgb(0.13, 0.71, 0.95) });
  };

  const drawFooter = (p: typeof page) => {
    p.drawRectangle({ x: MARGIN, y: 56, width: PAGE_W - MARGIN * 2, height: 6, color: rgb(0.22, 0.24, 0.29) });
    p.drawRectangle({ x: MARGIN, y: 56, width: 360, height: 6, color: rgb(0.13, 0.71, 0.95) });
    p.drawText(
      "Unit.No. 114, Manjeera Trinity Corporate, JNTU - Hitech Road, beside LuLu Mall, Ashok Nagar, Kukatpally Housing Board Colony, Kukatpally, Hyderabad, Telangana 500072.",
      { x: MARGIN + 90, y: 30, size: 9, font, color: rgb(0.18, 0.2, 0.24) }
    );
  };

  drawHeader(page);
  drawFooter(page);

  let y = PAGE_H - 105;
  const sectionTitle = (t: string) => {
    page.drawText(t, { x: MARGIN, y, size: 12, font: fontBold, color: rgb(0.16, 0.2, 0.27) });
    y -= 18;
  };
  const row = (label: string, value: string) => {
    page.drawText(label, { x: MARGIN, y, size: 9, font: fontBold });
    page.drawText(value || "-", { x: MARGIN + 140, y, size: 9, font });
    y -= 13;
  };

  sectionTitle("Employee Onboarding Summary");
  row("Candidate", input.packet.candidateName);
  row("Job Title", input.packet.jobTitle);
  row("Status", input.packet.status);
  row("Submitted At", formatDate(input.packet.submittedAt));
  y -= 4;

  sectionTitle("Personal & Employment");
  const k = input.payload;
  row("Full Name", asText(k.full_name));
  row("Date of Birth", asText(k.date_of_birth));
  row("Gender", asText(k.gender));
  row("Contact Number", asText(k.contact_number));
  row("Email", asText(k.personal_email));
  row("Joining Date", asText(k.joining_date));
  row("Employment Type", asText(k.employment_type));
  row("Work Mode", asText(k.work_mode));
  row("Work Location", asText(k.work_location));
  row("Declaration Date", asText(k.declaration_date));

  const tablePage = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(tablePage);
  drawFooter(tablePage);
  let ty = PAGE_H - 105;
  tablePage.drawText("Education / Employment / References", { x: MARGIN, y: ty, size: 12, font: fontBold });
  ty -= 16;
  const drawJsonBlock = (title: string, value: unknown) => {
    tablePage.drawText(title, { x: MARGIN, y: ty, size: 10, font: fontBold });
    ty -= 12;
    const text = asText(value);
    const lines = text.match(/.{1,145}/g) || ["-"];
    for (const line of lines.slice(0, 16)) {
      tablePage.drawText(line, { x: MARGIN, y: ty, size: 8, font });
      ty -= 10;
    }
    ty -= 8;
  };
  drawJsonBlock("Education Rows", k.education_rows);
  drawJsonBlock("Previous Employment Rows", k.previous_employment_rows);
  drawJsonBlock("Professional References", k.professional_references);

  const manifestPage = pdf.addPage([PAGE_W, PAGE_H]);
  drawHeader(manifestPage);
  drawFooter(manifestPage);
  let my = PAGE_H - 105;
  manifestPage.drawText("Document Manifest", { x: MARGIN, y: my, size: 12, font: fontBold });
  my -= 16;
  if (input.docs.length === 0) {
    manifestPage.drawText("No uploaded documents.", { x: MARGIN, y: my, size: 10, font });
  } else {
    for (const d of input.docs) {
      manifestPage.drawText(`${d.doc_type} | ${d.file_name} | ${formatDate(d.uploaded_at)}`, { x: MARGIN, y: my, size: 8, font });
      my -= 10;
      if (my < 90) break;
    }
  }

  const imageDocs = input.docs.filter((d) => {
    const name = d.file_name.toLowerCase();
    return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
  });
  for (const doc of imageDocs.slice(0, 12)) {
    const imgPath = path.join(process.cwd(), "public", doc.file_url.replace(/^\//, ""));
    const bytes = await loadImageBytes(imgPath);
    if (!bytes) continue;
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    drawHeader(p);
    drawFooter(p);
    p.drawText(`Attachment Preview: ${doc.file_name}`, { x: MARGIN, y: PAGE_H - 105, size: 11, font: fontBold });
    let embedded;
    const lower = doc.file_name.toLowerCase();
    if (lower.endsWith(".png")) embedded = await pdf.embedPng(bytes);
    else embedded = await pdf.embedJpg(bytes);
    const maxW = PAGE_W - MARGIN * 2;
    const maxH = PAGE_H - 190;
    const scaled = embedded.scale(Math.min(maxW / embedded.width, maxH / embedded.height));
    p.drawImage(embedded, {
      x: MARGIN + (maxW - scaled.width) / 2,
      y: 88 + (maxH - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
    });
  }

  return Buffer.from(await pdf.save());
}

