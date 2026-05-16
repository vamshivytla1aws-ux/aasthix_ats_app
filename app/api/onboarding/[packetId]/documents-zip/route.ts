import { NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import JSZip from "jszip";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function GET(_request: Request, { params }: { params: { packetId: string } }) {
  const auth = await requirePermission("candidates.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const packetId = Number(params.packetId);
  if (!Number.isFinite(packetId) || packetId <= 0) {
    return NextResponse.json({ error: "Invalid packet id" }, { status: 400 });
  }

  const packetRes = await query(
    `
    SELECT p.id, c.full_name AS candidate_name
    FROM application_onboarding_packets p
    JOIN candidates c ON c.id = p.candidate_id
    WHERE p.id = $1
    LIMIT 1
    `,
    [packetId]
  );
  if (packetRes.rowCount === 0) return NextResponse.json({ error: "Packet not found." }, { status: 404 });

  const docsRes = await query(
    `SELECT doc_type, file_name, file_url, uploaded_at, file_blob FROM application_onboarding_documents WHERE packet_id = $1 ORDER BY uploaded_at ASC`,
    [packetId]
  );
  const docs = docsRes.rows as Array<{
    doc_type: string;
    file_name: string;
    file_url: string;
    uploaded_at: string;
    file_blob: Buffer | null;
  }>;
  if (docs.length === 0) return NextResponse.json({ error: "No documents uploaded for this packet." }, { status: 404 });

  const zip = new JSZip();
  const manifest: string[] = ["AASTHIX Onboarding Documents Manifest", `Packet: ${packetId}`, ""];
  for (const doc of docs) {
    const localPath = path.join(process.cwd(), "public", doc.file_url.replace(/^\//, ""));
    try {
      const bytes = doc.file_blob && Buffer.isBuffer(doc.file_blob) ? doc.file_blob : await readFile(localPath);
      const folder = safeSegment(doc.doc_type || "misc");
      const fileName = safeSegment(doc.file_name || "document");
      zip.folder(folder)?.file(fileName, bytes);
      manifest.push(`${doc.doc_type} | ${doc.file_name} | ${new Date(doc.uploaded_at).toLocaleString("en-IN")}`);
    } catch {
      manifest.push(`${doc.doc_type} | ${doc.file_name} | missing on disk`);
    }
  }
  zip.file("manifest.txt", manifest.join("\n"));

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const candidateName = safeSegment(String(packetRes.rows[0]?.candidate_name || "candidate"));
  return new NextResponse(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="onboarding-docs-${candidateName}-${packetId}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
