import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI();

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const candidateId = Number(params.id);
  if (isNaN(candidateId)) {
    return NextResponse.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, name, resume_url, resume_text, ai_resume_analysis FROM candidates WHERE id = $1`,
      [candidateId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const candidate = result.rows[0];

    // Check if we already have the analysis
    if (candidate.ai_resume_analysis) {
      return NextResponse.json({ analysis: candidate.ai_resume_analysis });
    }

    let resumeText = candidate.resume_text;

    if (!resumeText) {
      // If we don't have parsed resume text, we cannot proceed since downloading and parsing PDF here is slow
      // Assuming we have a background process that sets resume_text.
      return NextResponse.json(
        { error: "Resume text is not available yet for this candidate. Please try again later." },
        { status: 422 }
      );
    }

    const prompt = `You are an expert technical recruiter AI. Analyze the following candidate resume and extract these key data points in JSON format. Do not include markdown formatting or json code blocks, output only the raw JSON.
    
Expected JSON schema:
{
  "name": "Full name",
  "dob": "Date of Birth if present, otherwise null",
  "phone": "Phone number if present, otherwise null",
  "email": "Email address if present, otherwise null",
  "skills": ["Skill 1", "Skill 2"],
  "gaps": [
    { "startDate": "YYYY-MM", "endDate": "YYYY-MM", "reason": "Extracted reason if present or null" }
  ],
  "experience_breakdown": [
    { "technology": "Java", "years": 6, "percentage_proficiency": 80, "is_it": true }
  ]
}

Note: For gaps, identify any unexplained gaps of more than 3 months between jobs in the work history.
For experience_breakdown, estimate the number of years the candidate has used specific core technologies based on the overlapping dates of the jobs where those technologies were mentioned. Also, specify if the technology is IT-related (true) or non-IT (false).

Resume text:
${resumeText.substring(0, 15000)}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const outputStr = completion.choices[0]?.message?.content?.trim();
    if (!outputStr) throw new Error("Empty response from OpenAI");

    const analysis = JSON.parse(outputStr);

    await client.query(
      `UPDATE candidates SET ai_resume_analysis = $1, updated_at = NOW() WHERE id = $2`,
      [analysis, candidateId]
    );

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error("[ai-analysis] Error analyzing resume:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze resume" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
