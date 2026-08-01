import crypto from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export const AI_INTERVIEW_SESSION_COOKIE = "ai_interview_session";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(value);
}

export function createSecureInterviewToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInterviewToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createCandidateSession(input: { interviewId: number; candidateId: number; tokenHash: string; expiresAt: Date }) {
  const expiresInSeconds = Math.max(60, Math.min(24 * 60 * 60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)));
  return new SignJWT({ interview_id: input.interviewId, candidate_id: input.candidateId, token_hash: input.tokenHash, scope: "ai_interview_candidate" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setAudience("ai-interview")
    .sign(secret());
}

export async function readCandidateSession() {
  const token = cookies().get(AI_INTERVIEW_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "ai-interview" });
    if (payload.scope !== "ai_interview_candidate") return null;
    const interviewId = Number(payload.interview_id);
    const candidateId = Number(payload.candidate_id);
    const tokenHash = typeof payload.token_hash === "string" ? payload.token_hash : "";
    if (!Number.isInteger(interviewId) || !Number.isInteger(candidateId) || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    return { interviewId, candidateId, tokenHash };
  } catch {
    return null;
  }
}
