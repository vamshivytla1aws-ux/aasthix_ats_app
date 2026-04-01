type CandidateJobInfo = {
  job_title: string | null;
  stage: string | null;
  status: "Active" | "Placed";
  current_interview_round_label?: string | null;
  current_interview_round_order?: number | null;
};

type Density = "comfortable" | "compact" | "ultra";

export default function JobInfo({
  candidate,
  density = "ultra",
}: {
  candidate: CandidateJobInfo;
  density?: Density;
}) {
  const rootPad = density === "comfortable" ? "py-3" : density === "compact" ? "py-2" : "py-1";
  const titleClass = density === "ultra" ? "text-[10px]" : "text-xs";
  const rowPad = density === "comfortable" ? "py-1" : "py-0.5";
  const labelClass = density === "ultra" ? "text-[10px]" : "text-xs";

  return (
    <div className={["border-b border-gray-200", rootPad].join(" ")}>
      <p className={["mb-0.5 font-medium text-gray-700", titleClass].join(" ")}>Job Info</p>
      <div className="space-y-0.5 text-xs">
        <div className={["flex items-center justify-between gap-2 hover:bg-gray-50 transition", rowPad].join(" ")}>
          <span className={[labelClass, "text-gray-500"].join(" ")}>Job Title</span>
          <span className="font-medium text-gray-800">{candidate.job_title || "Not assigned"}</span>
        </div>
        <div className={["flex items-center justify-between gap-2 hover:bg-gray-50 transition", rowPad].join(" ")}>
          <span className={[labelClass, "text-gray-500"].join(" ")}>Pipeline Stage</span>
          <span className="font-medium text-gray-800">{candidate.stage || "—"}</span>
        </div>
        <div className={["flex items-center justify-between gap-2 hover:bg-gray-50 transition", rowPad].join(" ")}>
          <span className={[labelClass, "text-gray-500"].join(" ")}>Interview Round</span>
          <span className="font-medium text-gray-800">
            {candidate.current_interview_round_label || `Round ${candidate.current_interview_round_order ?? 1}`}
          </span>
        </div>
        <div className={["flex items-center justify-between gap-2 hover:bg-gray-50 transition", rowPad].join(" ")}>
          <span className={[labelClass, "text-gray-500"].join(" ")}>Status</span>
          <span className="font-medium text-gray-800">{candidate.status}</span>
        </div>
      </div>
    </div>
  );
}

