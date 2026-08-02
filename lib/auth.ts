import { SignJWT, jwtVerify } from "jose";

const TOKEN_COOKIE_NAME = "ats_token";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export function tokenCookieName() {
  return TOKEN_COOKIE_NAME;
}

export async function signAuthToken(payload: { user_id: number; email: string; token_version?: number }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyAuthToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  const user_id = Number(payload.user_id);
  const email = typeof payload.email === "string" ? payload.email : "";
  const token_version = Number(payload.token_version || 1);
  if (!Number.isFinite(user_id) || user_id <= 0) throw new Error("Invalid token payload");
  if (!email) throw new Error("Invalid token payload");
  return { user_id, email, token_version };
}

