/** Safe for client components - no DB imports. Keep in sync with `lib/rbac.ts` baselines. */
export const APP_ROLES = ["admin", "hr", "recruiter", "hiring_manager", "coordinator", "employee", "user"] as const;
export const INVITE_ROLES = ["hr", "recruiter", "hiring_manager", "coordinator", "employee", "user"] as const;
