import { NextResponse } from "next/server";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { storeIncidentSnapshot } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (interview.status !== "IN_PROGRESS") return NextResponse.json({ error: "Interview is not in progress" }, { status: 409 });
  
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() || "";
  if (contentType !== "image/jpeg") return NextResponse.json({ error: "Snapshot must be a JPEG image" }, { status: 415 });
  
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    const snapshot = await storeIncidentSnapshot({ interviewId: Number(interview.id), bytes, mimeType: contentType });
    return NextResponse.json({ captured: true, size: snapshot.size });
  } catch (error) {
    console.error("[ai-interviews] incident snapshot upload", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Incident snapshot could not be stored" }, { status: 400 });
  }
}
