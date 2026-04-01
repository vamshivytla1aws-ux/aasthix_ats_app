/** Safe for client components — no DB imports. Keep in sync with `lib/rbac.ts` baselines. */
export const APP_ROLES = ["admin", "recruiter", "hiring_manager", "coordinator", "user"] as const;
export const INVITE_ROLES = ["recruiter", "hiring_manager", "coordinator", "user"] as const;
