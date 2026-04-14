import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--ats-bg-page)] px-4 py-10 text-[var(--ats-text)]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col">
        <div className="flex-1">{children}</div>
      </div>
      <footer className="mt-10 text-center text-xs text-[var(--ats-text-muted)]">
        &copy; {new Date().getFullYear()} AASTHIX TALENT
      </footer>
    </div>
  );
}
