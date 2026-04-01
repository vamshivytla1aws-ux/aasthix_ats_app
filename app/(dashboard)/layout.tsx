import MegaMenuNavbar from "@/components/MegaMenuNavbar";
import { DashboardThemeProvider } from "@/components/DashboardThemeProvider";
import DashboardSWRProvider from "@/components/providers/DashboardSWRProvider";
import { APP_CONFIG } from "@/lib/config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardThemeProvider>
      <DashboardSWRProvider>
      <MegaMenuNavbar />
      <main className="ats-page-inner flex min-h-0 flex-1 flex-col px-4 py-4 md:px-6 md:py-5">
        <div className="min-h-0 flex-1">{children}</div>
        <footer className="mt-8 border-t border-slate-200/80 py-4 text-center text-[11px] text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
          © {new Date().getFullYear()} {APP_CONFIG.appName} · {APP_CONFIG.tagline}
        </footer>
      </main>
      </DashboardSWRProvider>
    </DashboardThemeProvider>
  );
}
