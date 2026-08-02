import type { BoardPermissionKey } from "@/lib/rbac";

export type PermissionModule = {
  id: string;
  label: string;
  description: string;
  view: BoardPermissionKey[];
  manage: BoardPermissionKey[];
  advanced?: BoardPermissionKey[];
};

export const PERMISSION_CATALOG: PermissionModule[] = [
  { id: "candidates", label: "Candidates", description: "Candidate profiles, resumes, and communication.", view: ["candidates.view"], manage: ["candidates.manage"] },
  { id: "jobs", label: "Jobs", description: "Jobs, hiring teams, and requisition details.", view: ["jobs.view"], manage: ["jobs.manage"] },
  { id: "pipeline", label: "Pipeline", description: "Applications and candidate stage movement.", view: ["pipeline.view"], manage: ["pipeline.manage"] },
  { id: "interviews", label: "Interviews", description: "Human interview schedules and decisions.", view: ["interviews.view"], manage: ["interviews.manage"] },
  { id: "ai_interviews", label: "AI Interviews", description: "AI interview creation, review, and media.", view: ["ai_interviews.view"], manage: ["ai_interviews.create", "ai_interviews.update", "ai_interviews.review"], advanced: ["ai_interviews.cancel", "ai_interviews.delete", "ai_interviews.delete_recording"] },
  { id: "hrms", label: "HRMS", description: "Employee, attendance, leave, documents, payroll, and performance.", view: ["employee_directory.view_self", "attendance.view_self", "leave.view_self", "timesheet.view_self", "salary.view"], manage: ["employee_directory.manage", "attendance.manage_all", "leave.manage_policy", "documents.manage", "performance.manage"], advanced: ["payroll.run", "payroll.approve", "salary.manage"] },
  { id: "finance", label: "Finance", description: "Finance dashboards and ledger management.", view: ["finance.view"], manage: ["finance.manage"] },
  { id: "chat", label: "Chat", description: "Workspace chat and calls.", view: ["chat.view"], manage: [] },
  { id: "analytics", label: "Analytics", description: "Hiring analytics and reports.", view: ["analytics.view"], manage: [] },
  { id: "settings", label: "Settings", description: "Workspace configuration.", view: ["settings.view"], manage: ["settings.manage"] },
  { id: "access", label: "User Administration", description: "Users, invitations, audit, and access control.", view: ["access_control.view", "audit.view"], manage: ["access_control.manage"] },
];
