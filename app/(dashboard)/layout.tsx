import MegaMenuNavbar from "@/components/MegaMenuNavbar";
import DashboardSWRProvider from "@/components/providers/DashboardSWRProvider";
import EnterpriseWorkspaceStrip from "@/components/EnterpriseWorkspaceStrip";
import { APP_CONFIG } from "@/lib/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSWRProvider>
      <MegaMenuNavbar />
      <EnterpriseWorkspaceStrip />
      <main className="ats-page-inner ats-workspace-main flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5 md:px-7 md:py-7">
        <div className="min-h-0 flex-1">{children}</div>
        <footer className="mt-10 border-t border-[var(--ats-border)]/80 py-4 text-center text-[11px] text-[var(--ats-text-muted)]">
          © {new Date().getFullYear()} {APP_CONFIG.appName} · {APP_CONFIG.tagline}
        </footer>
      </main>
    </DashboardSWRProvider>
  );
}
