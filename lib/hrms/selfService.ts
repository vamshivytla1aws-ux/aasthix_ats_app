// Shared by the employee home and its navigation. Only explicit grants are shown.
export const EMPLOYEE_MODULES = [
  { href: "/hrms", title: "My HRMS", permission: "dashboard.view", subtitle: "Your employee home." },
  { href: "/hrms/my-profile", title: "My Profile", permission: "employee_directory.view_self", subtitle: "Your personal details, job information and reporting manager." },
  { href: "/salary", title: "My Payslips", permission: "salary.view", subtitle: "View and download your monthly payslips." },
  { href: "/hrms/my-documents", title: "My Documents", permission: "documents.view_self", subtitle: "Your offer letter, certificates and HR documents." },
  { href: "/leave", title: "My Leave", permission: "leave.view_self", subtitle: "Check your balance and leave requests." },
  { href: "/attendance", title: "My Attendance", permission: "attendance.view_self", subtitle: "Check in, check out and view attendance." },
  { href: "/timesheet", title: "My Timesheet", permission: "timesheet.view_self", subtitle: "View and submit your work hours." },
  { href: "/team-calendar", title: "Team Calendar", permission: "team_calendar.view", subtitle: "Your team's shared calendar." },
  { href: "/hrms/my-records#onboarding", title: "My Onboarding & Exit", permission: "onboarding_exit.view_self", subtitle: "View your joining and exit checklists." },
  { href: "/hrms/my-records#performance", title: "My Performance", permission: "performance.view_self", subtitle: "View your goals and performance reviews." },
] as const;

export function employeeModules(permissions: Record<string, boolean>) {
  return EMPLOYEE_MODULES.filter(item => permissions[item.permission] === true);
}

export function canOpenEmployeePage(pathname: string, permissions: Record<string, boolean>) {
  // Keep the home reachable so a user can see their remaining access.
  if (pathname === "/hrms" || pathname === "/dashboard") return true;
  return employeeModules(permissions).some(item => item.href.split("#")[0] === pathname);
}
