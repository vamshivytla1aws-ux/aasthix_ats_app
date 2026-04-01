/** When false (default), POST /api/auth/signup returns 403 — use invites only. */
export function isOpenSignupAllowed(): boolean {
  return process.env.ALLOW_OPEN_SIGNUP === "true" || process.env.ALLOW_OPEN_SIGNUP === "1";
}
