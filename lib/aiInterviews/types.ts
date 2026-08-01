export const AI_INTERVIEW_STATUSES = [
  "DRAFT", "SCHEDULED", "READY", "IN_PROGRESS", "PROCESSING", "COMPLETED", "EXPIRED", "CANCELLED", "FAILED",
] as const;

export type AiInterviewStatus = (typeof AI_INTERVIEW_STATUSES)[number];

export type GeneratedInterviewQuestion = {
  question: string;
  skill: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  expectedPoints: string[];
  scoringRubric: Array<{ criterion: string; weight: number }>;
  maxScore: number;
};

export const INTEGRITY_EVENT_TYPES = new Set([
  "INTERVIEW_STARTED", "INTERVIEW_COMPLETED", "TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT",
  "CAMERA_DISABLED", "CAMERA_MUTED", "MICROPHONE_DISABLED", "MICROPHONE_MUTED", "SCREEN_SHARE_STOPPED",
  "FACE_NOT_VISIBLE", "MULTIPLE_FACES", "LOOKING_AWAY", "COPY_ATTEMPT", "PASTE_ATTEMPT",
  "CONNECTION_LOST", "CONNECTION_RESTORED", "RECORDING_INTERRUPTED", "PERMISSION_DENIED", "WARNING_SHOWN",
]);

export const ALLOWED_STATUS_TRANSITIONS: Record<AiInterviewStatus, AiInterviewStatus[]> = {
  DRAFT: ["SCHEDULED", "READY", "CANCELLED"],
  SCHEDULED: ["READY", "IN_PROGRESS", "EXPIRED", "CANCELLED"],
  READY: ["IN_PROGRESS", "EXPIRED", "CANCELLED"],
  IN_PROGRESS: ["PROCESSING", "FAILED", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: ["PROCESSING", "CANCELLED"],
};

export function canTransition(from: AiInterviewStatus, to: AiInterviewStatus) {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
