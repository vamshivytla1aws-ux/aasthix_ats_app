export const aiInterviewConfig = {
  enabled: process.env.AI_INTERVIEW_ENABLED !== "false",
  recordingEnabled: process.env.AI_INTERVIEW_RECORDING_ENABLED !== "false",
  screenShareEnabled: process.env.AI_INTERVIEW_SCREEN_SHARE_ENABLED === "true",
  faceMonitoringEnabled: process.env.AI_INTERVIEW_FACE_MONITORING_ENABLED !== "false",
  gazeMonitoringEnabled: process.env.AI_INTERVIEW_GAZE_MONITORING_ENABLED !== "false",
  fullscreenRequired: process.env.AI_INTERVIEW_FULLSCREEN_REQUIRED !== "false",
  videoRetentionCount: Math.max(0, Number(process.env.AI_INTERVIEW_VIDEO_RETENTION_COUNT || 3)),
  recordingRoot: process.env.AI_INTERVIEW_RECORDING_ROOT || "/data/ai-interviews",
  model: process.env.AI_INTERVIEW_MODEL || "gpt-4o",
  evaluationModel: process.env.AI_INTERVIEW_EVALUATION_MODEL || process.env.AI_INTERVIEW_MODEL || "gpt-4o",
  transcriptionModel: process.env.AI_INTERVIEW_TRANSCRIPTION_MODEL || "whisper-1",
  lookAwayWarningLimit: Math.max(1, Number(process.env.AI_INTERVIEW_LOOK_AWAY_WARNING_LIMIT || 5)),
  tabSwitchWarningLimit: Math.max(1, Number(process.env.AI_INTERVIEW_TAB_SWITCH_WARNING_LIMIT || 3)),
  maxChunkBytes: Math.max(256_000, Number(process.env.AI_INTERVIEW_MAX_CHUNK_BYTES || 8_000_000)),
  maxRecordingBytes: Math.max(10_000_000, Number(process.env.AI_INTERVIEW_MAX_RECORDING_BYTES || 1_500_000_000)),
  maxSnapshotBytes: Math.max(100_000, Number(process.env.AI_INTERVIEW_MAX_SNAPSHOT_BYTES || 3_000_000)),
  storeCandidateIp: process.env.AI_INTERVIEW_STORE_IP === "true",
};

export function requireAiInterviewEnabled() {
  if (!aiInterviewConfig.enabled) {
    throw Object.assign(new Error("AI Interviews are disabled."), { status: 404 });
  }
}
