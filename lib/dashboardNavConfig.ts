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

export type DashboardDomain =
  | "hiring"
  | "delivery"
  | "collaboration"
  | "reporting"
  | "workforce"
  | "admin";

export type DashboardDomainNav = {
  id: DashboardDomain;
  label: string;
  href: string;
};

export const DASHBOARD_PRIMARY_NAV: DashboardNavItem[] = [
  { id: "home", label: "Home", href: "/dashboard", permissionKey: "dashboard.view" },
  { id: "candidates", label: "Candidates", href: "/candidates", permissionKey: "candidates.view" },
  { id: "jobs", label: "Jobs", href: "/jobs", permissionKey: "jobs.view" },
  { id: "pipeline", label: "Pipeline", href: "/pipeline", permissionKey: "pipeline.view" },
  { id: "clients", label: "Clients", href: "/clients", permissionKey: "vendors.view" },
  { id: "interviews", label: "Interviews", href: "/interviews", permissionKey: "interviews.view" },
  { id: "chat", label: "Chat", href: "/chat", permissionKey: "chat.view" },
  { id: "notes", label: "Notes", href: "/notes", permissionKey: "pipeline.view" },
  { id: "hrms", label: "HRMS", href: "/hrms", permissionKey: "leave.view_self" },
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
  { id: "governance", label: "AI Governance", href: "/governance", permissionKey: "jobs.view" },
  { id: "finance", label: "Finance", href: "/finance", permissionKey: "finance.view" },
];

export const DASHBOARD_DOMAIN_NAV: DashboardDomainNav[] = [
  { id: "hiring", label: "Hiring", href: "/jobs" },
  { id: "delivery", label: "Delivery", href: "/clients" },
  { id: "collaboration", label: "Collaboration", href: "/chat" },
  { id: "reporting", label: "Reporting", href: "/analytics" },
  { id: "workforce", label: "HRMS", href: "/hrms" },
  { id: "admin", label: "Admin", href: "/admin/permissions" },
];

const WORKFORCE_SELF_SERVICE_ITEMS: DashboardNavItem[] = [
  { id: "hrms-home", label: "HRMS Home", href: "/hrms", permissionKey: "leave.view_self" },
  { id: "my-profile", label: "My Profile", href: "/hrms/my-profile", permissionKey: "employee_directory.view_self" },
  { id: "salary", label: "Pay", href: "/salary", permissionKey: "salary.view" },
  { id: "leave", label: "Leave", href: "/leave", permissionKey: "leave.view_self" },
  { id: "attendance", label: "Attendance", href: "/attendance", permissionKey: "attendance.view_self" },
  { id: "team-calendar", label: "Leave Calendar", href: "/team-calendar", permissionKey: "team_calendar.view" },
  { id: "timesheet", label: "Timesheet", href: "/timesheet", permissionKey: "timesheet.view_self" },
];

const WORKFORCE_ADMIN_ITEMS: DashboardNavItem[] = [
  { id: "hrms-home", label: "HRMS Home", href: "/hrms", permissionKey: "leave.view_self" },
  { id: "employees", label: "Employee Directory", href: "/hrms/employees", permissionKey: "employee_directory.view_all" },
  { id: "documents", label: "Documents", href: "/hrms/documents", permissionKey: "documents.view_all" },
  { id: "attendance-rules", label: "Attendance Rules", href: "/hrms/attendance-rules", permissionKey: "attendance.view_all" },
  { id: "payroll", label: "Payroll", href: "/hrms/payroll", permissionKey: "payroll.run" },
  { id: "ctc", label: "CTC Management", href: "/hrms/ctc", permissionKey: "salary.manage" },
  { id: "onboarding-exit", label: "Onboarding & Exit", href: "/hrms/onboarding-exit", permissionKey: "onboarding_exit.view_all" },
  { id: "performance", label: "Performance", href: "/hrms/performance", permissionKey: "performance.view_all" },
  { id: "leave", label: "Leave", href: "/leave", permissionKey: "leave.view_self" },
  { id: "team-calendar", label: "Team Calendar", href: "/team-calendar", permissionKey: "team_calendar.view" },
  { id: "salary", label: "Salary", href: "/salary", permissionKey: "salary.view" },
  { id: "attendance", label: "Attendance", href: "/attendance", permissionKey: "attendance.view_self" },
  { id: "timesheet", label: "Timesheet", href: "/timesheet", permissionKey: "timesheet.view_self" },
];

