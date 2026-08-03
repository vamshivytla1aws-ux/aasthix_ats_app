import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";
import { query } from "@/lib/db";

function safeSegment(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid recording identifier");
  return value;
}

function rootPath() {
  return path.resolve(aiInterviewConfig.recordingRoot);
}

function ensureInsideRoot(target: string) {
  const root = `${rootPath()}${path.sep}`;
  const resolved = path.resolve(target);
  if (!`${resolved}${resolved.endsWith(path.sep) ? "" : path.sep}`.startsWith(root) && resolved !== rootPath()) {
    throw new Error("Invalid recording path");
  }
  return resolved;
}

export async function storeRecordingChunk(input: { interviewId: number; uploadId: string; sequence: number; bytes: Buffer }) {
  const uploadId = safeSegment(input.uploadId);
  if (input.bytes.byteLength > aiInterviewConfig.maxChunkBytes) throw new Error("Recording chunk is too large");
  const usage = await query(
    `SELECT COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM ai_interview_recording_chunks WHERE interview_id=$1 AND upload_id=$2`,
    [input.interviewId, uploadId]
  );
  if (Number(usage.rows[0]?.bytes || 0) + input.bytes.byteLength > aiInterviewConfig.maxRecordingBytes) {
    throw new Error("Recording exceeds the configured size limit");
  }
  const dir = ensureInsideRoot(path.join(rootPath(), "staging", String(input.interviewId), uploadId));
  await fs.mkdir(dir, { recursive: true });
  const target = ensureInsideRoot(path.join(dir, `${String(input.sequence).padStart(8, "0")}.chunk`));
  await fs.writeFile(target, input.bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const checksum = crypto.createHash("sha256").update(input.bytes).digest("hex");
  await query(
    `INSERT INTO ai_interview_recording_chunks (interview_id, upload_id, sequence_number, size_bytes, checksum, storage_path)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (interview_id, upload_id, sequence_number) DO NOTHING`,
    [input.interviewId, uploadId, input.sequence, input.bytes.byteLength, checksum, target]
  );
  return { sequence: input.sequence, checksum };
}

export async function finalizeRecording(input: { interviewId: number; uploadId: string; mimeType: string; durationSeconds?: number }) {
  const uploadId = safeSegment(input.uploadId);
  const chunks = await query(
    `SELECT sequence_number, storage_path FROM ai_interview_recording_chunks
      WHERE interview_id = $1 AND upload_id = $2 ORDER BY sequence_number`,
    [input.interviewId, uploadId]
  );
  if (!chunks.rowCount) throw new Error("No recording chunks were uploaded");
  const finalDir = ensureInsideRoot(path.join(rootPath(), "recordings"));
  await fs.mkdir(finalDir, { recursive: true });
  const extension = input.mimeType.includes("mp4") ? "mp4" : "webm";
  const finalPath = ensureInsideRoot(path.join(finalDir, `interview-${input.interviewId}-${crypto.randomUUID()}.${extension}`));
  const handle = await fs.open(finalPath, "wx");
  try {
    for (const row of chunks.rows) {
      const bytes = await fs.readFile(ensureInsideRoot(String(row.storage_path)));
      await handle.write(bytes);
    }
  } finally {
    await handle.close();
  }
  const stat = await fs.stat(finalPath);
  await query(
    `UPDATE ai_interviews SET video_status='UPLOADED', recording_path=$2, recording_mime_type=$3,
       recording_size=$4, recording_duration_seconds=$5, updated_at=NOW() WHERE id=$1`,
    [input.interviewId, finalPath, input.mimeType, stat.size, input.durationSeconds || null]
  );
  await fs.rm(ensureInsideRoot(path.join(rootPath(), "staging", String(input.interviewId), uploadId)), { recursive: true, force: true });
  await query(`DELETE FROM ai_interview_recording_chunks WHERE interview_id=$1 AND upload_id=$2`, [input.interviewId, uploadId]);
  return { path: finalPath, size: stat.size };
}

export async function storeInterviewSnapshot(input: { interviewId: number; bytes: Buffer; mimeType: string }) {
  if (input.mimeType !== "image/jpeg") throw new Error("Only JPEG interview snapshots are supported");
  if (!input.bytes.byteLength || input.bytes.byteLength > aiInterviewConfig.maxSnapshotBytes) {
    throw new Error("Interview snapshot exceeds the configured size limit");
  }
  const finalDir = ensureInsideRoot(path.join(rootPath(), "snapshots"));
  await fs.mkdir(finalDir, { recursive: true });
  const finalPath = ensureInsideRoot(path.join(finalDir, `interview-${input.interviewId}-${crypto.randomUUID()}.jpg`));
  await fs.writeFile(finalPath, input.bytes, { flag: "wx" });
  const existing = await query(`SELECT snapshot_path FROM ai_interviews WHERE id=$1`, [input.interviewId]);
  const previousPath = existing.rows[0]?.snapshot_path ? String(existing.rows[0].snapshot_path) : null;
  await query(
    `UPDATE ai_interviews SET snapshot_status='CAPTURED',snapshot_path=$2,snapshot_mime_type=$3,
       snapshot_size=$4,snapshot_captured_at=NOW(),updated_at=NOW() WHERE id=$1`,
    [input.interviewId, finalPath, input.mimeType, input.bytes.byteLength]
  );
  if (previousPath && previousPath !== finalPath) {
    await fs.rm(ensureInsideRoot(previousPath), { force: true }).catch(() => undefined);
  }
  return { path: finalPath, size: input.bytes.byteLength };
}

export async function storeDesktopSnapshot(input: { interviewId: number; bytes: Buffer; mimeType: string }) {
  if (input.mimeType !== "image/jpeg") throw new Error("Only JPEG desktop snapshots are supported");
  if (!input.bytes.byteLength || input.bytes.byteLength > aiInterviewConfig.maxSnapshotBytes) {
    throw new Error("Desktop snapshot exceeds the configured size limit");
  }
  const finalDir = ensureInsideRoot(path.join(rootPath(), "desktop_snapshots"));
  await fs.mkdir(finalDir, { recursive: true });
  const finalPath = ensureInsideRoot(path.join(finalDir, `desktop-${input.interviewId}-${crypto.randomUUID()}.jpg`));
  await fs.writeFile(finalPath, input.bytes, { flag: "wx" });
  await query(
    `INSERT INTO ai_interview_desktop_snapshots (interview_id, snapshot_path, snapshot_mime_type, snapshot_size)
     VALUES ($1, $2, $3, $4)`,
    [input.interviewId, finalPath, input.mimeType, input.bytes.byteLength]
  );
  return { path: finalPath, size: input.bytes.byteLength };
}

export async function storeAnswerAudio(input: { interviewId: number; questionId: number; bytes: Buffer; mimeType: string }) {
  if (!input.mimeType.startsWith("audio/") && !input.mimeType.startsWith("video/webm")) throw new Error("Unsupported answer audio type");
  if (!input.bytes.byteLength || input.bytes.byteLength > aiInterviewConfig.maxAnswerAudioBytes) throw new Error("Answer audio exceeds the configured size limit");
  const dir = ensureInsideRoot(path.join(rootPath(), "answers", String(input.interviewId)));
  await fs.mkdir(dir, { recursive: true });
  const extension = input.mimeType.includes("mp4") ? "mp4" : input.mimeType.includes("mpeg") ? "mp3" : "webm";
  const target = ensureInsideRoot(path.join(dir, `question-${input.questionId}-${crypto.randomUUID()}.${extension}`));
  await fs.writeFile(target, input.bytes, { flag: "wx" });
  const previous = await query(`SELECT answer_audio_path FROM ai_interview_answers WHERE interview_id=$1 AND question_id=$2`, [input.interviewId, input.questionId]);
  const result = await query(
    `UPDATE ai_interview_answers SET answer_audio_path=$3,answer_audio_mime_type=$4,answer_audio_size=$5,
       transcript_status='PENDING',updated_at=NOW() WHERE interview_id=$1 AND question_id=$2 RETURNING id`,
    [input.interviewId, input.questionId, target, input.mimeType, input.bytes.byteLength]
  );
  if (!result.rowCount) {
    await fs.rm(target, { force: true });
    throw new Error("Answer record is unavailable");
  }
  const previousPath = previous.rows[0]?.answer_audio_path ? String(previous.rows[0].answer_audio_path) : null;
  if (previousPath && previousPath !== target) await fs.rm(ensureInsideRoot(previousPath), { force: true }).catch(() => undefined);
  return { path: target, size: input.bytes.byteLength };
}

export async function enforceRecordingRetention() {
  const keep = aiInterviewConfig.videoRetentionCount;
  const rows = await query(
    `SELECT id, recording_path FROM ai_interviews
      WHERE video_status='UPLOADED' AND recording_path IS NOT NULL
      ORDER BY completed_at DESC NULLS LAST, id DESC OFFSET $1`,
    [keep]
  );
  for (const row of rows.rows) {
    try { await fs.rm(ensureInsideRoot(String(row.recording_path)), { force: true }); } catch (error) { console.error("[ai-interviews] retention delete failed", error); continue; }
    await query(
      `UPDATE ai_interviews SET video_status='DELETED_BY_RETENTION', recording_path=NULL, recording_size=NULL, updated_at=NOW() WHERE id=$1`,
      [row.id]
    );
  }
  return rows.rowCount || 0;
}

export async function getRecordingStat(recordingPath: string) {
  const safePath = ensureInsideRoot(recordingPath);
  return { path: safePath, stat: await fs.stat(safePath) };
}

export async function getSnapshotStat(snapshotPath: string) {
  const safePath = ensureInsideRoot(snapshotPath);
  return { path: safePath, stat: await fs.stat(safePath) };
}

export async function getAnswerAudioStat(audioPath: string) {
  const safePath = ensureInsideRoot(audioPath);
  return { path: safePath, stat: await fs.stat(safePath) };
}

export async function removeAnswerAudio(audioPath: string) {
  await fs.rm(ensureInsideRoot(audioPath), { force: true });
}

export async function deleteInterviewMedia(input: { interviewId: number; recordingPath?: string | null; snapshotPath?: string | null }) {
  const targets = [input.recordingPath, input.snapshotPath].filter((value): value is string => Boolean(value));
  for (const target of targets) {
    await fs.rm(ensureInsideRoot(target), { force: true }).catch(error => {
      console.error("[ai-interviews] media delete failed", error);
    });
  }
  await fs.rm(ensureInsideRoot(path.join(rootPath(), "staging", String(input.interviewId))), { recursive: true, force: true }).catch(error => {
    console.error("[ai-interviews] staging delete failed", error);
  });
  await fs.rm(ensureInsideRoot(path.join(rootPath(), "answers", String(input.interviewId))), { recursive: true, force: true }).catch(error => {
    console.error("[ai-interviews] answer audio delete failed", error);
  });
}
