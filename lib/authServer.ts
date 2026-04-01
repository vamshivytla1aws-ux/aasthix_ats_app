import { cookies } from "next/headers";
import { tokenCookieName, verifyAuthToken } from "@/lib/auth";

export async function getAuthUser() {
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

