"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { canOpenEmployeePage } from "@/lib/hrms/selfService";
import { UI } from "@/lib/ui";

export default function EmployeeWorkspaceBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, error } = useSWR<{ user: { role: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const employee = me?.user.role === "employee";
  React.useEffect(() => { if (employee && pathname === "/dashboard") router.replace("/hrms"); }, [employee, pathname, router]);
  if (!me) return <p className="p-4 text-sm">{error ? "Unable to load your access. Please sign in again." : "Loading your workspace…"}</p>;
  if (employee && pathname === "/dashboard") return <p className="p-4">Opening My HRMS…</p>;
  if (employee && !canOpenEmployeePage(pathname, me.permissions || {})) return <div className={UI.card + " p-6"}>
    <h1 className="font-semibold">This area is not available with your employee access.</h1>
    <p className="mt-2 text-sm">Contact HR if you need access to another HRMS feature.</p>
    <Link href="/hrms" className={UI.primaryButton + " mt-4 inline-block"}>Back to My HRMS</Link>
  </div>;
  return <>{children}</>;
}
