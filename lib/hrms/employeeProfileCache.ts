/** Refresh directory variants, the selected profile's setup/login, and self service. */
export function isEmployeeProfileCache(key: unknown, employeeId: number) {
  return typeof key === "string" && (
    key.split("?")[0] === "/api/hrms/employees" || key === "/api/hrms/profile/me" ||
    key === `/api/hrms/employees/${employeeId}/setup` || key === `/api/hrms/employees/${employeeId}/login`
  );
}
