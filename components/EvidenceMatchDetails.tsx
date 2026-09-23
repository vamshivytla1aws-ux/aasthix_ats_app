"use client";

import type { SingleMatchCheckResultPayload } from "@/lib/singleMatch/types";

export function EvidenceMatchDetails({ result, className = "", loadedFromHistoryAt }: {
  result: SingleMatchCheckResultPayload; className?: string; loadedFromHistoryAt?: string | null;
}) {
  const evaluation = result.evidence_evaluation!;
  const positive = result.decision === "Send to interview";
  return <section className={`min-w-0 space-y-4 break-words text-sm ${className}`} aria-label="Evidence-based match result">
    <header className={`rounded-xl border p-4 ${positive ? "border-teal-200 bg-teal-50 text-teal-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">Recruiter guidance | {evaluation.policy_version}</p>
      <h3 className="mt-1 text-xl font-semibold">{result.decision}</h3>
      <p className="mt-2 text-lg font-semibold">{result.match_score == null ? "No percentage assigned" : `${result.match_score}% evidence-based fit`}</p>
      <p className="mt-1">Confidence: {evaluation.status === "evaluated" && evaluation.audit.outcome === "passed" ? "Source and citation checks passed; model confidence is not calibrated." : "Limited until outstanding checks are resolved."}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5">{evaluation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <p className="mt-3 text-xs">Human review required. This result never changes the candidate&apos;s pipeline stage.</p>
    </header>
    {loadedFromHistoryAt && <p className="text-xs">Saved evaluation: {loadedFromHistoryAt}. This historical result has not been recalculated.</p>}
    <p className="text-xs">Resume coverage: {evaluation.coverage.processed_characters.toLocaleString()} / {evaluation.coverage.resume_characters.toLocaleString()} extracted characters. Requirements evaluated: {evaluation.coverage.evaluated_requirements} / {evaluation.coverage.requirements}.</p>
    {evaluation.audit.issues.length > 0 && <div role="status" className="rounded-lg border border-amber-200 p-3"><h4 className="font-semibold">Clarification needed</h4><ul className="list-disc pl-5">{evaluation.audit.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
    {result.match_score != null && evaluation.breakdown.length > 0 && <div><h4 className="font-semibold">Score arithmetic</h4><ul>{evaluation.breakdown.map(row => <li key={row.category}>{row.category}: {row.awarded.toFixed(1)} / {row.max.toFixed(1)}</li>)}</ul>
      {result.applied_caps?.map(cap => <p key={cap.code}>{cap.reason} Maximum fit: {cap.limit}%.</p>)}
    </div>}
    {evaluation.requirements.map(row => <article key={row.id} className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{row.label}</h4><span className="text-xs">{row.category} | {row.depth.replaceAll("_", " ")}{row.critical ? " | Critical" : ""}</span></div>
      <p className="mt-2">{row.depth === "absent" ? "Not demonstrated in this resume." : row.explanation}</p>
      <p className="mt-2 text-xs">JD: {row.jd_quote}</p>
      {row.alternatives.length > 0 && <p className="text-xs">Accepted alternatives: {row.alternatives.join(" OR ")}</p>}
      {row.evidence.map((e, i) => <blockquote key={i} className="my-2 border-l-2 border-teal-500 pl-3">{e.quote}<p className="text-xs">Resume characters {e.start + 1}-{e.end}</p></blockquote>)}
      {row.relevant_months != null && <p>Relevant dated experience: {row.relevant_months} non-overlapping months.</p>}
      {row.question && row.credit < 1 && <p className="mt-2 font-medium">Confirm: {row.question}</p>}
    </article>)}
    <details className="text-xs"><summary className="cursor-pointer">Evaluation provenance</summary>
      <dl className="mt-2 break-all"><dt>Model / prompt</dt><dd>{evaluation.model} / {evaluation.prompt_version}</dd><dt>Resume file SHA-256</dt><dd>{evaluation.source.resume_hash || "Unavailable"}</dd><dt>JD SHA-256</dt><dd>{evaluation.source.jd_hash}</dd><dt>Parser</dt><dd>{evaluation.source.parser_version}</dd><dt>Targeted review</dt><dd>{evaluation.audit.review_used ? "Attempted once" : "Not required"}</dd></dl>
    </details>
  </section>;
}
