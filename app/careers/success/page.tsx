import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CareersSuccessPage({
  searchParams,
}: {
  searchParams: { title?: string };
}) {
  const title = typeof searchParams?.title === "string" ? decodeURIComponent(searchParams.title) : "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-16 text-center text-slate-100">
      <div className="max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-2xl backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Application received</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Thank you for applying
          {title ? (
            <>
              {" "}
              for <span className="font-medium text-slate-200">{title}</span>
            </>
          ) : null}
          . Our team will review your profile and reach out if there is a strong match.
        </p>
        <p className="mt-4 text-xs text-slate-500">
          If email confirmation is enabled on the server, you will receive an acknowledgment shortly.
        </p>
        <Link
          href="/careers"
          className="mt-8 inline-flex rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          Back to openings
        </Link>
      </div>
    </div>
  );
}
