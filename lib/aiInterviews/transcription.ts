import fs from "node:fs/promises";
import path from "node:path";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";
import { getAnswerAudioStat } from "@/lib/aiInterviews/storage";

export function shouldTranscribeAnswer(browserTranscript: string, hasAudio: boolean) {
  if (!hasAudio || aiInterviewConfig.transcriptionMode === "off") return false;
  if (aiInterviewConfig.transcriptionMode === "always") return true;
  return browserTranscript.trim().length < aiInterviewConfig.transcriptionMinChars;
}

export async function transcribeAnswerAudio(audioPath: string, mimeType: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const media = await getAnswerAudioStat(audioPath);
  if (media.stat.size > aiInterviewConfig.maxAnswerAudioBytes) throw new Error("Answer audio is too large for transcription");
  const bytes = await fs.readFile(media.path);
  const form = new FormData();
  form.append("model", aiInterviewConfig.transcriptionModel);
  form.append("response_format", "json");
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType || "audio/webm" }), path.basename(media.path));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: controller.signal });
    if (!response.ok) throw new Error(`OpenAI transcription failed (${response.status})`);
    const payload = await response.json() as { text?: unknown };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) throw new Error("OpenAI transcription returned no text");
    return { text, model: aiInterviewConfig.transcriptionModel };
  } finally {
    clearTimeout(timer);
  }
}
