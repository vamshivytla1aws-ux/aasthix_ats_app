type CandidateHeaderData = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  current_salary: number | null;
  expected_salary: number | null;
  notice_period?: string | null;
  status: "Active" | "Placed";
};

type Density = "comfortable" | "compact" | "ultra";

function formatINR(value: number | null) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  }
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--ats-text)]">{value}</div>
    </div>
  );
}

export default function CandidateHeader({
  candidate,
  density = "ultra",
}: {
  candidate: CandidateHeaderData;
  density?: Density;
}) {
  const statusTone =
    candidate.status === "Placed"
      ? "border-[color:rgb(16_185_129_/_0.2)] bg-[color:rgb(16_185_129_/_0.14)] text-[var(--ats-success)]"
      : "border-[color:rgb(37_99_235_/_0.2)] bg-[color:rgb(37_99_235_/_0.14)] text-[var(--ats-primary)]";

  const titleSize = density === "comfortable" ? "text-2xl" : "text-xl";

  return (
    <section className="rounded-[1.4rem] border border-[var(--ats-border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ats-primary)_14%,var(--ats-bg-elevated)),var(--ats-bg-elevated)_45%,color-mix(in_oklab,var(--ats-accent)_8%,var(--ats-bg-elevated)))] p-5 shadow-[var(--ats-shadow-md)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ats-text-soft)]">
            Candidate command center
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className={`${titleSize} font-semibold tracking-tight text-[var(--ats-text)]`}>{candidate.name}</h1>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
              {candidate.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--ats-text-muted)]">
            <span>{candidate.email || "No email"}</span>
            <span>{candidate.phone || "No phone"}</span>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[520px]">
          <SummaryMetric label="Current salary" value={formatINR(candidate.current_salary)} />
          <SummaryMetric label="Expected salary" value={formatINR(candidate.expected_salary)} />
          <SummaryMetric label="Notice period" value={candidate.notice_period?.trim() || "—"} />
        </div>
      </div>
    </section>
  );
}
