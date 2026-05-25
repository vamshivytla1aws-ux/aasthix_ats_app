import { NextResponse } from "next/server";
import { buildPartnerStatement, getWorkspace } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";
import type { FinanceRangeInput } from "@/lib/finance/types";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const url = new URL(request.url);
    const partnerId = Number(url.searchParams.get("partnerId") ?? "0");
    if (!partnerId) return NextResponse.json({ error: "partnerId is required" }, { status: 400 });
    const range: FinanceRangeInput = {
      preset: (url.searchParams.get("preset") as FinanceRangeInput["preset"]) ?? "full",
      month: url.searchParams.get("month") ?? undefined,
      year: url.searchParams.get("year") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    const workspace = await getWorkspace();
    const summary = await buildPartnerStatement(workspace.id, partnerId, range);
    const exportType = url.searchParams.get("export");
    if (exportType === "csv") {
      const lines = [
        "Date,Narration,Category,Invested,Running Balance",
        ...summary.rows.map((row) =>
          `${row.date},"${row.narration.replace(/"/g, '""')}","${row.category.replace(/"/g, '""')}",${(row.investedMinor / 100).toFixed(2)},${(row.runningBalanceMinor / 100).toFixed(2)}`
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="partner-${summary.partnerName.replace(/\s+/g, "-").toLowerCase()}-statement.csv"`,
        },
      });
    }
    if (exportType === "pdf") {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([842, 595]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let y = 560;
      page.drawText(`Partner Investment Statement - ${summary.partnerName}`, { x: 32, y, size: 16, font: bold });
      y -= 24;
      page.drawText(`Rows: ${summary.rowCount}   Total invested: ${(summary.totalInvestedMinor / 100).toFixed(2)}`, { x: 32, y, size: 10, font });
      y -= 24;
      page.drawRectangle({ x: 32, y: y - 4, width: 778, height: 18, color: rgb(0.94, 0.96, 1) });
      page.drawText("Date", { x: 36, y, size: 9, font: bold });
      page.drawText("Narration", { x: 112, y, size: 9, font: bold });
      page.drawText("Category", { x: 458, y, size: 9, font: bold });
      page.drawText("Invested", { x: 612, y, size: 9, font: bold });
      page.drawText("Running", { x: 712, y, size: 9, font: bold });
      y -= 18;
      for (const row of summary.rows) {
        if (y < 40) break;
        page.drawText(row.date, { x: 36, y, size: 8, font });
        page.drawText(row.narration.slice(0, 52), { x: 112, y, size: 8, font });
        page.drawText(row.category.slice(0, 18), { x: 458, y, size: 8, font });
        page.drawText((row.investedMinor / 100).toFixed(2), { x: 612, y, size: 8, font });
        page.drawText((row.runningBalanceMinor / 100).toFixed(2), { x: 712, y, size: 8, font });
        y -= 14;
      }
      const bytes = await pdf.save();
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="partner-${summary.partnerName.replace(/\s+/g, "-").toLowerCase()}-statement.pdf"`,
        },
      });
    }
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
