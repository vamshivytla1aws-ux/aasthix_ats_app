import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-10 flex flex-col">
      <div className="mx-auto max-w-md w-full flex-1">{children}</div>
      <footer className="mt-10 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} vamshi (aasthix talent)
      </footer>
    </div>
  );
}

