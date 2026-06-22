import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function TrainingSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-16 text-center text-slate-100">
      <div className="max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-2xl backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Training request received</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          We have received your details and resume. Our team can now review your profile along with the generated
          basic questions for the training intake.
        </p>
      </div>
    </div>
  );
}

