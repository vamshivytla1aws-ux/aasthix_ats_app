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

export default function CandidateHeader({
  candidate,
  density = "ultra",
}: {
  candidate: CandidateHeaderData;
  density?: Density;
}) {
  const badgeClass =
    candidate.status === "Placed"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-blue-100 text-blue-700";

  const spacingClass = density === "comfortable" ? "py-3" : density === "compact" ? "py-2" : "py-1";
  const titleClass = density === "comfortable" ? "text-lg" : density === "compact" ? "text-base" : "text-base";
  const metaClass = density === "comfortable" ? "text-sm" : "text-xs";
  const salaryLabelClass = density === "ultra" ? "text-[10px]" : "text-xs";
  const badgeSize = density === "comfortable" ? "px-3 py-1 text-xs" : density === "compact" ? "px-2.5 py-0.5 text-xs" : "px-2 py-0.5 text-[11px]";

  return (
    <div className={["border-b border-gray-200", spacingClass].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className={[titleClass, "font-semibold text-gray-800 leading-5"].join(" ")}>{candidate.name}</h1>
          <p className={[metaClass, "text-gray-500 leading-4"].join(" ")}>
            {candidate.email || "—"}
            {candidate.phone ? ` • ${candidate.phone}` : ""}
          </p>
        </div>
        <span className={["inline-flex rounded-full font-semibold", badgeSize, badgeClass].join(" ")}>
          {candidate.status}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-gray-700">
        <span className={[salaryLabelClass, "text-gray-500"].join(" ")}>Salary</span>{" "}
        <span className="font-medium">
          {formatINR(candidate.current_salary)} → {formatINR(candidate.expected_salary)}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-gray-700">
        <span className={[salaryLabelClass, "text-gray-500"].join(" ")}>Notice</span>{" "}
        <span className="font-medium">{candidate.notice_period?.trim() || "—"}</span>
      </div>
    </div>
  );
}

