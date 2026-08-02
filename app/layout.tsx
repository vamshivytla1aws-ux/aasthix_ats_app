import type { Metadata } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";
import { DashboardThemeProvider } from "@/components/DashboardThemeProvider";
import { getPublicBaseUrl } from "@/lib/publicUrl";
import { Manrope, Sora } from "next/font/google";
import { UI_REFRESH_V2_ENABLED } from "@/lib/featureFlags";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-ats-body", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-ats-heading", display: "swap" });

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
    <html lang="en" className={`${manrope.variable} ${sora.variable}`}>
      <body className={`min-h-screen bg-[var(--ats-bg-page)] text-[var(--ats-text)] ${UI_REFRESH_V2_ENABLED ? "ui-refresh-v2" : ""}`}>
        <DashboardThemeProvider>{children}</DashboardThemeProvider>
      </body>
    </html>
  );
}
