function esc(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function makeSimplePdf(lines: string[]) {
  const contentLines: string[] = [];
  let y = 800;
  contentLines.push("BT");
  contentLines.push("/F1 12 Tf");
  for (const line of lines) {
    if (y < 60) break;
    contentLines.push(`1 0 0 1 40 ${y} Tm (${esc(line)}) Tj`);
    y -= 16;
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj"
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`);

  let body = "";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length + 9); // account for header length "%PDF-1.4\n"
    body += obj + "\n";
  }
  const xrefStart = 9 + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "utf8");
}
