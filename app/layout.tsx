import type { Metadata } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";
import { DashboardThemeProvider } from "@/components/DashboardThemeProvider";
import { getPublicBaseUrl } from "@/lib/publicUrl";

const metadataBase = (() => {
  try {
    return new URL(getPublicBaseUrl());
  } catch {
    return undefined;
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: `${APP_CONFIG.appName} · ${APP_CONFIG.tagline}`,
  description: `${APP_CONFIG.appName} — ${APP_CONFIG.tagline}. Recruiting, pipeline, and workspace tracking.`,
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--ats-bg-page)] text-slate-900">
        <DashboardThemeProvider>{children}</DashboardThemeProvider>
      </body>
    </html>
  );
}
