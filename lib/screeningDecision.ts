/** Pure decision helper — tested without DB / OpenAI. */
export function nextStageFromScreeningScore(score: number): "Interview" | "Screening Failed" {
  return score >= 70 ? "Interview" : "Screening Failed";
}
