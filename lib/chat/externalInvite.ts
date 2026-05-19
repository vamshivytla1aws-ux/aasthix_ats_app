import crypto from "node:crypto";

export function generateExternalInviteToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function hashExternalInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

