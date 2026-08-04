import { cookies, headers } from "next/headers";
import { tokenCookieName, verifyAuthToken } from "@/lib/auth";
import { validatePat } from "@/lib/pat";

export async function getAuthUser() {
  const authHeader = headers().get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ats_pat_")) {
    const patToken = authHeader.replace("Bearer ", "").trim();
    const patUser = await validatePat(patToken);
    if (patUser) return patUser;
  }

  const token = cookies().get(tokenCookieName())?.value;
  if (!token) return null;
  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}

export async function requireAuthUser() {
  return await getAuthUser();
}

