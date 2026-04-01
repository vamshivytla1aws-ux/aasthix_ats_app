import type { Metadata } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
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
        {children}
      </body>
    </html>
  );
}