export const DASHBOARD_DOMAIN_ITEMS: Record<DashboardDomain, DashboardNavItem[]> = {
  hiring: [
    { id: "home", label: "Home", href: "/dashboard", permissionKey: "dashboard.view" },
    { id: "jobs", label: "Jobs", href: "/jobs", permissionKey: "jobs.view" },
    { id: "pipeline", label: "Pipeline", href: "/pipeline", permissionKey: "pipeline.view" },
    { id: "candidates", label: "Candidates", href: "/candidates", permissionKey: "candidates.view" },
    { id: "interviews", label: "Interviews", href: "/interviews", permissionKey: "interviews.view" },
  ],
  delivery: [
    { id: "clients", label: "Clients", href: "/clients", permissionKey: "vendors.view" },
    { id: "workload", label: "Recruiter Workload", href: "/recruiter/workload", permissionKey: "jobs.view" },
    { id: "activity", label: "Activity Center", href: "/activity-center", permissionKey: "dashboard.view" },
  ],
  collaboration: [
    { id: "chat", label: "Chat", href: "/chat", permissionKey: "chat.view" },
    { id: "notes", label: "Notes", href: "/notes", permissionKey: "pipeline.view" },
    { id: "alerts", label: "Alerts", href: "/alerts", permissionKey: "alerts.view" },
  ],
  reporting: [
    { id: "analytics", label: "Analytics", href: "/analytics", permissionKey: "jobs.view" },
    { id: "usage", label: "AI Usage", href: "/usage", permissionKey: "jobs.view" },
    { id: "audit", label: "Audit trail", href: "/audit", permissionKey: "jobs.view" },
  ],
  workforce: WORKFORCE_SELF_SERVICE_ITEMS,
  admin: [
    { id: "permissions", label: "Access control", href: "/admin/permissions", permissionKey: "jobs.view" },
    { id: "disposition", label: "Disposition reasons", href: "/admin/disposition-reasons", permissionKey: "jobs.view" },
    { id: "settings", label: "Settings", href: "/settings", permissionKey: "dashboard.view" },
  ],
};

const HRMS_MANAGEMENT_PERMISSION_KEYS = [
  "employee_directory.view_all",
  "documents.view_all",
  "attendance.view_all",
  "leave.manage_policy",
  "payroll.run",
  "salary.manage",
  "onboarding_exit.view_all",
  "performance.view_all",
  "timesheet.view_all",
  "timesheet.manage_all",
] as const;

export function isNavItemVisible(
  item: Pick<DashboardNavItem, "permissionKey">,
  role: string,
  permissions: Record<string, boolean>
): boolean {
  if (role === "admin") return true;
  if (!item.permissionKey) return true;
  return permissions[item.permissionKey] !== false;
}

export function hasHrmsManagementAccess(role: string, permissions: Record<string, boolean>): boolean {
  if (role === "admin") return true;
  return HRMS_MANAGEMENT_PERMISSION_KEYS.some((key) => permissions[key] === true);
}

export function getDashboardDomainItemsForRole(
  domain: DashboardDomain,
  role: string,
  permissions: Record<string, boolean>
): DashboardNavItem[] {
  const items =
    domain === "workforce"
      ? hasHrmsManagementAccess(role, permissions)
        ? WORKFORCE_ADMIN_ITEMS
        : WORKFORCE_SELF_SERVICE_ITEMS
      : DASHBOARD_DOMAIN_ITEMS[domain] ?? [];
  return items.filter((item) => isNavItemVisible(item, role, permissions));
}

/** Active state for top nav tabs (prefix rules for nested routes). */
export function isDashboardNavHrefActive(pathname: string, href: string): boolean {
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/jobs/");
  if (href === "/candidates") return pathname === "/candidates" || pathname.startsWith("/candidates/");
  if (href === "/clients") return pathname === "/clients" || pathname.startsWith("/clients/");
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/notes") return pathname === "/notes" || pathname.startsWith("/notes/");
  if (href === "/admin/permissions") return pathname.startsWith("/admin/");
  if (href === "/analytics") return pathname === "/analytics" || pathname.startsWith("/usage");
  if (href === "/finance") return pathname === "/finance" || pathname.startsWith("/finance/");
  if (href === "/chat") return pathname === "/chat" || pathname.startsWith("/notes");
  if (href === "/attendance") return pathname === "/attendance" || pathname.startsWith("/timesheet");
  if (href === "/hrms") {
    return (
      pathname === "/hrms" ||
      pathname.startsWith("/hrms/") ||
      pathname === "/leave" ||
      pathname.startsWith("/attendance") ||
      pathname.startsWith("/timesheet") ||
      pathname.startsWith("/salary") ||
      pathname.startsWith("/team-calendar")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getDomainForPath(pathname: string): DashboardDomain {
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/candidates") ||
    pathname.startsWith("/interviews") ||
    pathname.startsWith("/screening")
  ) {
    return "hiring";
  }
  if (pathname.startsWith("/clients") || pathname.startsWith("/recruiter/workload") || pathname.startsWith("/activity-center")) {
    return "delivery";
  }
  if (pathname.startsWith("/chat") || pathname.startsWith("/notes") || pathname.startsWith("/alerts")) {
    return "collaboration";
  }
  if (pathname.startsWith("/analytics") || pathname.startsWith("/usage") || pathname.startsWith("/audit")) {
    return "reporting";
  }
  if (pathname.startsWith("/attendance") || pathname.startsWith("/timesheet") || pathname.startsWith("/salary") || pathname.startsWith("/hrms")) {
    return "workforce";
  }
  if (pathname.startsWith("/team-calendar") || pathname.startsWith("/leave")) {
    return "workforce";
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/settings")) {
    return "admin";
  }
  return "hiring";
}
