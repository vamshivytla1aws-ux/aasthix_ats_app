import { apiFetchJson } from "@/lib/apiClient";

/** Default SWR fetcher for dashboard JSON APIs (uses session cookie). */
export async function dashboardFetcher<T = unknown>(url: string): Promise<T> {
  return apiFetchJson<T>(url);
}
