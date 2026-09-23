import { beforeEach, expect, it, vi } from "vitest";
const { query, parse, docx } = vi.hoisted(() => ({ query: vi.fn(), parse: vi.fn(), docx: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));
vi.mock("pdf.js-extract", () => ({ PDFExtract: class { extractBuffer = parse; } }));
vi.mock("mammoth", () => ({ default: { extractRawText: docx } }));
import { loadVerifiedMatchResume } from "@/lib/singleMatch/verifiedSource";
let serial = 100;
beforeEach(() => {
  query.mockReset(); parse.mockReset(); serial++;
  query.mockResolvedValue({ rows: [{ resume_blob: Buffer.from(`file-${serial}`), resume_file_name: "resume.pdf", resume_text: "stale cached text" }] });
  parse.mockResolvedValue({ pages: [{ content: [{ str: "Employment and project delivery in production. ".repeat(12) }] }] });
});
it("hashes the current file and reuses only the identical parse", async () => {
  const first = await loadVerifiedMatchResume(serial);
  expect(first.text).not.toContain("stale");
  expect(first.fileHash).toHaveLength(64);
  expect((await loadVerifiedMatchResume(serial)).fileHash).toBe(first.fileHash);
  expect(parse).toHaveBeenCalledTimes(1);
  query.mockResolvedValue({ rows: [{ resume_blob: Buffer.from(`replacement-${serial}`), resume_file_name: "resume.pdf" }] });
  expect((await loadVerifiedMatchResume(serial)).fileHash).not.toBe(first.fileHash);
  expect(parse).toHaveBeenCalledTimes(2);
});
it("fails closed when even one page has no text layer", async () => {
  parse.mockResolvedValue({ pages: [{ content: [{ str: "Readable resume text ".repeat(50) }] }, { content: [] }] });
  expect((await loadVerifiedMatchResume(serial)).error).toContain("At least one PDF page");
});
it("never recovers another candidate's resume by scanning files", async () => {
  query.mockResolvedValue({ rows: [{ resume_url: "https://example.com/resume.pdf", resume_text: "cached text" }] });
  expect((await loadVerifiedMatchResume(serial)).text).toBe("");
  expect(parse).not.toHaveBeenCalled();
});
it("rejects file traversal", async () => {
  query.mockResolvedValue({ rows: [{ resume_url: "/uploads/../../private.pdf" }] });
  expect((await loadVerifiedMatchResume(serial)).error).toContain("Invalid");
});
