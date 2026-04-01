/** Pure rules — safe to import from client components. */

export function jobStatusRequiresDispositionReason(status: string): boolean {
  const s = status.trim();
  return s === "Closed" || s === "Filled" || s === "On Hold";
}
