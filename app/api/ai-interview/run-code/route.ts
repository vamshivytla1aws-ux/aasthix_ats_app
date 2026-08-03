import { NextResponse } from "next/server";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const languageVersions: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  java: { language: "java", version: "15.0.2" },
  cpp: { language: "c++", version: "10.2.0" },
  go: { language: "go", version: "1.16.2" },
  rust: { language: "rust", version: "1.68.2" },
  sql: { language: "sqlite3", version: "3.36.0" },
};

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) {
    return NextResponse.json({ error: "Invalid interview session" }, { status: 401 });
  }

  const { code, language, testCases } = await request.json();
  if (!code || !language) {
    return NextResponse.json({ error: "Missing code or language" }, { status: 400 });
  }

  const config = languageVersions[language];
  if (!config) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  try {
    // If there are no test cases, just run the code once
    const casesToRun = (testCases && testCases.length > 0) ? testCases : [{ input: "", expectedOutput: "" }];
    
    const results = [];
    
    for (const tc of casesToRun) {
      const response = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: config.language,
          version: config.version,
          files: [{ content: code }],
          stdin: tc.input || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute code via Piston API");
      }

      const data = await response.json();
      
      const compileError = data.compile?.output || "";
      const runOutput = data.run?.output || "";
      const runStderr = data.run?.stderr || "";
      const runStdout = data.run?.stdout || "";
      const exitCode = data.run?.code || 0;
      
      // Basic match for expected output if we have test cases
      let passed = true;
      if (tc.expectedOutput) {
        // Normalize whitespace for comparison
        const actualNorm = runStdout.trim();
        const expectedNorm = String(tc.expectedOutput).trim();
        passed = actualNorm === expectedNorm && exitCode === 0;
      } else {
        passed = exitCode === 0;
      }

      results.push({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        passed,
        compileError,
        runOutput,
        runStdout,
        runStderr,
        exitCode
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Code execution failed" },
      { status: 500 }
    );
  }
}
