import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

vi.mock("@/lib/resumeParser", () => ({
  extractPlainTextFromResumeBuffer: vi.fn(async () =>
    "Harshit Dubey harshitdubey1996@gmail.com senior backend engineer with LangGraph, REST APIs, vector databases, AWS, and microservices experience. ".repeat(3)
  ),
}));

import { resolveCandidateResumeForMatchDetailed } from "@/lib/candidateResumeForMatch";

const uploadsDir = path.join(process.cwd(), "public", "uploads");
const uploadsResumeDir = path.join(uploadsDir, "resumes");
const sampleResumePath = path.join(uploadsDir, "vitest-resume.pdf");
const sampleResumeApiPath = path.join(uploadsResumeDir, "vitest-resume.pdf");
const careersResumeDir = path.join(uploadsResumeDir, "careers", "42");
const recoveredResumePath = path.join(careersResumeDir, "recovered-harshit.pdf");

describe("resolveCandidateResumeForMatchDetailed", () => {
  beforeEach(async () => {
    await mkdir(uploadsDir, { recursive: true });
    await mkdir(uploadsResumeDir, { recursive: true });
    await mkdir(careersResumeDir, { recursive: true });
    await writeFile(sampleResumePath, Buffer.from("fake pdf bytes"));
    await writeFile(sampleResumeApiPath, Buffer.from("fake pdf bytes"));
    await writeFile(recoveredResumePath, Buffer.from("fake pdf bytes"));
  });

  afterEach(async () => {
    await rm(sampleResumePath, { force: true });
    await rm(sampleResumeApiPath, { force: true });
    await rm(recoveredResumePath, { force: true });
  });

  it("prefers uploaded resume file in single-candidate scoring mode", async () => {
    const result = await resolveCandidateResumeForMatchDetailed(
      {
        id: 1,
        full_name: "Harshit",
        skills: "Python, AWS",
        location: "Bangalore",
        resume_url: "/uploads/vitest-resume.pdf",
        resume_text: "Short stale stored text only.",
        experience_summary: "Summary fallback",
      },
      new Map(),
      { preferUploadedFile: true }
    );

    expect(result.source).toBe("uploaded_resume_file");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.text).toContain("LangGraph");
  });

  it("can resolve uploaded resumes stored through the authenticated /api/resume path", async () => {
    const result = await resolveCandidateResumeForMatchDetailed(
      {
        id: 11,
        full_name: "Harshit",
        skills: "Python, AWS",
        location: "Delhi",
        resume_url: "/api/resume/vitest-resume.pdf",
        resume_text: "Short stale stored text only.",
        experience_summary: "Summary fallback",
      },
      new Map(),
      { preferUploadedFile: true }
    );

    expect(result.source).toBe("uploaded_resume_file");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.text).toContain("LangGraph");
  });

  it("can resolve uploaded resumes when resume_url is stored as a full hosted /api/resume URL", async () => {
    const result = await resolveCandidateResumeForMatchDetailed(
      {
        id: 12,
        full_name: "Harshit",
        skills: "Python, AWS",
        location: "Delhi",
        resume_url: "https://ats.example.com/api/resume/vitest-resume.pdf?download=1",
        resume_text: "Short stale stored text only.",
        experience_summary: "Summary fallback",
      },
      new Map(),
      { preferUploadedFile: true }
    );

    expect(result.source).toBe("uploaded_resume_file");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.text).toContain("LangGraph");
  });

  it("can resolve uploaded resumes when resume_url is stored as a full hosted /uploads path", async () => {
    const result = await resolveCandidateResumeForMatchDetailed(
      {
        id: 13,
        full_name: "Harshit",
        skills: "Python, AWS",
        location: "Delhi",
        resume_url: "https://ats.example.com/uploads/resumes/vitest-resume.pdf",
        resume_text: "Short stale stored text only.",
        experience_summary: "Summary fallback",
      },
      new Map(),
      { preferUploadedFile: true }
    );

    expect(result.source).toBe("uploaded_resume_file");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.text).toContain("LangGraph");
  });

  it("falls back to stored resume text when no uploaded file is available", async () => {
    const result = await resolveCandidateResumeForMatchDetailed({
      id: 2,
      full_name: "Stored Only",
      skills: "React",
      location: null,
      resume_url: null,
      resume_text:
        "Experienced React and TypeScript engineer building Next.js applications, REST APIs, and CI/CD pipelines for enterprise teams.".repeat(
          2
        ),
      experience_summary: "Summary fallback",
    });

    expect(result.source).toBe("stored_resume_text");
    expect(result.charCount).toBeGreaterThan(100);
    expect(result.text).toContain("React");
  });

  it("uses summary and skills fallback when no full resume text exists", async () => {
    const result = await resolveCandidateResumeForMatchDetailed({
      id: 3,
      full_name: "Fallback",
      skills: "Playwright, Cypress, API testing",
      location: null,
      resume_url: null,
      resume_text: null,
      experience_summary: "QA engineer focused on automation and API validation across large web platforms.",
    });

    expect(result.source).toBe("experience_summary_or_skills");
    expect(result.text).toContain("EXPERIENCE SUMMARY");
    expect(result.text).toContain("SKILLS / PROFILE");
  });

  it("can recover a missing resume_url from the local uploads store for recompute", async () => {
    const result = await resolveCandidateResumeForMatchDetailed(
      {
        id: 14,
        full_name: "Harshit Dubey",
        email: "harshitdubey1996@gmail.com",
        skills: "Python, LangGraph, Pinecone, FastAPI",
        location: "Delhi, India",
        created_by_user_id: 42,
        resume_url: null,
        resume_text: null,
        experience_summary: "Short stale summary only",
      },
      new Map(),
      { preferUploadedFile: true }
    );

    expect(result.source).toBe("uploaded_resume_file");
    expect(result.resolvedResumeUrl).toContain("/uploads/resumes/careers/42/");
    expect(result.recovery?.attempted).toBe(true);
    expect(result.recovery?.succeeded).toBe(true);
  });
});
