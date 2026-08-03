"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  BrainCircuit,
  Camera,
  CheckCircle2,
  Clock,
  Mic,
  MonitorUp,
  ShieldCheck,
  Wifi,
} from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Interview = {
  id: number;
  title: string;
  instructions: string;
  duration_minutes: number;
  question_count?: number;
  candidate_name: string;
  job_title: string;
  status: string;
  interview_mode?: "ADAPTIVE" | "FIXED";
  recording_enabled: boolean;
  screen_share_enabled: boolean;
  fullscreen_required: boolean;
  camera_required: boolean;
  microphone_required: boolean;
  face_monitoring_enabled: boolean;
  gaze_monitoring_enabled: boolean;
  face_missing_threshold_seconds?: number;
  answer_audio_enabled?: boolean;
  requirements?: Record<string, boolean>;
};
type Question = {
  id: number;
  order_number: number;
  question_text: string;
  skill_name: string;
  difficulty: string;
  question_type?: "TECHNICAL" | "CODING";
  starter_code?: string | null;
  coding_language?: string;
};
type Step = "loading" | "intro" | "system" | "interview" | "thanks" | "cancelled" | "error";

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => any;
    SpeechRecognition?: new () => any;
  }
}

export default function CandidateAiInterviewRoom({
  secureToken,
}: {
  secureToken?: string;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [interview, setInterview] = useState<Interview | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [warning, setWarning] = useState("");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Code editor state for CODING questions
  const [codeAnswer, setCodeAnswer] = useState("");
  const mediaRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const answerAudioRecorderRef = useRef<MediaRecorder | null>(null);
  const answerAudioChunksRef = useRef<Blob[]>([]);
  const uploadIdRef = useRef("");
  const chunkRef = useRef(0);
  const uploadChain = useRef<Promise<unknown>>(Promise.resolve());
  const startedAt = useRef(0);
  const questionStartedAt = useRef(0);
  const recognitionRef = useRef<any>(null);
  const snapshotCapturedRef = useRef(false);
  const resumeQuestionIndexRef = useRef(0);
  const finishInterviewRef = useRef<() => Promise<void>>(async () => {});

  const loadState = useCallback(async () => {
    const r = await fetch("/api/ai-interview/state", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Unable to load interview");
    setInterview(d.interview);
    const loadedQuestions: Question[] = d.questions || [];
    const completedIds = new Set(
      (d.answers || [])
        .filter((item: any) => item.answer_completed_at)
        .map((item: any) => Number(item.question_id)),
    );
    const firstUnanswered = loadedQuestions.findIndex(
      (item) => !completedIds.has(Number(item.id)),
    );
    resumeQuestionIndexRef.current =
      firstUnanswered >= 0
        ? firstUnanswered
        : Math.max(0, loadedQuestions.length - 1);
    setCurrent(resumeQuestionIndexRef.current);
    setQuestions(loadedQuestions);
    const elapsed = d.interview.started_at
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(d.interview.started_at).getTime()) / 1000,
          ),
        )
      : 0;
    setTimeLeft(
      Math.max(0, Number(d.interview.duration_minutes) * 60 - elapsed),
    );
    setStep(d.consented ? "system" : "intro");
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        if (secureToken) {
          const r = await fetch("/api/ai-interview/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: secureToken }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Unable to open interview");
          window.history.replaceState({}, "", "/ai-interview/session");
        }
        await loadState();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to open interview");
        setStep("error");
      }
    })();
  }, [secureToken, loadState]);

  const sendEvent = useCallback(
    (event_type: string, metadata: Record<string, unknown> = {}) => {
      void fetch("/api/ai-interview/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type,
          occurred_at: new Date().toISOString(),
          evidence_timestamp_seconds: startedAt.current
            ? Math.round((Date.now() - startedAt.current) / 1000)
            : 0,
          question_id: questions[current]?.id || null,
          metadata,
        }),
      }).catch(() => {});
    },
    [questions, current],
  );
  useEffect(() => {
    if (step !== "interview") return;
    const stopVoice = () => {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
    };
    const hidden = () => {
      if (document.hidden) {
        stopVoice();
        sendEvent("TAB_HIDDEN");
        setWarning(
          "Window switching was detected. Voice input has been paused. Return here and restart voice transcription.",
        );
      }
    };
    const blur = () => {
      stopVoice();
      sendEvent("WINDOW_BLUR");
      setWarning("Window switching was detected. Voice input has been paused.");
    };
    const fullscreen = () => {
      if (interview?.fullscreen_required && !document.fullscreenElement) {
        stopVoice();
        sendEvent("FULLSCREEN_EXIT");
        setWarning(
          "Fullscreen was exited. Voice input has been paused. Return to fullscreen before continuing.",
        );
      }
    };
    const offline = () => sendEvent("CONNECTION_LOST");
    const online = () => sendEvent("CONNECTION_RESTORED");
    const copy = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent("COPY_ATTEMPT");
    };
    const paste = (e: ClipboardEvent) => {
      e.preventDefault();
      sendEvent("PASTE_ATTEMPT");
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    document.addEventListener("fullscreenchange", fullscreen);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("copy", copy);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("copy", copy);
      document.removeEventListener("paste", paste);
    };
  }, [step, sendEvent, interview]);
  useEffect(() => { finishInterviewRef.current = finishInterview; });
  useEffect(() => {
    if (step !== "interview") return;
    const timer = setInterval(
      () =>
        setTimeLeft((value) => {
          if (value <= 1) {
            clearInterval(timer);
            void finishInterviewRef.current();
            return 0;
          }
          return value - 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [step]);
  useEffect(() => {
    if (step !== "interview") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    const heartbeat = setInterval(() => {
      void fetch("/api/ai-interview/heartbeat", { method: "POST" }).catch(
        () => {},
      );
    }, 15000);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearInterval(heartbeat);
    };
  }, [step]);
  useEffect(() => {
    if (videoRef.current && mediaRef.current) {
      videoRef.current.srcObject = mediaRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [step]);
  useEffect(() => {
    if (
      step !== "interview" ||
      !interview?.face_monitoring_enabled ||
      !videoRef.current
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let detector: {
      detectForVideo: (
        video: HTMLVideoElement,
        time: number,
      ) => {
        faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
      };
      close: () => void;
    } | null = null;
    let noFaceSince = 0,
      multipleSince = 0,
      awaySince = 0,
      lastAwayEvent = 0,
      noFaceLogged = false,
      multipleLogged = false;
    void (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
        );
        detector = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          minFaceDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        timer = setInterval(() => {
          const video = videoRef.current;
          if (cancelled || !video || video.readyState < 2 || !detector) return;
          const now = performance.now();
          const faces = detector.detectForVideo(video, now).faceLandmarks || [];
          if (faces.length === 0) {
            if (!noFaceSince) noFaceSince = Date.now();
            if (
              !noFaceLogged &&
              Date.now() - noFaceSince >
                Math.max(3, interview.face_missing_threshold_seconds || 5) *
                  1000
            ) {
              sendEvent("FACE_NOT_VISIBLE", { approximate: true });
              noFaceLogged = true;
            }
          } else {
            noFaceSince = 0;
            noFaceLogged = false;
          }
          if (faces.length > 1) {
            if (!multipleSince) multipleSince = Date.now();
            if (!multipleLogged && Date.now() - multipleSince > 2000) {
              sendEvent("MULTIPLE_FACES", { approximate: true });
              multipleLogged = true;
            }
          } else {
            multipleSince = 0;
            multipleLogged = false;
          }
          if (faces.length === 1 && interview.gaze_monitoring_enabled) {
            const points = faces[0];
            const nose = points[1],
              left = points[33],
              right = points[263];
            if (nose && left && right) {
              const eyeWidth = Math.max(0.001, Math.abs(right.x - left.x));
              const offset =
                Math.abs(nose.x - (left.x + right.x) / 2) / eyeWidth;
              const away = offset > 0.22;
              if (away) {
                if (!awaySince) awaySince = Date.now();
                if (
                  Date.now() - awaySince > 2000 &&
                  Date.now() - lastAwayEvent > 5000
                ) {
                  sendEvent("LOOKING_AWAY", {
                    approximate: true,
                    head_offset: Number(offset.toFixed(2)),
                  });
                  lastAwayEvent = Date.now();
                  awaySince = 0;
                }
              } else awaySince = 0;
            }
          }
        }, 500);
      } catch (error) {
        console.warn("Face monitoring unavailable", error);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      detector?.close();
    };
  }, [step, interview, sendEvent]);
  useEffect(
    () => () => {
      answerAudioRecorderRef.current?.stop?.();
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop?.();
    },
    [],
  );

  async function acceptConsent() {
    if (!consent) return;
    setChecking(true);
    setError("");
    try {
      const r = await fetch("/api/ai-interview/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camera_consent: true,
          microphone_consent: true,
          recording_consent: true,
          screen_share_consent: Boolean(interview?.screen_share_enabled),
          monitoring_consent: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStep("system");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent could not be saved");
    } finally {
      setChecking(false);
    }
  }
  async function runChecks() {
    setChecking(true);
    setError("");
    try {
      const browser = /Chrome|Edg/.test(navigator.userAgent);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      mediaRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream
        .getVideoTracks()[0]
        ?.addEventListener("ended", () => sendEvent("CAMERA_DISABLED"));
      stream
        .getAudioTracks()[0]
        ?.addEventListener("ended", () => sendEvent("MICROPHONE_DISABLED"));
      let screen = true;
      if (interview?.screen_share_enabled) {
        screenRef.current = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenRef.current
          .getVideoTracks()[0]
          ?.addEventListener("ended", () => sendEvent("SCREEN_SHARE_STOPPED"));
      }
      setChecks((value) => ({
        ...value,
        browser,
        camera: stream.getVideoTracks().length > 0,
        microphone: stream.getAudioTracks().length > 0,
        network: navigator.onLine,
        screen,
      }));
    } catch (e) {
      setError(
        "Camera or microphone permission was denied. Allow access and retry the system check.",
      );
      sendEvent("PERMISSION_DENIED", {
        message: e instanceof Error ? e.message : "permission denied",
      });
    } finally {
      setChecking(false);
    }
  }
  function playSpeakerTest() {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Context();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    setChecks((value) => ({ ...value, speaker: true }));
  }
  async function captureSnapshot(attempt = 0): Promise<void> {
    if (snapshotCapturedRef.current) return;
    const video = videoRef.current;
    if (
      (!video ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight) &&
      attempt < 8
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return captureSnapshot(attempt + 1);
    }
    if (!video) {
      sendEvent("SNAPSHOT_FAILED", { reason: "camera_not_ready" });
      return;
    }
    try {
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.86),
      );
      if (!blob) throw new Error("Camera image could not be created");
      const response = await fetch("/api/ai-interview/snapshot", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Snapshot upload failed",
        );
      snapshotCapturedRef.current = true;
      sendEvent("SNAPSHOT_CAPTURED", {
        width: canvas.width,
        height: canvas.height,
      });
    } catch (error) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        return captureSnapshot(attempt + 1);
      }
      sendEvent("SNAPSHOT_FAILED", {
        reason: error instanceof Error ? error.message : "capture_failed",
      });
    }
  }
  function requiredChecksPassed() {
    return [
      "browser",
      "camera",
      "microphone",
      "speaker",
      "network",
      ...(interview?.screen_share_enabled ? ["screen"] : []),
    ].every((key) => checks[key] === true);
  }
  async function beginInterview() {
    if (!requiredChecksPassed()) {
      setError("Run and complete every required system check before starting.");
      return;
    }
    try {
      const checkResponse = await fetch("/api/ai-interview/system-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks }),
      });
      const checkResult = await checkResponse.json();
      if (!checkResponse.ok)
        throw new Error(
          checkResult.error || "System check could not be verified",
        );
      if (interview?.fullscreen_required && !document.fullscreenElement)
        await document.documentElement.requestFullscreen();
      const r = await fetch("/api/ai-interview/start", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      uploadIdRef.current = d.upload_id;
      startedAt.current = Date.now();
      setStep("interview");
      await beginQuestion(resumeQuestionIndexRef.current);
      if (interview?.recording_enabled && mediaRef.current)
        startRecording(mediaRef.current);
      sendEvent("INTERVIEW_STARTED");
      void captureSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Interview could not start");
    }
  }
  function startRecording(stream: MediaStream) {
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunkRef.current = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      const seq = chunkRef.current++;
      uploadChain.current = uploadChain.current
        .then(() =>
          fetch("/api/ai-interview/recording/chunk", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-upload-id": uploadIdRef.current,
              "x-chunk-sequence": String(seq),
            },
            body: event.data,
          }).then(async (r) => {
            if (!r.ok)
              throw new Error(
                (await r.json()).error || "Recording upload failed",
              );
          }),
        )
        .catch(() => {
          sendEvent("RECORDING_INTERRUPTED");
        });
    };
    recorder.start(5000);
    setRecording(true);
  }
  function startAnswerAudioRecording() {
    if (!interview?.answer_audio_enabled || !mediaRef.current) return;
    const tracks = mediaRef.current.getAudioTracks();
    if (!tracks.length) return;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
    answerAudioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) answerAudioChunksRef.current.push(event.data);
    };
    recorder.start(1000);
    answerAudioRecorderRef.current = recorder;
  }
  async function stopAndUploadAnswerAudio(questionId: number) {
    const recorder = answerAudioRecorderRef.current;
    if (!recorder) return;
    answerAudioRecorderRef.current = null;
    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });
    const chunks = answerAudioChunksRef.current;
    answerAudioChunksRef.current = [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    try {
      const response = await fetch("/api/ai-interview/answer/audio", {
        method: "POST",
        headers: {
          "Content-Type": blob.type,
          "x-question-id": String(questionId),
        },
        body: blob,
      });
      if (!response.ok) throw new Error("Answer audio upload failed");
    } catch {
      sendEvent("RECORDING_INTERRUPTED", {
        scope: "answer_audio",
        question_id: questionId,
      });
    }
  }
  async function beginQuestion(index: number) {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setListening(false);
    setCurrent(index);
    setAnswer("");
    // Pre-fill code editor with the question's starter code
    const q = questions[index];
    if (q?.question_type === "CODING") {
      setCodeAnswer(q.starter_code || "");
    } else {
      setCodeAnswer("");
    }
    questionStartedAt.current = Date.now();
    if (q) {
      await fetch("/api/ai-interview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          question_id: q.id,
          idempotency_key: `start-${q.id}`,
        }),
      });
      startAnswerAudioRecording();
    }
  }
  function speakQuestion() {
    const q = questions[current];
    if (!q || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(q.question_text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }
  function startDictation() {
    if (listening) {
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError(
        "Live speech transcription is unavailable in this browser. You can type your answer.",
      );
      return;
    }
    setError("");
    const baseAnswer = answer.trim();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++)
        text += `${event.results[i][0].transcript} `;
      setAnswer([baseAnswer, text.trim()].filter(Boolean).join(" "));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
      setError(
        "Voice transcription paused or could not hear you. Retry or continue by typing.",
      );
    };
    recognition.start();
    recognitionRef.current = recognition;
  }
  async function submitAnswer() {
    const q = questions[current];
    const isCoding = q?.question_type === "CODING";
    // For coding questions, use the code editor value as the transcript
    const transcript = isCoding ? codeAnswer : answer;
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setListening(false);
    setPreparing(interview?.interview_mode === "ADAPTIVE");
    await stopAndUploadAnswerAudio(q.id);
    try {
      const r = await fetch("/api/ai-interview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          question_id: q.id,
          transcript,
          duration_seconds: Math.round(
            (Date.now() - questionStartedAt.current) / 1000,
          ),
          idempotency_key: `complete-${q.id}`,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Answer could not be saved");
        return;
      }
      if (d.interview_complete) {
        await finishInterview();
        return;
      }
      if (interview?.interview_mode === "ADAPTIVE" && d.next_question) {
        const next = d.next_question as Question;
        setQuestions((value) =>
          value.some((item) => item.id === next.id) ? value : [...value, next],
        );
        setCurrent(current + 1);
        setAnswer("");
        setCodeAnswer(next.starter_code || "");
        questionStartedAt.current = Date.now();
        await fetch("/api/ai-interview/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            question_id: next.id,
            idempotency_key: `start-${next.id}`,
          }),
        });
        startAnswerAudioRecording();
        return;
      }
      if (current < questions.length - 1) await beginQuestion(current + 1);
      else await finishInterview();
    } finally {
      setPreparing(false);
    }
  }
  async function finishRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await uploadChain.current;
    setRecording(false);
    if (interview?.recording_enabled && uploadIdRef.current) {
      await fetch("/api/ai-interview/recording/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: uploadIdRef.current,
          mime_type: recorder?.mimeType || "video/webm",
          duration_seconds: Math.round((Date.now() - startedAt.current) / 1000),
        }),
      });
    }
  }
  async function finishInterview() {
    if (step === "thanks") return;
    setStep("thanks");
    try {
      const activeQuestion = questions[current];
      if (activeQuestion) await stopAndUploadAnswerAudio(activeQuestion.id);
      await finishRecording();
      await fetch("/api/ai-interview/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: `complete-${interview?.id}` }),
      });
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
    } catch {
      setWarning(
        "Your answers were submitted. Recording processing may require recruiter review.",
      );
    }
  }
  async function cancelInterview() {
    if (cancelling || step === "cancelled") return;
    setCancelling(true);
    try {
      // Stop voice input and recording before cancelling.
      recognitionRef.current?.stop?.();
      recognitionRef.current = null;
      setListening(false);
      const activeQuestion = questions[current];
      if (activeQuestion) await stopAndUploadAnswerAudio(activeQuestion.id);
      await finishRecording();
      await fetch("/api/ai-interview/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "candidate_cancelled", idempotency_key: `cancel-${interview?.id}` }),
      });
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      setStep("cancelled");
    } catch {
      setWarning("Cancellation could not be completed. Please close this window.");
      setShowCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  }
  const card =
    "rounded-2xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-xl shadow-black/10";
  if (step === "loading")
    return (
      <Shell>
        <div className={`${card} text-center text-slate-300`}>
          Opening your secure interview...
        </div>
      </Shell>
    );
  if (step === "error")
    return (
      <Shell>
        <div className={`${card} text-center`}>
          <h1 className="text-xl font-bold text-white">
            Unable to open interview
          </h1>
          <p className="mt-3 text-slate-300">{error}</p>
        </div>
      </Shell>
    );
  if (step === "thanks")
    return (
      <Shell>
        <div className={`${card} text-center`}>
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
          <h1 className="mt-4 text-2xl font-bold text-white">
            Interview submitted successfully
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Thank you for completing the interview. Your responses have been
            recorded and our recruitment team will review them shortly.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            This interview link has been deactivated and cannot be reopened.
          </p>
          {warning && <p className="mt-3 text-sm text-amber-300">{warning}</p>}
        </div>
      </Shell>
    );
  if (step === "cancelled")
    return (
      <Shell>
        <div className={`${card} text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-600 text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Interview cancelled
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            You have exited the interview. All responses recorded up to this
            point have been saved for review.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            This interview link has been deactivated. Please contact the
            recruitment team if you believe this was a mistake.
          </p>
        </div>
      </Shell>
    );
  if (step === "intro")
    return (
      <Shell>
        <div className={`${card} mx-auto max-w-3xl`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-7 w-7 text-cyan-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">
                {interview?.title}
              </h1>
              <p className="mt-1 text-slate-300">
                {interview?.candidate_name} · {interview?.job_title} ·{" "}
                {interview?.duration_minutes} minutes
              </p>
            </div>
          </div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-300">
            {interview?.instructions}
          </p>
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
            This interview uses your camera and microphone, captures one camera
            snapshot, and may record audio/video. It monitors interview-tab
            visibility, focus, fullscreen, media interruptions, network state,
            face presence, and approximate head direction. These integrity
            signals are approximate and receive human review. No emotion or
            background-application detection is performed.
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              I consent to the required camera snapshot, microphone, recording,
              and browser integrity monitoring described above.
            </span>
          </label>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button
            disabled={!consent || checking}
            onClick={() => void acceptConsent()}
            className="mt-5 w-full rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-40"
          >
            Continue to system check
          </button>
        </div>
      </Shell>
    );
  if (step === "system")
    return (
      <Shell>
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <div className={card}>
            <h1 className="text-xl font-bold text-white">
              Camera and microphone check
            </h1>
            <video
              ref={videoRef}
              muted
              playsInline
              className="mt-4 aspect-video w-full rounded-xl bg-black object-cover"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void runChecks()}
                disabled={checking}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-2.5 font-bold text-slate-950"
              >
                {checking ? "Checking..." : "Run system check"}
              </button>
              <button
                onClick={playSpeakerTest}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Test speaker
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          </div>
          <div className={card}>
            <h2 className="text-xl font-bold text-white">System readiness</h2>
            <div className="mt-4 space-y-3">
              {[
                ["browser", "Chrome or Edge", MonitorUp],
                ["camera", "Camera", Camera],
                ["microphone", "Microphone", Mic],
                ["speaker", "Speaker", Mic],
                ["network", "Network", Wifi],
                ...(interview?.screen_share_enabled
                  ? [["screen", "Screen share", MonitorUp] as any]
                  : []),
              ].map(([key, label, Icon]: any) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-slate-700 p-3"
                >
                  <span className="flex items-center gap-2 text-slate-200">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  <span
                    className={
                      checks[key] ? "text-emerald-400" : "text-slate-500"
                    }
                  >
                    {checks[key] ? "Ready" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => void beginInterview()}
              disabled={!requiredChecksPassed()}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 disabled:opacity-40"
            >
              Start interview
            </button>
            {!requiredChecksPassed() && (
              <p className="mt-2 text-center text-xs text-slate-400">
                Run the system check and speaker test to continue.
              </p>
            )}
          </div>
        </div>
      </Shell>
    );
  if (preparing)
    return (
      <Shell>
        <div className={`${card} mx-auto max-w-xl py-12 text-center`}>
          <BrainCircuit className="mx-auto h-12 w-12 animate-pulse text-cyan-400" />
          <h1 className="mt-4 text-xl font-bold text-white">
            Analysing your response
          </h1>
          <p className="mt-2 text-slate-300">
            Preparing the next evidence-based question...
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Please keep this interview window open.
          </p>
        </div>
      </Shell>
    );
  const q = questions[current];
  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <main className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
            <span>
              {interview?.interview_mode === "ADAPTIVE"
                ? `Question ${current + 1}`
                : `Question ${current + 1} of ${questions.length}`}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {Math.floor(timeLeft / 60)}:
              {String(timeLeft % 60).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400"
              style={{
                width: `${((current + 1) / Math.max(1, interview?.interview_mode === "ADAPTIVE" ? Number(interview.question_count || questions.length) : questions.length)) * 100}%`,
              }}
            />
          </div>
          <div className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-cyan-400">
            {q?.skill_name || "Interview"} · {q?.difficulty}
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-9 text-white">
            {q?.question_text}
          </h1>
          <button
            onClick={speakQuestion}
            disabled={speaking}
            className="mt-3 text-sm font-semibold text-cyan-300"
          >
            {speaking ? "Reading question..." : "Read question aloud"}
          </button>
          {/* Answer area: Monaco for coding, textarea for text */}
          {q?.question_type === "CODING" ? (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-700">
              <div className="flex items-center justify-between bg-slate-800 px-4 py-2">
                <span className="text-xs font-semibold text-slate-300">
                  💻 Code editor
                  <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 font-mono text-cyan-300">
                    {q.coding_language || "python"}
                  </span>
                </span>
                <span className="text-xs text-slate-500">Write your solution below</span>
              </div>
              <MonacoEditor
                height="320px"
                language={q.coding_language || "python"}
                value={codeAnswer}
                onChange={(val) => setCodeAnswer(val ?? "")}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  automaticLayout: true,
                  tabSize: 4,
                }}
              />
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={9}
              className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Speak or type your answer here..."
            />
          )}
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            {q?.question_type !== "CODING" && (
              <button
                onClick={startDictation}
                aria-pressed={listening}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${listening ? "border-rose-400 bg-rose-500/15 text-rose-200" : "border-slate-600 text-white"}`}
              >
                <Mic
                  className={`h-4 w-4 ${listening ? "animate-pulse text-rose-400" : ""}`}
                />
                {listening
                  ? "Listening... click to stop"
                  : "Start voice transcription"}
              </button>
            )}
            {q?.question_type === "CODING" && <div />}
            <button
              onClick={() => void submitAnswer()}
              className="rounded-xl bg-cyan-500 px-5 py-2.5 font-bold text-slate-950"
            >
              {interview?.interview_mode === "ADAPTIVE"
                ? "Submit answer"
                : current === questions.length - 1
                  ? "Submit interview"
                  : "Save and next"}
            </button>
          </div>
          {/* Cancel & Exit — shown below the answer actions */}
          <div className="mt-4 border-t border-slate-800 pt-4">
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-rose-400 transition-colors"
              >
                Cancel exam and exit
              </button>
            ) : (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
                <p className="text-sm font-semibold text-rose-300">
                  Are you sure you want to cancel and exit?
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  All answers recorded so far will be saved, but this interview
                  link will be permanently deactivated.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={cancelling}
                    onClick={() => void cancelInterview()}
                    className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Exiting..." : "Yes, cancel interview"}
                  </button>
                  <button
                    disabled={cancelling}
                    onClick={() => setShowCancelConfirm(false)}
                    className="rounded-lg border border-slate-600 px-4 py-1.5 text-sm font-semibold text-slate-200 disabled:opacity-50"
                  >
                    Go back
                  </button>
                </div>
              </div>
            )}
          </div>
          {listening && (
            <p className="mt-2 text-sm font-semibold text-rose-300">
              Microphone is listening. Spoken words will appear in the answer
              box.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </main>
        <aside className={card}>
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            className="aspect-video w-full rounded-xl bg-black object-cover"
          />
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <div className="flex justify-between">
              <span>Camera</span>
              <strong className="text-emerald-400">On</strong>
            </div>
            <div className="flex justify-between">
              <span>Microphone</span>
              <strong className="text-emerald-400">On</strong>
            </div>
            <div className="flex justify-between">
              <span>Voice input</span>
              <strong
                className={listening ? "text-rose-400" : "text-slate-500"}
              >
                {listening ? "Listening" : "Idle"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Recording</span>
              <strong
                className={recording ? "text-rose-400" : "text-slate-500"}
              >
                {recording ? "Active" : "Off"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Network</span>
              <strong className="text-emerald-400">Online</strong>
            </div>
          </div>
          {warning && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              {warning}
              <button
                onClick={() => setWarning("")}
                className="mt-2 block font-bold"
              >
                Dismiss
              </button>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Window switching is recorded and pauses voice input. Browsers cannot
            block operating-system window switching. Face and head-direction
            checks are approximate and reviewed by a person.
          </p>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#172554,_#020617_48%,_#020617)] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-400 p-2 text-slate-950">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <div className="font-bold">AASTHIX AI Interview</div>
            <div className="text-xs text-slate-400">
              Secure candidate assessment
            </div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
