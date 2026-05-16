import type { ToastTone } from "@/components/Toast";

export type OperationTone = "success" | "partial" | "blocked" | "error" | "info";

export type OperationFeedbackPayload = {
  operation_status?: OperationTone;
  user_message?: string;
  hint?: string;
  trace_id?: string;
};

export function toneFromStatus(status?: string | null): OperationTone {
  if (status === "success" || status === "partial" || status === "blocked" || status === "error" || status === "info") {
    return status;
  }
  return "success";
}

export function toastMsForTone(tone: OperationTone, successMs = 1200) {
  if (tone === "success") return successMs;
  if (tone === "partial") return 2500;
  if (tone === "blocked" || tone === "error") return 3500;
  return 2000;
}

export function toToastTone(tone: OperationTone): ToastTone {
  return tone;
}

