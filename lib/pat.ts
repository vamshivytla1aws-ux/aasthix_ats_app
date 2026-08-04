import { query } from "@/lib/db";
import crypto from "crypto";

export function generatePatHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateNewPat() {
  const token = "ats_pat_" + crypto.randomBytes(32).toString("hex");
  return { token, token_hash: generatePatHash(token) };
}

export async function validatePat(token: string) {
  if (!token.startsWith("ats_pat_")) return null;
  const token_hash = generatePatHash(token);
  
  const res = await query(
    `SELECT p.id, p.user_id, p.expires_at, u.role, u.email, u.full_name, u.token_version
     FROM personal_access_tokens p
     JOIN users u ON u.id = p.user_id
     WHERE p.token_hash = $1
     LIMIT 1`,
    [token_hash]
  );
  
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null; // Expired
  }
  
  // Update last_used_at in background
  query(`UPDATE personal_access_tokens SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
  
  return {
    user_id: Number(row.user_id),
    role: String(row.role || "user"),
    email: String(row.email || ""),
    token_version: Number(row.token_version || 1),
  };
}
