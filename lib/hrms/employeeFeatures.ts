import type { BoardPermissionKey } from "@/lib/rbac";

export const EMPLOYEE_FEATURES: Array<{ id: string; label: string; view: BoardPermissionKey; actions: BoardPermissionKey[] }> = [
  { id: "profile", label: "Profile", view: "employee_directory.view_self", actions: [] },
  { id: "payslips", label: "Payslips", view: "salary.view", actions: [] },
  { id: "documents", label: "Documents", view: "documents.view_self", actions: [] },
  { id: "leave", label: "Leave", view: "leave.view_self", actions: ["leave.apply_self"] },
  { id: "attendance", label: "Attendance", view: "attendance.view_self", actions: ["attendance.manage_self"] },
  { id: "timesheets", label: "Timesheets", view: "timesheet.view_self", actions: ["timesheet.manage_self"] },
  { id: "onboarding", label: "Onboarding", view: "onboarding_exit.view_self", actions: [] },
  { id: "performance", label: "Performance", view: "performance.view_self", actions: [] },
];

export function featurePermissionPatch(id: string, enabled: boolean): Record<string, boolean> {
  const feature = EMPLOYEE_FEATURES.find(item => item.id === id);
  if (!feature) throw new Error("Unknown HRMS feature.");
  return Object.fromEntries([feature.view, ...feature.actions].map(key => [key, enabled]));
}

export function enforceSelfServiceDependencies(permissions: Record<string, boolean>) {
  for (const feature of EMPLOYEE_FEATURES) {
    if (!permissions[feature.view]) for (const action of feature.actions) permissions[action] = false;
  }
  return permissions;
}
