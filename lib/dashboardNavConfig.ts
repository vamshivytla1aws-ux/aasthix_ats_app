/**
 * Single source of truth for dashboard primary / “more” navigation.
 * Used by MegaMenuNavbar; SidebarNav maps the same hrefs where applicable.
 */

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
  /** When set, item hidden if permission is explicitly false (non-admin). */
  permissionKey?: string;
};

export const DASHBOARD_PRIMARY_NAV: DashboardNavItem[] = [
  { id: "home", label: "Home", href: "/dashboard", permissionKey: "dashboard.view" },
  { id: "candidates", label: "Candidates", href: "/candidates", permissionKey: "candidates.view" },
  { id: "jobs", label: "Jobs", href: "/jobs", permissionKey: "jobs.view" },
  { id: "requisitions", label: "Requisitions", href: "/requisitions", permissionKey: "jobs.view" },
  { id: "pipeline", label: "Pipeline", href: "/pipeline", permissionKey: "pipeline.view" },
  { id: "clients", label: "Clients", href: "/clients", permissionKey: "vendors.view" },
  { id: "interviews", label: "Interviews", href: "/interviews", permissionKey: "interviews.view" },
  { id: "chat", label: "Chat", href: "/chat", permissionKey: "chat.view" },
  { id: "notes", label: "Notes", href: "/notes", permissionKey: "pipeline.view" },
];

export const DASHBOARD_MORE_NAV: DashboardNavItem[] = [
  { id: "analytics", label: "Analytics", href: "/analytics", permissionKey: "jobs.view" },
  { id: "alerts", label: "Alerts", href: "/alerts", permissionKey: "alerts.view" },
  { id: "activity", label: "Activity Center", href: "/activity-center", permissionKey: "dashboard.view" },
  { id: "screening", label: "Screening", href: "/screening", permissionKey: "pipeline.view" },
  { id: "audit", label: "Audit trail", href: "/audit", permissionKey: "jobs.view" },
  { id: "roadmap", label: "Roadmap", href: "/roadmap", permissionKey: "pipeline.view" },
  { id: "copilot", label: "Recruiter Copilot", href: "/recruiter/copilot", permissionKey: "jobs.view" },
  { id: "workload", label: "Recruiter Workload", href: "/recruiter/workload", permissionKey: "jobs.view" },
];

export function isNavItemVisible(
  item: Pick<DashboardNavItem, "permissionKey">,
  role: string,
  permissions: Record<string, boolean>
): boolean {
  if (role === "admin") return true;
  if (!item.permissionKey) return true;
  return permissions[item.permissionKey] !== false;
}

/** Active state for top nav tabs (prefix rules for nested routes). */
export function isDashboardNavHrefActive(pathname: string, href: string): boolean {
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/jobs/");
  if (href === "/requisitions") return pathname === "/requisitions" || pathname.startsWith("/requisitions/");
  if (href === "/candidates") return pathname === "/candidates" || pathname.startsWith("/candidates/");
  if (href === "/clients") return pathname === "/clients" || pathname.startsWith("/clients/");
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/notes") return pathname === "/notes" || pathname.startsWith("/notes/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
