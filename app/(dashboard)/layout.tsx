import MegaMenuNavbar from "@/components/MegaMenuNavbar";
import DashboardSWRProvider from "@/components/providers/DashboardSWRProvider";
import EnterpriseWorkspaceStrip from "@/components/EnterpriseWorkspaceStrip";
import { APP_CONFIG } from "@/lib/config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSWRProvider>
      <MegaMenuNavbar />
      <EnterpriseWorkspaceStrip />
      <main className="ats-page-inner flex min-h-0 flex-1 flex-col px-4 py-5 md:px-6 md:py-6">
        <div className="min-h-0 flex-1">{children}</div>
        <footer className="mt-10 border-t border-[var(--ats-border)]/80 py-4 text-center text-[11px] text-[var(--ats-text-muted)]">
          © {new Date().getFullYear()} {APP_CONFIG.appName} · {APP_CONFIG.tagline}
        </footer>
      </main>
    </DashboardSWRProvider>
  );
}
