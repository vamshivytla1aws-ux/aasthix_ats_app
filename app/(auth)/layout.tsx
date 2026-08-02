import type { Metadata } from "next";
import BrandLogo from "@/components/BrandLogo";
import { APP_CONFIG } from "@/lib/config";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile-vh-screen relative overflow-hidden bg-[var(--ats-bg-page-accent)] px-4 py-4 text-[var(--ats-text)] sm:p-6">
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-teal-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/50 bg-[var(--ats-bg-elevated)] shadow-[0_32px_90px_-46px_rgba(16,42,46,0.55)] lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#102a2e,#174f4e_64%,#1f716b)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative">
            <div className="flex items-center gap-3"><BrandLogo size={50} className="rounded-xl bg-white/10 p-1 ring-1 ring-white/20" /><div><div className="font-display text-lg font-semibold">{APP_CONFIG.appName}</div><div className="text-xs text-white/65">Talent operations, thoughtfully connected</div></div></div>
            <div className="mt-20 max-w-md"><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-50"><Sparkles className="h-3.5 w-3.5" />Executive talent workspace</div><h1 className="mt-5 font-display text-4xl font-semibold leading-tight">Make every hiring decision with clarity.</h1><p className="mt-4 text-base leading-7 text-white/72">Move from sourcing to onboarding in one calm, secure workspace built for recruiting teams.</p></div>
          </div>
          <div className="relative grid gap-3 text-sm text-white/75">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-teal-200" />Connected hiring and HR workflows</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-teal-200" />Evidence-backed AI assistance</div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-200" />Role-aware, auditable access</div>
          </div>
        </aside>
        <section className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-md">{children}</div>
          <footer className="mt-8 text-center text-[11px] text-[var(--ats-text-soft)]">&copy; {new Date().getFullYear()} AASTHIX TALENT</footer>
        </section>
      </div>
    </div>
  );
}
