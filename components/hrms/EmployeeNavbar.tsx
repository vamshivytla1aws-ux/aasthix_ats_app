"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { employeeModules } from "@/lib/hrms/selfService";
import { UI } from "@/lib/ui";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";

export default function EmployeeNavbar({ name, permissions }: { name: string | null; permissions: Record<string, boolean> }) {
  const pathname = usePathname();
  const { data: me } = useSWR<{ user: { full_name: string }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/employee/login");
  }
  return <header className="border-b border-[var(--ats-border)] bg-[var(--ats-bg-elevated)]">
    <div className="ats-page-inner px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/hrms" className="font-semibold text-lg">AASTHIX · My HRMS</Link>
        <div className="flex items-center gap-3"><span className="hidden text-sm sm:block">{me?.user.full_name || name}</span><button type="button" onClick={() => void logout()} className={UI.secondaryButton}>Sign out</button></div>
      </div>
      <nav aria-label="Employee navigation" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {employeeModules(me?.permissions || permissions).filter(item => !item.href.includes("#")).map(item => <Link key={item.href} href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${pathname === item.href ? "bg-teal-700 text-white" : "hover:bg-teal-50 text-[var(--ats-text)]"}`}>{item.title}</Link>)}
      </nav>
    </div>
  </header>;
}
