/**
 * Post-login default when no `next` query is provided.
 * Recruiter/coordinator → pipeline or activity center; hiring manager → requisitions (approvals) or interviews.
 */
export function resolveDefaultLandingPath(role: string, permissions: Record<string, boolean>): string {
  const admin = role === "admin";
  const ok = (key: string) => admin || permissions[key] !== false;

  if (admin) return "/dashboard";

  if (ok("recruiter.view") || ok("coordinator.view")) {
    if (ok("pipeline.view")) return "/pipeline";
    if (ok("dashboard.view")) return "/activity-center";
    return "/dashboard";
  }

  if (ok("hiring_manager.view")) {
    if (ok("approvals.manage")) return "/requisitions";
    if (ok("interviews.view")) return "/interviews";
    return "/dashboard";
  }

  return "/dashboard";
}
