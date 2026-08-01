import { NextResponse } from "next/server";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { storeInterviewSnapshot } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (interview.status !== "IN_PROGRESS") return NextResponse.json({ error: "Interview is not in progress" }, { status: 409 });
  if (!interview.camera_required) return NextResponse.json({ error: "Camera capture is not enabled" }, { status: 409 });
  if (interview.snapshot_status === "CAPTURED") return NextResponse.json({ captured: true, existing: true });
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() || "";
  if (contentType !== "image/jpeg") return NextResponse.json({ error: "Snapshot must be a JPEG image" }, { status: 415 });
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    const snapshot = await storeInterviewSnapshot({ interviewId: Number(interview.id), bytes, mimeType: contentType });
    return NextResponse.json({ captured: true, size: snapshot.size });
  } catch (error) {
    console.error("[ai-interviews] snapshot upload", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot could not be stored" }, { status: 400 });
  }
}
