export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(value.trim());
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (char === "\r") continue;
    value += char;
  }

  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => {
          const value = row[header] == null ? "" : String(row[header]);
          const escaped = value.replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}
