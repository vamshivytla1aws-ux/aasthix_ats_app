import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--ats-bg-page)] px-4 py-6 text-[var(--ats-text)] sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col sm:min-h-[calc(100vh-5rem)]">
        <div className="flex-1">{children}</div>
      </div>
      <footer className="mt-6 text-center text-xs text-[var(--ats-text-muted)] sm:mt-10">
        &copy; {new Date().getFullYear()} AASTHIX TALENT
      </footer>
    </div>
  );
}
