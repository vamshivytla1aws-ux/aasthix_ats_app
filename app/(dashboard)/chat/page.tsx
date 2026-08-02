"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";
import EmojiPicker from "@/components/chat/EmojiPicker";
import GifPicker from "@/components/chat/GifPicker";
import Toast, { type ToastTone } from "@/components/Toast";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { callStateReducer, type CallUiState } from "@/lib/chat/callStateReducer";
import { DateTimePicker } from "@/components/ui/DateTimeFields";
import { CHAT_UI_V2_ENABLED } from "@/lib/featureFlags";
import styles from "./chat-v2.module.css";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquare,
  MonitorUp,
  Mic,
  MicOff,
  Paperclip,
  Pin,
  Plus,
  Phone,
  Search,
  Send,
  Smile,
  Star,
  Users,
  X,
} from "lucide-react";

type Member = { user_id: number; full_name: string; email: string };
type Conversation = {
  id: number;
  name: string | null;
  type: "direct" | "group";
  created_by: number;
  created_at: string;
  updated_at: string;
  last_read_at: string;
  unread_count: number;
  pin_count?: number;
  muted?: boolean;
  mention_only?: boolean;
  last_message: {
    id: number;
    content: string;
    sender_id: number;
    is_system: boolean;
    created_at: string;
    sender_name: string;
  } | null;
  members: Member[];
};

type ConversationLike = Partial<Conversation> & { id: number };
type ConversationSidebarPatch = {
  conversationId: number;
  lastMessage?: Conversation["last_message"] | Message | null;
  unreadCount?: number;
  markRead?: boolean;
  updatedAt?: string;
  bumpToTop?: boolean;
};
type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_system: boolean;
  created_at: string;
  sender_name: string;
  sender_email: string;
  attachment_type: "file" | "image" | "gif" | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  parent_message_id: number | null;
  delivery_state?: "queued" | "sent" | "delivered" | "read" | "failed";
  edited_at?: string | null;
  edited_by?: number | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  thread_reply_count?: number;
  thread_last_reply_at?: string | null;
  reactions?: Array<{ emoji: string; count: number; users: Array<{ user_id: number; full_name: string }> }>;
  mentions?: ChatMention[];
};
type ChatMention = { type: "user" | "candidate"; id: number; label: string; sublabel?: string };
type ConversationDetails = {
  conversation: {
    id: number;
    name: string | null;
    type: "direct" | "group";
    created_at: string;
    updated_at: string;
  };
  members: Member[];
  stats: { shared_files: number; shared_images: number };
};
type PinnedMessageItem = Message & { pin_id: number; pinned_at: string; pinned_by: number; pinned_by_name: string };
type DrawerView = "details" | "pins" | "notify" | "calendar";
type ConversationFilter = "all" | "unread" | "direct" | "group";
type ChatUser = { id: number; full_name: string; email: string; role: string };
type SearchResult = {
  id: number;
  conversation_id: number;
  content: string;
  created_at: string;
  sender_name: string;
  conversation_name: string | null;
};
type ThreadInboxItem = {
  parent_message_id: number;
  conversation_id: number;
  conversation_name: string | null;
  parent_content: string;
  parent_sender_name: string;
  reply_count: number;
  unread_replies: number;
  last_reply_at: string;
};
type UploadItemState = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "failed" | "ready";
  error?: string;
  uploaded?: { type: "file" | "image"; url: string; name: string; size: number };
};
type ChatCalendarEvent = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  meet_link: string | null;
  join_url?: string | null;
  status: string;
  calendar_sync_status: string | null;
  conversation_id?: number;
  conversation_name?: string | null;
  session_mode?: "call" | "screenshare";
  is_active?: boolean;
  provider?: "ats_native" | string | null;
  created_by_user_id?: number | null;
  joined_count?: number;
  joined_user_ids?: number[];
  joined_participants?: Array<{ user_id: number; full_name: string; muted?: boolean; session_count?: number }>;
  active_session_count?: number;
  room_closed_reason?: "ended" | "missed" | "declined" | "timeout" | null;
  connection_state?: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  media_state?: "ok" | "permission_denied" | "device_missing" | "failed" | "ready";
  can_join?: boolean;
  can_end?: boolean;
  remote_audio_tracks_count?: number;
  signal_schema_ready?: boolean;
  effective_media_state?: "connected" | "reconnecting" | "publish_missing" | "waiting_remote" | "playback_blocked" | "idle";
  call_presence_state?: "idle" | "active_joined" | "active_not_joined" | "incoming_ringing";
  media_readiness_state?: "connected" | "waiting_remote" | "publish_missing" | "reconnecting" | "playback_blocked" | "idle";
  media_health_hint?: string;
  caller_visibility_delay_ms?: number | null;
  caller_visibility_slo_miss?: boolean;
};
type ConversationLiveStatus = {
  conversation_id: number;
  status_kind: "presenting" | "in_call" | "in_meeting" | "busy" | "active_now" | "none";
};
type ExternalInvite = {
  id: number;
  external_name: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type CallSignal = {
  id: number;
  room_id: number;
  from_user_id: number;
  to_user_id: number | null;
  signal_type:
    | "offer"
    | "answer"
    | "ice"
    | "leave"
    | "presenting"
    | "moderation_mute"
    | "moderation_unmute"
    | "moderation_remove"
    | "moderation_end"
    | "media_repair";
  payload: Record<string, unknown>;
  created_at: string;
};

type LiveKitSessionToken = {
  operation_status: "success" | "blocked" | "error";
  room_id?: number;
  room_name?: string;
  session_id?: string;
  livekit_identity?: string;
  livekit_url?: string;
  token?: string;
  user_message?: string;
  hint?: string;
  media_health_hint?: string;
  turn_ready?: boolean | null;
  turn_expected?: boolean;
  turn_configuration_source?: "livekit_server" | "external_ice_fallback";
};

type PrejoinStatus = "checking" | "ready" | "warning" | "failed";
type PrejoinDiagnostics = {
  status: PrejoinStatus;
  permission: "granted" | "denied" | "prompt" | "unknown";
  mic_available: boolean;
  mic_capture_ok: boolean;
  autoplay_ok: boolean;
  input_devices: number;
  output_devices: number;
  messages: string[];
  checked_at: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function convLabel(conv: Conversation, currentUserId: number | null): string {
  const safeMembers = Array.isArray(conv.members) ? conv.members : [];
  if (conv.name) return conv.name;
  if (conv.type === "direct") {
    const other = safeMembers.find((m) => m.user_id !== currentUserId);
    return other?.full_name ?? "Direct message";
  }
  return safeMembers.map((m) => m.full_name.split(" ")[0]).join(", ") || "Group chat";
}

function normalizeConversation(conv: ConversationLike): Conversation {
  return {
    id: Number(conv.id),
    name: typeof conv.name === "string" ? conv.name : null,
    type: conv.type === "group" ? "group" : "direct",
    created_by: Number(conv.created_by ?? 0),
    created_at: String(conv.created_at ?? new Date(0).toISOString()),
    updated_at: String(conv.updated_at ?? new Date(0).toISOString()),
    last_read_at: String(conv.last_read_at ?? new Date(0).toISOString()),
    unread_count: Number(conv.unread_count ?? 0),
    pin_count: Number(conv.pin_count ?? 0),
    muted: Boolean(conv.muted),
    mention_only: Boolean(conv.mention_only),
    last_message:
      conv.last_message && typeof conv.last_message === "object"
        ? {
            id: Number((conv.last_message as Conversation["last_message"])?.id ?? 0),
            content: String((conv.last_message as Conversation["last_message"])?.content ?? ""),
            sender_id: Number((conv.last_message as Conversation["last_message"])?.sender_id ?? 0),
            is_system: Boolean((conv.last_message as Conversation["last_message"])?.is_system),
            created_at: String((conv.last_message as Conversation["last_message"])?.created_at ?? new Date(0).toISOString()),
            sender_name: String((conv.last_message as Conversation["last_message"])?.sender_name ?? "Unknown"),
          }
        : null,
    members: Array.isArray(conv.members)
      ? conv.members.map((m) => ({
          user_id: Number(m.user_id ?? 0),
          full_name: String(m.full_name ?? "Unknown user"),
          email: String(m.email ?? ""),
        }))
      : [],
  };
}

function normalizeConversationLastMessage(
  message: Conversation["last_message"] | Message | null | undefined
): Conversation["last_message"] {
  if (!message || typeof message !== "object") return null;
  return {
    id: Number(message.id ?? 0),
    content: String(message.content ?? ""),
    sender_id: Number(message.sender_id ?? 0),
    is_system: Boolean(message.is_system),
    created_at: String(message.created_at ?? new Date(0).toISOString()),
    sender_name: String(message.sender_name ?? "Unknown"),
  };
}

class ChatPageBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; diagnostic: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, diagnostic: "" };
  }

  static getDerivedStateFromError() {
    return { hasError: true, diagnostic: `${Date.now()}` };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[chat-page-crash]", {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      route: typeof window !== "undefined" ? window.location.pathname : "/chat",
      ts: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">Chat hit an unexpected error</p>
            <p className="mt-2 text-sm text-slate-600">Diagnostic ID: {this.state.diagnostic}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                Reload chat
              </button>
              <Link href="/dashboard" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
                Go to dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function isImageAttachment(msg: Message) {
  return msg.attachment_type === "image" || msg.attachment_type === "gif";
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusLabel(kind: ConversationLiveStatus["status_kind"]) {
  if (kind === "presenting") return "Presenting";
  if (kind === "in_call") return "In call";
  if (kind === "in_meeting") return "In meeting";
  if (kind === "busy") return "Busy";
  if (kind === "active_now") return "Active now";
  return null;
}

function statusClasses(kind: ConversationLiveStatus["status_kind"]) {
  if (kind === "presenting") return "bg-cyan-500/20 text-cyan-200 border-cyan-400/40";
  if (kind === "in_call") return "bg-emerald-500/20 text-emerald-200 border-emerald-400/40";
  if (kind === "in_meeting") return "bg-amber-500/20 text-amber-100 border-amber-400/40";
  if (kind === "busy") return "bg-rose-500/20 text-rose-100 border-rose-400/40";
  if (kind === "active_now") return "bg-indigo-500/20 text-indigo-100 border-indigo-400/40";
  return "bg-slate-500/10 text-slate-300 border-slate-400/30";
}

function extractMentionQuery(value: string) {
  const idx = value.lastIndexOf("@");
  if (idx < 0) return null;
  const segment = value.slice(idx + 1);
  if (!segment || /\s/.test(segment)) return null;
  return { index: idx, query: segment };
}

function injectMentionToken(value: string, mention: ChatMention) {
  const q = extractMentionQuery(value);
  if (!q) return value;
  const before = value.slice(0, q.index);
  const token = `@[${mention.label}](${mention.type}:${mention.id})`;
  return `${before}${token} `;
}

function parseMentionsFromText(value: string): ChatMention[] {
  const regex = /@\[(.+?)\]\((user|candidate):(\d+)\)/g;
  const mentions: ChatMention[] = [];
  let m: RegExpExecArray | null = regex.exec(value);
  while (m) {
    mentions.push({ label: m[1], type: m[2] as "user" | "candidate", id: Number(m[3]) });
    m = regex.exec(value);
  }
  return mentions;
}

function stripMentionTokens(value: string) {
  return value.replace(/@\[(.+?)\]\((user|candidate):(\d+)\)/g, "@$1");
}

function renderMessageWithMentions(content: string, mentions: ChatMention[] | undefined) {
  if (!content) return content;
  const byLabel = new Map((mentions ?? []).map((m) => [m.label.toLowerCase(), m]));
  const parts = content.split(/(@[A-Za-z0-9._ -]+)/g);
  return parts.map((part, idx) => {
    if (!part.startsWith("@")) return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
    const label = part.slice(1).trim().toLowerCase();
    const mention = byLabel.get(label);
    if (!mention) return <React.Fragment key={`raw-${idx}`}>{part}</React.Fragment>;
    if (mention.type === "candidate") {
      return (
        <Link
          key={`chip-${idx}`}
          href={`/candidates/${mention.id}`}
          className="mx-0.5 inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
        >
          @{mention.label}
        </Link>
      );
    }
    return (
      <span key={`chip-${idx}`} className="mx-0.5 inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
        @{mention.label}
      </span>
    );
  });
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-violet-500",
];

function avatarColor(seed: number) {
  return AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length];
}

function playTone(kind: "message" | "ring", durationMs = 180, volume = 1) {
  if (typeof window === "undefined") return;
  const Ctx = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = kind === "ring" ? "square" : "triangle";
  osc.frequency.value = kind === "ring" ? 860 : 1040;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  const clampedVolume = Math.min(1, Math.max(0, volume));
  const peak = (kind === "ring" ? 0.18 : 0.08) * clampedVolume;
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
}

function getRtcIceServers() {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CHAT_ICE_SERVERS
      ? process.env.NEXT_PUBLIC_CHAT_ICE_SERVERS
      : "";
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((entry: any) => {
            const urls: unknown[] = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
            const safeUrls = urls.map((u: unknown) => String(u || "").trim()).filter(Boolean);
            if (!safeUrls.length) return null;
            return { ...entry, urls: safeUrls };
          })
          .filter(Boolean);
        if (normalized.length) return normalized as RTCIceServer[];
      }
    } catch {
      // fallback below
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

function buildCallMutationHeaders() {
  const correlationId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    "x-idempotency-key": correlationId,
    "x-call-correlation-id": correlationId,
  };
}

function buildCallMutationHeadersWithKey(idempotencyKey?: string) {
  const correlationId = idempotencyKey || `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    "x-idempotency-key": correlationId,
    "x-call-correlation-id": correlationId,
  };
}

function getCallClientKind() {
  if (typeof window !== "undefined" && Boolean((window as any).atsDesktop)) return "desktop";
  if (typeof navigator !== "undefined" && /android|iphone|ipad|mobile/i.test(navigator.userAgent || "")) return "mobile";
  return "web";
}

function getStableCallSessionId(roomId: number) {
  const key = `ats_chat_call_session_${roomId}`;
  const fallback = `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  if (typeof window === "undefined") return fallback;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `s-${crypto.randomUUID()}`
      : fallback;
  window.sessionStorage.setItem(key, next);
  return next;
}

function mapCallActionError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 0 || /failed to fetch|network/i.test(error.message)) {
      return "Network issue while contacting call service. Retrying…";
    }
    if (error.status === 401) {
      return "Session expired. Please login again.";
    }
    if (error.status >= 500) {
      return `Call service unavailable (${error.requestId ?? "no-request-id"}). Please retry.`;
    }
    return error.message || fallback;
  }
  return fallback;
}

async function callApiWithRetry<T = unknown>(
  url: string,
  init: RequestInit,
  options?: { retries?: number; retryDelayMs?: number }
) {
  const retries = options?.retries ?? 1;
  const retryDelayMs = options?.retryDelayMs ?? 180;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await apiFetchJson<T>(url, init);
    } catch (error) {
      lastError = error;
      const isRetryable =
        error instanceof ApiError
          ? error.status === 0 || error.status >= 500
          : true;
      if (!isRetryable || attempt >= retries) break;
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [queryConversationId, setQueryConversationId] = useState<number | null>(null);
  const [queryRoomId, setQueryRoomId] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("all");
  const [favoriteConversationIds, setFavoriteConversationIds] = useState<number[]>([]);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("user");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatType, setNewChatType] = useState<"direct" | "group">("direct");
  const [showComposeMenu, setShowComposeMenu] = useState(false);
  const [showQuickCalendar, setShowQuickCalendar] = useState(false);
  const [showTempChatModal, setShowTempChatModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [desktopFullscreenFit, setDesktopFullscreenFit] = useState(false);
  const [ringVolume, setRingVolume] = useState(0.85);
  const globalUnreadSnapshotRef = useRef<Map<number, { unread: number; lastMessageId: number }>>(new Map());
  const lastGlobalDesktopNotifiedRef = useRef<number>(0);
  const pendingConversationRefreshRef = useRef<number | null>(null);

  useEffect(() => {
    apiFetchJson<{ user: { id?: number; role?: string } }>("/api/auth/me")
      .then((d) => {
        setCurrentUserId(d.user?.id ?? null);
        setCurrentUserRole(String(d.user?.role || "user"));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("ats_chat_ring_volume");
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setRingVolume(Math.min(1, Math.max(0.1, parsed)));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem("ats_chat_ui_preferences") || "{}");
      setFavoriteConversationIds(Array.isArray(parsed.favoriteConversationIds) ? parsed.favoriteConversationIds.filter(Number.isFinite) : []);
      setFavoritesCollapsed(Boolean(parsed.favoritesCollapsed));
      setRecentCollapsed(Boolean(parsed.recentCollapsed));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "ats_chat_ui_preferences",
      JSON.stringify({ favoriteConversationIds, favoritesCollapsed, recentCollapsed })
    );
  }, [favoriteConversationIds, favoritesCollapsed, recentCollapsed]);

  useEffect(() => {
    setDesktopFullscreenFit(typeof window !== "undefined" && Boolean((window as any).atsDesktop));
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const conv = Number(params.get("conversation") || "0");
      const room = Number(params.get("room") || "0");
      setQueryConversationId(Number.isFinite(conv) && conv > 0 ? conv : null);
      setQueryRoomId(Number.isFinite(room) && room > 0 ? room : null);
    }
  }, []);

  const { data: convData, mutate: mutateConvs } = useSWR<{ conversations: Conversation[] }>(
    "/api/chat/conversations",
    dashboardFetcher,
    { refreshInterval: 30_000 }
  );

  const conversations = useMemo(
    () =>
      (convData?.conversations ?? [])
        .map((c) => normalizeConversation(c as ConversationLike))
        .filter((c) => Number.isFinite(c.id) && c.id > 0),
    [convData]
  );
  const { data: globalPrefData } = useSWR<{
    user: { mention_only: boolean; desktop_sound: boolean; desktop_toast: boolean; email_digest: boolean; email_digest_frequency: string };
    conversations: Array<{ conversation_id: number; muted: boolean; mention_only: boolean }>;
  }>("/api/chat/preferences", dashboardFetcher, { refreshInterval: 30_000 });
  useEffect(() => {
    const raw = convData?.conversations ?? [];
    if (!raw.length) return;
    const malformed = raw.filter((c: any) => !Array.isArray(c?.members));
    if (malformed.length > 0) {
      console.warn("[chat-mobile-guard] normalized malformed conversation members", {
        count: malformed.length,
        sample_ids: malformed.slice(0, 5).map((c: any) => c?.id),
      });
    }
  }, [convData]);
  const { data: threadInboxData } = useSWR<{ inbox: ThreadInboxItem[] }>(
    "/api/chat/threads/inbox",
    dashboardFetcher,
    { refreshInterval: 7000 }
  );
  const threadInbox = useMemo(() => threadInboxData?.inbox ?? [], [threadInboxData]);
  const { data: upcomingCalendarData } = useSWR<{ events: ChatCalendarEvent[]; recent_events: ChatCalendarEvent[] }>(
    "/api/chat/calendar/upcoming?limit=8",
    dashboardFetcher,
    { refreshInterval: 20_000 }
  );
  const upcomingCalendar = useMemo(() => upcomingCalendarData?.events ?? [], [upcomingCalendarData]);
  const recentCalendar = useMemo(() => upcomingCalendarData?.recent_events ?? [], [upcomingCalendarData]);
  const { data: statusData } = useSWR<{ statuses: ConversationLiveStatus[] }>(
    "/api/chat/conversations/statuses",
    dashboardFetcher,
    { refreshInterval: 12_000 }
  );
  const statusMap = useMemo(() => {
    const map = new Map<number, ConversationLiveStatus["status_kind"]>();
    (statusData?.statuses ?? []).forEach((row) => map.set(row.conversation_id, row.status_kind));
    return map;
  }, [statusData]);
  const filteredConversations = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return conversations.filter((conv) => {
      if (q && !convLabel(conv, currentUserId).toLowerCase().includes(q)) return false;
      if (conversationFilter === "unread") return (conv.unread_count ?? 0) > 0;
      if (conversationFilter === "direct") return conv.type === "direct";
      if (conversationFilter === "group") return conv.type === "group";
      return true;
    });
  }, [conversations, sidebarSearch, currentUserId, conversationFilter]);
  const favoriteConversations = useMemo(
    () => filteredConversations.filter((conv) => favoriteConversationIds.includes(conv.id)),
    [favoriteConversationIds, filteredConversations]
  );
  const recentConversations = useMemo(
    () => filteredConversations.filter((conv) => !favoriteConversationIds.includes(conv.id)),
    [favoriteConversationIds, filteredConversations]
  );

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

  const queueConversationRefresh = useCallback((delayMs = 450) => {
    if (typeof window === "undefined") {
      void mutateConvs();
      return;
    }
    if (pendingConversationRefreshRef.current) {
      window.clearTimeout(pendingConversationRefreshRef.current);
    }
    pendingConversationRefreshRef.current = window.setTimeout(() => {
      pendingConversationRefreshRef.current = null;
      void mutateConvs();
    }, delayMs);
  }, [mutateConvs]);

  const patchConversationSidebar = useCallback(
    (patch: ConversationSidebarPatch) => {
      void mutateConvs(
        (current) => {
          if (!current?.conversations?.length) return current;
          let touched = false;
          const next = current.conversations
            .map((item) => {
              const conv = normalizeConversation(item as ConversationLike);
              if (conv.id !== patch.conversationId) return conv;
              touched = true;
              const nextLastMessage =
                patch.lastMessage !== undefined
                  ? normalizeConversationLastMessage(patch.lastMessage)
                  : conv.last_message;
              const nextUpdatedAt =
                patch.updatedAt ??
                nextLastMessage?.created_at ??
                conv.updated_at;
              return {
                ...conv,
                last_message: nextLastMessage,
                unread_count: patch.markRead ? 0 : patch.unreadCount ?? conv.unread_count,
                updated_at: nextUpdatedAt,
              };
            })
            .sort((a, b) => {
              if (patch.bumpToTop) {
                if (a.id === patch.conversationId) return -1;
                if (b.id === patch.conversationId) return 1;
              }
              return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
          if (!touched) return current;
          return { conversations: next };
        },
        { revalidate: false }
      );
    },
    [mutateConvs]
  );

  useEffect(() => {
    return () => {
      if (pendingConversationRefreshRef.current && typeof window !== "undefined") {
        window.clearTimeout(pendingConversationRefreshRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!conversations.length) return;
    if (queryConversationId) {
      const match = conversations.find((conv) => conv.id === queryConversationId);
      if (match) {
        setActiveConvId(match.id);
        return;
      }
    }
    if (!activeConvId) setActiveConvId(conversations[0].id);
  }, [conversations, queryConversationId, activeConvId]);

  const unreadTotal = useMemo(() => conversations.reduce((sum, conv) => sum + (conv.unread_count ?? 0), 0), [conversations]);

  useEffect(() => {
    const next = new Map<number, { unread: number; lastMessageId: number }>();
    let notificationCandidate: Conversation | null = null;
    for (const conv of conversations) {
      const lastMessageId = Number(conv.last_message?.id ?? 0);
      const unread = Number(conv.unread_count ?? 0);
      next.set(conv.id, { unread, lastMessageId });
      const previous = globalUnreadSnapshotRef.current.get(conv.id);
      const isIncoming = Number(conv.last_message?.sender_id ?? 0) !== Number(currentUserId ?? 0);
      const conversationMuted = Boolean(globalPrefData?.conversations?.find((pref) => pref.conversation_id === conv.id)?.muted);
      if (
        previous &&
        unread > previous.unread &&
        lastMessageId > previous.lastMessageId &&
        isIncoming &&
        !conversationMuted
      ) {
        notificationCandidate = conv;
      }
    }

    if (notificationCandidate) {
      const latestMessageId = Number(notificationCandidate.last_message?.id ?? 0);
      if ((globalPrefData?.user?.desktop_sound ?? true) && latestMessageId > 0) {
        playTone("message", 120, Math.max(0.4, ringVolume * 0.6));
      }
      if (
        (globalPrefData?.user?.desktop_toast ?? true) &&
        latestMessageId > 0 &&
        latestMessageId !== lastGlobalDesktopNotifiedRef.current &&
        typeof window !== "undefined" &&
        "Notification" in window
      ) {
        const notify = () => {
          try {
            return new Notification(convLabel(notificationCandidate as Conversation, currentUserId), {
              body: notificationCandidate?.last_message?.content?.slice(0, 140) || "New message",
              tag: `chat-sidebar-msg-${notificationCandidate?.id}-${latestMessageId}`,
            });
          } catch {
            return null;
          }
        };
        if (Notification.permission === "granted") {
          notify();
          lastGlobalDesktopNotifiedRef.current = latestMessageId;
        } else if (Notification.permission === "default") {
          void Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              notify();
              lastGlobalDesktopNotifiedRef.current = latestMessageId;
            }
          });
        }
      }
    }

    globalUnreadSnapshotRef.current = next;
  }, [conversations, currentUserId, globalPrefData, ringVolume]);

  return (
    <ChatPageBoundary>
      <AccessGate permissionKey="chat.view">
      <div className={CHAT_UI_V2_ENABLED ? styles.page : undefined}>
      <div className={[CHAT_UI_V2_ENABLED ? styles.shell : "font-['Sora','Manrope','Inter','Segoe_UI',sans-serif] flex overflow-hidden bg-[#0a0f1f]", desktopFullscreenFit ? "h-[calc(100vh-2px)] rounded-none border-0 shadow-none" : "h-[calc(100vh-7rem)]"].join(" ")}>
        <aside
          className={[
            CHAT_UI_V2_ENABLED ? styles.sidebar : "w-80 shrink-0 border-r border-slate-700 bg-[#1f2430] text-slate-100",
            activeConversation ? "hidden md:flex md:flex-col" : "flex flex-col",
          ].join(" ")}
        >
          <div className={CHAT_UI_V2_ENABLED ? styles.sidebarHeader : "border-b border-slate-700 px-4 py-3"}>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--chat-surface-teal)] text-[var(--chat-primary)]">
                <MessageSquare className="h-[18px] w-[18px]" />
              </span>
              <h2 className={CHAT_UI_V2_ENABLED ? styles.sidebarTitle : "text-sm font-semibold tracking-wide text-slate-100"}>Messages</h2>
              {unreadTotal > 0 ? (
                <span className="rounded-full bg-[var(--chat-primary)] px-2 py-0.5 text-[11px] font-bold text-white">{unreadTotal}</span>
              ) : null}
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setShowComposeMenu((v) => !v)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--chat-primary)] text-white shadow-sm transition hover:bg-[var(--chat-primary-strong)]"
                  title="Create"
                  aria-label="Create conversation or event"
                >
                  <Plus className="h-[18px] w-[18px]" />
                </button>
                {showComposeMenu ? (
                  <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-[var(--chat-border)] bg-white p-1.5 text-[var(--chat-text)] shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setNewChatType("direct");
                        setShowNewChat(true);
                        setShowComposeMenu(false);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--chat-surface-teal)]"
                    >
                      Direct
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewChatType("group");
                        setShowNewChat(true);
                        setShowComposeMenu(false);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--chat-surface-teal)]"
                    >
                      Group
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposeMenu(false);
                        setShowQuickCalendar(true);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--chat-surface-teal)]"
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposeMenu(false);
                        setShowTempChatModal(true);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--chat-surface-teal)]"
                    >
                      Temp chat
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--chat-muted)]" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search conversations"
                className={`${CHAT_UI_V2_ENABLED ? styles.sidebarSearch : ""} rounded-xl py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--chat-soft)]`}
              />
            </div>
            {CHAT_UI_V2_ENABLED ? (
              <div className={styles.filterBar} aria-label="Conversation filters">
                {(["all", "unread", "direct", "group"] as ConversationFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setConversationFilter(filter)}
                    className={[styles.filterButton, conversationFilter === filter ? styles.filterActive : ""].join(" ")}
                  >
                    {filter === "direct" ? "People" : filter === "group" ? "Groups" : filter[0].toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="chat-scrollbar flex-1 overflow-y-auto">
            {threadInbox.length > 0 ? (
              <div className="border-b border-slate-700 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Thread inbox</p>
                <div className="space-y-1">
                  {threadInbox.slice(0, 3).map((item) => (
                    <button
                      key={`${item.conversation_id}-${item.parent_message_id}`}
                      type="button"
                      onClick={() => setActiveConvId(item.conversation_id)}
                      className="w-full rounded-md border border-slate-700 bg-[#151922] px-2 py-1.5 text-left hover:bg-[#1b2230]"
                    >
                      <p className="truncate text-[11px] font-medium text-slate-100">
                        {(item.conversation_name || "Conversation").trim()} • {item.reply_count} replies
                      </p>
                      <p className="truncate text-[10px] text-slate-400">{item.parent_content || "Thread update"}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {upcomingCalendar.length > 0 ? (
              <div className="border-b border-slate-700 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Calendar</p>
                <div className="space-y-1.5">
                  {upcomingCalendar.slice(0, 4).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        if (event.conversation_id) setActiveConvId(event.conversation_id);
                      }}
                      className="w-full rounded-md border border-slate-700 bg-[#151922] px-2 py-1.5 text-left hover:bg-[#1b2230]"
                    >
                      <p className="truncate text-[11px] font-medium text-slate-100">{event.title}</p>
                      <p className="truncate text-[10px] text-slate-400">
                        {new Date(event.start_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {recentCalendar.length > 0 ? (
              <div className="border-b border-slate-700 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent calls</p>
                <div className="space-y-1.5">
                  {recentCalendar.slice(0, 3).map((event) => (
                    <button
                      key={`recent-${event.id}`}
                      type="button"
                      onClick={() => {
                        if (event.conversation_id) setActiveConvId(event.conversation_id);
                      }}
                      className="w-full rounded-md border border-slate-700 bg-[#121725] px-2 py-1.5 text-left hover:bg-[#1b2230]"
                    >
                      <p className="truncate text-[11px] font-medium text-slate-100">{event.title}</p>
                      <p className="truncate text-[10px] text-slate-400">
                        Ended {new Date(event.end_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {filteredConversations.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--chat-muted)]">No conversations match this view.</div>
            ) : null}
            {CHAT_UI_V2_ENABLED && favoriteConversations.length > 0 ? (
              <button type="button" className={styles.sectionLabel} onClick={() => setFavoritesCollapsed((value) => !value)}>
                <span className="flex items-center gap-2"><Star className="h-3.5 w-3.5" /> Favorites</span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${favoritesCollapsed ? "-rotate-90" : ""}`} />
              </button>
            ) : null}
            {!favoritesCollapsed && favoriteConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                statusKind={statusMap.get(conv.id) || "none"}
                isActive={conv.id === activeConvId}
                currentUserId={currentUserId}
                onClick={() => setActiveConvId(conv.id)}
                isFavorite
                onToggleFavorite={() => setFavoriteConversationIds((ids) => ids.filter((id) => id !== conv.id))}
              />
            ))}
            {CHAT_UI_V2_ENABLED && recentConversations.length > 0 ? (
              <button type="button" className={styles.sectionLabel} onClick={() => setRecentCollapsed((value) => !value)}>
                <span>Recent</span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${recentCollapsed ? "-rotate-90" : ""}`} />
              </button>
            ) : null}
            {!recentCollapsed && recentConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                statusKind={statusMap.get(conv.id) || "none"}
                isActive={conv.id === activeConvId}
                currentUserId={currentUserId}
                onClick={() => setActiveConvId(conv.id)}
                isFavorite={false}
                onToggleFavorite={() => setFavoriteConversationIds((ids) => [...new Set([...ids, conv.id])])}
              />
            ))}
          </div>
        </aside>

        <main
          className={[
            CHAT_UI_V2_ENABLED ? styles.workspace : "min-w-0 flex-1 bg-[radial-gradient(circle_at_20%_0%,#10193a_0%,#0b1126_35%,#080d1d_100%)]",
            activeConversation ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          {activeConversation ? (
            <ChatWorkspace
              conversation={activeConversation}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              initialRoomId={queryRoomId}
              onBack={() => setActiveConvId(null)}
              onMutateConversations={queueConversationRefresh}
              onPatchConversation={patchConversationSidebar}
              onToast={(message, tone = "success") => setToast({ message, tone })}
            />
          ) : (
            <div className="flex w-full items-center justify-center">
              <div className="text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[var(--chat-border)] bg-white text-[var(--chat-primary)] shadow-sm"><MessageSquare className="h-7 w-7" /></span>
                <p className="mt-4 font-[var(--font-ats-heading)] text-lg font-bold text-[var(--chat-text)]">Your conversations, in one calm workspace</p>
                <p className="mt-1 text-sm text-[var(--chat-muted)]">Choose a conversation or start a new one.</p>
              </div>
            </div>
          )}
        </main>
      </div>
      {showNewChat ? (
        <NewChatModal
          initialType={newChatType}
          onClose={() => setShowNewChat(false)}
          onCreate={(id) => {
            setShowNewChat(false);
            setActiveConvId(id);
            void mutateConvs();
          }}
          currentUserId={currentUserId}
        />
      ) : null}
      {toast ? <Toast message={toast.message} variant={toast.tone} onClose={() => setToast(null)} autoHideMs={2200} /> : null}
      {showQuickCalendar ? (
        <QuickCalendarModal
          onClose={() => setShowQuickCalendar(false)}
          onScheduled={(conversationId) => {
            setShowQuickCalendar(false);
            setActiveConvId(conversationId);
          }}
          currentUserId={currentUserId}
          conversations={conversations}
        />
      ) : null}
      {showTempChatModal ? (
        <TempChatModal
          onClose={() => setShowTempChatModal(false)}
          selectedConversationId={activeConversation?.id ?? null}
          conversations={conversations}
          onDone={(conversationId) => {
            setShowTempChatModal(false);
            setActiveConvId(conversationId);
          }}
          onToast={(message, tone = "success") => setToast({ message, tone })}
        />
      ) : null}
      </div>
      </AccessGate>
    </ChatPageBoundary>
  );
}

function ConversationRow({
  conv,
  statusKind,
  isActive,
  currentUserId,
  onClick,
  isFavorite,
  onToggleFavorite,
}: {
  conv: Conversation;
  statusKind: ConversationLiveStatus["status_kind"];
  isActive: boolean;
  currentUserId: number | null;
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const label = convLabel(conv, currentUserId);
  const unread = conv.unread_count ?? 0;
  const last = conv.last_message;
  const badge = statusLabel(statusKind);
  return (
    <div className={[CHAT_UI_V2_ENABLED ? styles.conversationRow : "relative w-full px-4 py-2.5", CHAT_UI_V2_ENABLED && isActive ? styles.conversationActive : "", "group/conv"].join(" ")}>
      <button type="button" onClick={onClick} className="w-full text-left" aria-current={isActive ? "page" : undefined}>
      <div className="flex items-start gap-2.5">
        <div className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white ${avatarColor(conv.id)}`}>
          {conv.type === "group" ? <Users className="h-4 w-4" /> : initials(label)}
          {statusKind === "active_now" ? <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--chat-sidebar)] bg-emerald-500" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate ${styles.conversationName} ${unread > 0 ? "font-extrabold" : ""}`}>{label}</span>
            {last ? <span className="pr-5 text-[11px] text-[var(--chat-soft)]">{formatTime(last.created_at)}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className={`truncate ${styles.conversationPreview}`}>
              {last ? (last.is_system ? last.content : `${last.sender_name.split(" ")[0]}: ${last.content}`) : "No messages yet"}
            </span>
            {badge ? (
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusClasses(statusKind)}`}>
                {badge}
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="shrink-0 rounded-full bg-[var(--chat-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
            ) : null}
          </div>
        </div>
      </div>
      </button>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}
        className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg transition ${isFavorite ? "text-amber-600" : "text-[var(--chat-soft)] opacity-0 hover:bg-white group-hover/conv:opacity-100 focus:opacity-100"}`}
        aria-label={isFavorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}

function ChatWorkspace({
  conversation,
  currentUserId,
  currentUserRole,
  initialRoomId,
  onBack,
  onMutateConversations,
  onPatchConversation,
  onToast,
}: {
  conversation: Conversation;
  currentUserId: number | null;
  currentUserRole: string;
  initialRoomId: number | null;
  onBack: () => void;
  onMutateConversations: (delayMs?: number) => void;
  onPatchConversation: (patch: ConversationSidebarPatch) => void;
  onToast: (message: string, tone?: ToastTone) => void;
}) {
  const liveKitPrimary = true;
  const safeConversationMembers = Array.isArray(conversation.members) ? conversation.members : [];
  const [messageInput, setMessageInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "conversation">("conversation");
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItemState[]>([]);
  const [sending, setSending] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView | null>(null);
  const [callLoading, setCallLoading] = useState<null | "call" | "screenshare">(null);
  const [callState, dispatchCallState] = useReducer(callStateReducer, "idle" as CallUiState);
  const setCallState = useCallback((next: CallUiState) => {
    dispatchCallState({ type: "FORCE_STATE", next });
  }, []);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [ringDismissedRoomId, setRingDismissedRoomId] = useState<number | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [moderationBusy, setModerationBusy] = useState<null | "mute" | "unmute" | "remove" | "end_all">(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [ringVolume, setRingVolume] = useState(0.85);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSeenMessageIdRef = useRef<number>(0);
  const ringIntervalRef = useRef<number | null>(null);
  const lastDesktopNotifiedMessageIdRef = useRef<number>(0);
  const lastDesktopNotifiedCallRoomRef = useRef<number>(0);
  const unansweredTimeoutRef = useRef<number | null>(null);
  const signalCursorRef = useRef(0);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const remoteAudioRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const liveKitAudioRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalPollRef = useRef<number | null>(null);
  const connectingPeersRef = useRef<Set<number>>(new Set());
  const analyzerRef = useRef<{ raf: number; audioCtx: AudioContext; analyser: AnalyserNode } | null>(null);
  const reconnectAttemptedRef = useRef(false);
  const remoteTrackTimeoutSinceRef = useRef<number | null>(null);
  const remoteTrackRecoveryAttemptedRef = useRef(false);
  const publishRecoveryAttemptedRef = useRef(false);
  const publishRecoveryInFlightRef = useRef<Promise<boolean> | null>(null);
  const publishRecoveryCooldownUntilRef = useRef<number>(0);
  const publishAttemptIdRef = useRef<string | null>(null);
  const publishMissingSinceRef = useRef<number | null>(null);
  const publishRecoveryPhaseRef = useRef<"idle" | "recovering" | "timeout" | "success">("idle");
  const publishRecoveryStartedAtRef = useRef<string | null>(null);
  const receiverJoinSeenAtRef = useRef<string | null>(null);
  const callerBarVisibleAtRef = useRef<string | null>(null);
  const callerVisibilitySloMissReportedRef = useRef(false);
  const lastJoinedCountRef = useRef(0);
  const reconcileWatchdogRef = useRef<number | null>(null);
  const pendingRecoveryTelemetryReasonRef = useRef<string | null>(null);
  const currentCallSessionIdRef = useRef<string | null>(null);
  const liveKitIdentityRef = useRef<string | null>(null);
  const lastLiveKitEventRef = useRef<string | null>(null);
  const trackAttachCountRef = useRef(0);
  const disconnectingRef = useRef(false);
  const connectInFlightRef = useRef<Promise<any> | null>(null);
  const remoteTrackSeenRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const liveKitRoomRef = useRef<any | null>(null);
  const liveKitConnectedRef = useRef(false);
  const telemetryIntervalRef = useRef<number | null>(null);
  const lastTelemetrySignatureRef = useRef<string>("");
  const lastTelemetrySentAtRef = useRef<Map<string, number>>(new Map());
  const callActionRef = useRef<{ joining: boolean; ending: boolean; sharing: boolean }>({
    joining: false,
    ending: false,
    sharing: false,
  });
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "reconnecting" | "failed">("idle");
  const [showPrejoin, setShowPrejoin] = useState(false);
  const [prejoinStatus, setPrejoinStatus] = useState<PrejoinDiagnostics | null>(null);
  const [prejoinBusy, setPrejoinBusy] = useState(false);
  const pendingCallIntentRef = useRef<null | { kind: "launch" | "join"; mode?: "call" | "screenshare"; roomId?: number; successMessage?: string }>(null);
  const prejoinSummaryPendingRef = useRef<PrejoinDiagnostics | null>(null);
  const prejoinBypassRef = useRef(false);
  const [localAudioTrackPresent, setLocalAudioTrackPresent] = useState(false);
  const [remoteAudioTracksCount, setRemoteAudioTracksCount] = useState(0);
  const callStateRef = useRef<CallUiState>(callState);
  const optimisticMessageCounterRef = useRef(0);
  const buildCallSessionPayload = useCallback((roomId: number) => {
    const session_id = getStableCallSessionId(roomId);
    currentCallSessionIdRef.current = session_id;
    return { session_id, client_kind: getCallClientKind() };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("ats_chat_ring_volume");
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setRingVolume(Math.min(1, Math.max(0.1, parsed)));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ats_chat_ring_volume", String(ringVolume));
  }, [ringVolume]);
  const resizeComposer = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const scrollHeight = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 56), 220)}px`;
  }, []);

  // SSE is the primary transport; polling is only a bounded recovery path.
  const messageRefreshInterval = threadParent ? 15_000 : 30_000;
  const { data: messageData, mutate: mutateMessages } = useSWR<{ messages: Message[] }>(
    `/api/chat/conversations/${conversation.id}/messages?limit=100`,
    dashboardFetcher,
    { refreshInterval: messageRefreshInterval }
  );
  const messages = useMemo(() => messageData?.messages ?? [], [messageData]);

  const { data: searchData } = useSWR<{ results: SearchResult[] }>(
    searchQ.trim().length < 2
      ? null
      : `/api/chat/search?q=${encodeURIComponent(searchQ)}&scope=${searchScope}${searchScope === "conversation" ? `&conversation_id=${conversation.id}` : ""}`,
    dashboardFetcher
  );

  const mentionCtx = useMemo(() => extractMentionQuery(messageInput), [messageInput]);
  const mentionQuery = mentionCtx?.query || "";
  const { data: mentionData } = useSWR<{ users: ChatMention[]; candidates: ChatMention[] }>(
    mentionQuery.length > 0 ? `/api/chat/mentions?q=${encodeURIComponent(mentionQuery)}&limit=6` : null,
    dashboardFetcher
  );
  const mentionOptions = useMemo(
    () => [...(mentionData?.users ?? []), ...(mentionData?.candidates ?? [])],
    [mentionData]
  );

  const { data: detailsData } = useSWR<ConversationDetails>(
    drawerView === "details" ? `/api/chat/conversations/${conversation.id}/details` : null,
    dashboardFetcher
  );
  const { data: externalInviteData, mutate: mutateExternalInvites } = useSWR<{ invites: ExternalInvite[] }>(
    drawerView === "details" ? `/api/chat/conversations/${conversation.id}/external-invites` : null,
    dashboardFetcher
  );
  const { data: pinData, mutate: mutatePins } = useSWR<{ pins: PinnedMessageItem[] }>(
    drawerView === "pins" || (conversation.pin_count ?? 0) > 0 ? `/api/chat/conversations/${conversation.id}/pins` : null,
    dashboardFetcher
  );
  const { data: prefData, mutate: mutatePrefs } = useSWR<{
    user: { mention_only: boolean; desktop_sound: boolean; desktop_toast: boolean; email_digest: boolean; email_digest_frequency: string };
    conversations: Array<{ conversation_id: number; muted: boolean; mention_only: boolean }>;
  }>("/api/chat/preferences", dashboardFetcher, { refreshInterval: 30_000 });
  const { data: presenceData, mutate: mutatePresence } = useSWR<{ manual_presence: "available" | "busy" }>(
    "/api/chat/presence",
    dashboardFetcher,
    { refreshInterval: 15_000 }
  );
  const isCallHotPath =
    callState === "incoming-ringing" || callState === "outgoing-ringing" || callState === "connecting";
  const { data: calendarData, mutate: mutateCalendar } = useSWR<{ events: ChatCalendarEvent[] }>(
    `/api/chat/conversations/${conversation.id}/calendar?limit=40`,
    dashboardFetcher,
    { refreshInterval: callState === "idle" ? 20_000 : isCallHotPath ? 650 : 1_500 }
  );
  const { data: callStateData, mutate: mutateCallState } = useSWR<{ operation_status: string; call: ChatCalendarEvent | null }>(
    `/api/chat/conversations/${conversation.id}/calls/state`,
    dashboardFetcher,
    { refreshInterval: callState === "idle" ? 2_000 : isCallHotPath ? 500 : 1_200 }
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") return;
    const stream = new EventSource(`/api/chat/realtime?conversation_id=${conversation.id}`);
    const onMessageEvent = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      let incoming: Message | null = null;
      try {
        incoming = JSON.parse(messageEvent.data) as Message;
      } catch {
        void mutateMessages();
        return;
      }
      if (!incoming || Number(incoming.conversation_id) !== Number(conversation.id)) return;
      void mutateMessages((current) => {
        const rows = current?.messages ?? [];
        const index = rows.findIndex((item) => Number(item.id) === Number(incoming!.id));
        const normalized = {
          ...incoming!,
          sender_name: incoming!.sender_name || (Number(incoming!.sender_id) === Number(currentUserId) ? "You" : "Team member"),
          reactions: incoming!.reactions || [],
          mentions: incoming!.mentions || [],
          delivery_state: incoming!.delivery_state || "delivered",
        } as Message;
        if (index >= 0) return { ...(current || { messages: [] }), messages: rows.map((item, itemIndex) => itemIndex === index ? { ...item, ...normalized } : item) };
        return { ...(current || { messages: [] }), messages: [...rows, normalized] };
      }, { revalidate: false });
      onMutateConversations(1200);
    };
    const onCallEvent = () => {
      void mutateCallState();
      void mutateCalendar();
      void mutateMessages();
      onMutateConversations(350);
      window.setTimeout(() => {
        void mutateCallState();
      }, 300);
    };
    stream.addEventListener("message.created", onMessageEvent);
    stream.addEventListener("message.updated", onMessageEvent);
    stream.addEventListener("message.deleted", onMessageEvent);
    stream.addEventListener("thread.reply", onMessageEvent);
    stream.addEventListener("call.state", onCallEvent);
    stream.addEventListener("call.call_start", onCallEvent);
    stream.addEventListener("call.join_success", onCallEvent);
    stream.addEventListener("call.leave", onCallEvent);
    stream.addEventListener("call.end", onCallEvent);
    stream.addEventListener("call.decline", onCallEvent);
    stream.addEventListener("call.declined", onCallEvent);
    stream.addEventListener("call.timeout", onCallEvent);
    stream.addEventListener("error", () => {});
    return () => {
      stream.removeEventListener("message.created", onMessageEvent);
      stream.removeEventListener("message.updated", onMessageEvent);
      stream.removeEventListener("message.deleted", onMessageEvent);
      stream.removeEventListener("thread.reply", onMessageEvent);
      stream.removeEventListener("call.state", onCallEvent);
      stream.removeEventListener("call.call_start", onCallEvent);
      stream.removeEventListener("call.join_success", onCallEvent);
      stream.removeEventListener("call.leave", onCallEvent);
      stream.removeEventListener("call.end", onCallEvent);
      stream.removeEventListener("call.decline", onCallEvent);
      stream.removeEventListener("call.declined", onCallEvent);
      stream.removeEventListener("call.timeout", onCallEvent);
      stream.close();
    };
  }, [conversation.id, currentUserId, mutateMessages, mutateCallState, mutateCalendar, onMutateConversations]);

  useEffect(() => {
    if (conversation.unread_count > 0) {
      apiFetchJson(`/api/chat/conversations/${conversation.id}/read`, { method: "PATCH" })
        .then(() => {
          onPatchConversation({ conversationId: conversation.id, unreadCount: 0, markRead: true });
          onMutateConversations(1500);
        })
        .catch(() => {});
    }
  }, [conversation.id, conversation.unread_count, onMutateConversations, onPatchConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    textareaRef.current?.focus();
    setMessageInput(window.localStorage.getItem(`ats_chat_draft:${conversation.id}`) || "");
    resizeComposer();
  }, [conversation.id, resizeComposer]);

  useEffect(() => {
    const key = `ats_chat_draft:${conversation.id}`;
    if (messageInput.trim()) window.localStorage.setItem(key, messageInput);
    else window.localStorage.removeItem(key);
  }, [conversation.id, messageInput]);

  useEffect(() => {
    resizeComposer();
  }, [messageInput, resizeComposer]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const latestId = messages[messages.length - 1]?.id || 0;
    const previous = lastSeenMessageIdRef.current;
    if (latestId <= previous) return;
    const conversationMuted = Boolean(
      prefData?.conversations?.find((pref) => pref.conversation_id === conversation.id)?.muted,
    );
    const latestMessage = messages[messages.length - 1];
    const isIncoming = Number(latestMessage?.sender_id || 0) !== Number(currentUserId || 0);
    if (previous > 0 && prefData?.user?.desktop_sound && !conversationMuted && isIncoming) {
      playTone("message", 120, Math.max(0.4, ringVolume * 0.6));
    }
    if (previous > 0 && (prefData?.user?.desktop_toast ?? true) && !conversationMuted && isIncoming) {
      const latestMessageId = Number(latestMessage?.id || 0);
      if (latestMessageId > 0 && latestMessageId !== lastDesktopNotifiedMessageIdRef.current && typeof window !== "undefined" && "Notification" in window) {
        const notify = () => {
          try {
            return new Notification(convLabel(conversation, currentUserId), {
              body: latestMessage?.content?.slice(0, 140) || "New message",
              tag: `chat-msg-${conversation.id}-${latestMessageId}`,
            });
          } catch {
            return null;
          }
        };
        if (Notification.permission === "granted") {
          notify();
          lastDesktopNotifiedMessageIdRef.current = latestMessageId;
        } else if (Notification.permission === "default") {
          void Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              notify();
              lastDesktopNotifiedMessageIdRef.current = latestMessageId;
            }
          });
        }
      }
    }
    lastSeenMessageIdRef.current = latestId;
  }, [messages, prefData, conversation.id, currentUserId, conversation, ringVolume]);

  const resetComposer = () => {
    setShowEmoji(false);
    setShowGif(false);
  };

  const appendUploadItem = (item: UploadItemState) => setUploadQueue((prev) => [...prev, item]);
  const patchUploadItem = (id: string, patch: Partial<UploadItemState>) =>
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeUploadItem = (id: string) => setUploadQueue((prev) => prev.filter((item) => item.id !== id));

  const buildOptimisticMessage = useCallback(
    (content: string, attachment?: UploadItemState["uploaded"], parentMessageId?: number): Message => {
      optimisticMessageCounterRef.current += 1;
      const tempId = -(Date.now() * 100 + optimisticMessageCounterRef.current);
      return {
        id: tempId,
        conversation_id: conversation.id,
        sender_id: Number(currentUserId ?? 0),
        content,
        is_system: false,
        created_at: new Date().toISOString(),
        sender_name: "You",
        sender_email: "",
        attachment_type: attachment?.type ?? null,
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        parent_message_id: parentMessageId ?? null,
        delivery_state: "queued",
        mentions: parseMentionsFromText(content),
      };
    },
    [conversation.id, currentUserId]
  );

  const uploadOneFile = useCallback(
    async (file: File) => {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (file.size > MAX_FILE_SIZE) {
        appendUploadItem({
          id: localId,
          name: file.name,
          size: file.size,
          status: "failed",
          error: "File exceeds 10MB limit",
        });
        return;
      }

      appendUploadItem({ id: localId, name: file.name, size: file.size, status: "uploading" });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
        const payload = await res.json();
        if (!res.ok) {
          patchUploadItem(localId, { status: "failed", error: payload?.error || "Upload failed" });
          return;
        }
        patchUploadItem(localId, {
          status: "ready",
          uploaded: {
            type: payload.type as "file" | "image",
            url: String(payload.url),
            name: String(payload.name || file.name),
            size: Number(payload.size || file.size),
          },
        });
      } catch (error) {
        patchUploadItem(localId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    },
    []
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      for (const file of files) {
        await uploadOneFile(file);
      }
    },
    [uploadOneFile]
  );

  const sendMessage = useCallback(
    async (content: string, attachment?: UploadItemState["uploaded"], parentMessageId?: number) => {
      if (sending) return;
      const trimmed = content.trim();
      const mentions = parseMentionsFromText(trimmed);
      const plainText = stripMentionTokens(trimmed);
      if (!trimmed && !attachment) return;
      setSending(true);
      const optimisticMessage = buildOptimisticMessage(plainText, attachment, parentMessageId);
      const idempotencyKey = `chat-msg-${conversation.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await mutateMessages(
        (current) => ({
          messages: [...(current?.messages ?? []), optimisticMessage],
        }),
        { revalidate: false }
      );
      try {
        const response = await apiFetchJson<{ message: Message }>(`/api/chat/conversations/${conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: plainText,
            mentions,
            attachment_type: attachment?.type ?? null,
            attachment_url: attachment?.url ?? null,
            attachment_name: attachment?.name ?? null,
            attachment_size: attachment?.size ?? null,
            parent_message_id: parentMessageId ?? null,
            idempotency_key: idempotencyKey,
          }),
        });
        await mutateMessages(
          (current) => ({
            messages: (current?.messages ?? []).map((msg) => (msg.id === optimisticMessage.id ? response.message : msg)),
          }),
          { revalidate: false }
        );
        onPatchConversation({
          conversationId: conversation.id,
          lastMessage: response.message,
          unreadCount: 0,
          markRead: true,
          updatedAt: response.message.created_at,
          bumpToTop: true,
        });
        setMessageInput("");
        setUploadQueue([]);
        resetComposer();
      } catch (error) {
        await mutateMessages(
          (current) => ({
            messages: (current?.messages ?? []).filter((msg) => msg.id !== optimisticMessage.id),
          }),
          { revalidate: false }
        );
        const msg = error instanceof ApiError ? error.message : "Failed to send message";
        onToast(msg, "error");
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    },
    [sending, buildOptimisticMessage, conversation.id, mutateMessages, onPatchConversation, onToast]
  );

  const sendComposer = useCallback(async () => {
    const readyAttachments = uploadQueue.filter((item) => item.status === "ready" && item.uploaded);
    const failedAttachments = uploadQueue.some((item) => item.status === "failed");
    if (failedAttachments) {
      onToast("Remove failed uploads before sending.", "blocked");
      return;
    }
    if (readyAttachments.length === 0) {
      await sendMessage(messageInput);
      return;
    }
    // Send first file with content, then remaining files as attachment messages.
    await sendMessage(messageInput, readyAttachments[0].uploaded);
    for (const attachment of readyAttachments.slice(1)) {
      await sendMessage("", attachment.uploaded);
    }
  }, [uploadQueue, onToast, sendMessage, messageInput]);

  const grouped = useMemo(() => {
    const result: Array<{ type: "divider"; label: string } | { type: "message"; message: Message; showSender: boolean }> = [];
    let prevDay = "";
    let prevSender = -1;
    let prevAt = 0;
    messages.forEach((msg) => {
      const day = dayKey(msg.created_at);
      if (day !== prevDay) {
        result.push({ type: "divider", label: formatDayLabel(msg.created_at) });
        prevDay = day;
        prevSender = -1;
        prevAt = 0;
      }
      const currentAt = new Date(msg.created_at).getTime();
      const showSender = prevSender !== msg.sender_id || currentAt - prevAt > 3 * 60_000;
      result.push({ type: "message", message: msg, showSender });
      prevSender = msg.sender_id;
      prevAt = currentAt;
    });
    return result;
  }, [messages]);

  const readyAttachmentCount = useMemo(
    () => uploadQueue.filter((item) => item.status === "ready" && item.uploaded).length,
    [uploadQueue]
  );
  const failedAttachmentCount = useMemo(
    () => uploadQueue.filter((item) => item.status === "failed").length,
    [uploadQueue]
  );
  const canSend = (messageInput.trim().length > 0 || readyAttachmentCount > 0) && !sending && failedAttachmentCount === 0;

  const threadContext = threadParent
    ? `/api/chat/conversations/${conversation.id}/threads/${threadParent.id}`
    : null;
  const { data: threadData, mutate: mutateThread } = useSWR<{ parent_message: Message; replies: Message[] }>(
    threadContext,
    dashboardFetcher,
    { refreshInterval: threadParent ? 2500 : 0 }
  );

  const sendThreadReply = useCallback(
    async (content: string, attachment?: UploadItemState["uploaded"]) => {
      if (!threadParent) return;
      const trimmed = content.trim();
      const mentions = parseMentionsFromText(trimmed);
      const plainText = stripMentionTokens(trimmed);
      if (!trimmed && !attachment) return;
      const optimisticReply = buildOptimisticMessage(plainText, attachment, threadParent.id);
      await mutateThread(
        (current) => ({
          parent_message: current?.parent_message ?? threadParent,
          replies: [...(current?.replies ?? []), optimisticReply],
        }),
        { revalidate: false }
      );
      try {
        const response = await apiFetchJson<{ message: Message }>(`/api/chat/conversations/${conversation.id}/threads/${threadParent.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: plainText,
            mentions,
            attachment_type: attachment?.type ?? null,
            attachment_url: attachment?.url ?? null,
            attachment_name: attachment?.name ?? null,
            attachment_size: attachment?.size ?? null,
          }),
        });
        onPatchConversation({
          conversationId: conversation.id,
          lastMessage: response.message,
          unreadCount: 0,
          markRead: true,
          updatedAt: response.message.created_at,
          bumpToTop: true,
        });
        void mutateThread();
        void mutateMessages();
        onMutateConversations(1200);
      } catch (error) {
        await mutateThread(
          (current) => ({
            parent_message: current?.parent_message ?? threadParent,
            replies: (current?.replies ?? []).filter((msg) => msg.id !== optimisticReply.id),
          }),
          { revalidate: false }
        );
        const msg = error instanceof ApiError ? error.message : "Failed to send thread reply";
        onToast(msg, "error");
      }
    },
    [threadParent, buildOptimisticMessage, conversation.id, mutateThread, mutateMessages, onMutateConversations, onPatchConversation, onToast]
  );

  const onDropZone = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!e.dataTransfer.files?.length) return;
      await uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles]
  );
  const activeCall = useMemo(() => {
    const call = callStateData?.call ?? null;
    return call && call.is_active ? call : null;
  }, [callStateData]);

  const activeCallDuration = useMemo(() => {
    if (!activeCall) return "00:00";
    const secs = Math.max(0, Math.floor((nowTick - new Date(activeCall.start_at).getTime()) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [activeCall, nowTick]);
  const canModerate = useMemo(() => {
    if (!activeCall || !currentUserId) return false;
    const host = Number(activeCall.created_by_user_id || 0) === Number(currentUserId);
    if (host) return true;
    const role = String(currentUserRole || "").toLowerCase();
    return role === "admin" || role === "hr" || role === "coordinator";
  }, [activeCall, currentUserId, currentUserRole]);
  const hasRemoteAudioActive = useMemo(
    () =>
      remoteAudioTracksCount > 0 ||
      Number(activeCall?.remote_audio_tracks_count || 0) > 0 ||
      activeCall?.effective_media_state === "connected",
    [activeCall, remoteAudioTracksCount],
  );
  const meJoinedInActiveCall = useMemo(() => {
    if (!activeCall || !currentUserId) return false;
    const joinedUserIds =
      activeCall.joined_user_ids ??
      (activeCall.joined_participants ?? []).map((member) => Number(member.user_id));
    return joinedUserIds.includes(Number(currentUserId));
  }, [activeCall, currentUserId]);
  const shouldForceActiveCallVisibility = useMemo(() => {
    if (!activeCall) return false;
    if (!meJoinedInActiveCall) return false;
    return Boolean(activeCall.is_active);
  }, [activeCall, meJoinedInActiveCall]);
  const publishMissingLocal = useMemo(() => {
    if (!activeCall || !activeCall.is_active) return false;
    if (!meJoinedInActiveCall) return false;
    return activeCall.effective_media_state === "publish_missing" || !localAudioTrackPresent;
  }, [activeCall, localAudioTrackPresent, meJoinedInActiveCall]);
  const schemaGateBlocked = activeCall?.signal_schema_ready === false;

  useEffect(() => {
    if (!initialRoomId || !activeCall) return;
    if (activeCall.id !== initialRoomId) return;
    if (activeRoomId === initialRoomId) return;
    let cancelled = false;
    (async () => {
      try {
        await apiFetchJson(`/api/chat/calls/${initialRoomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
          body: JSON.stringify(buildCallSessionPayload(initialRoomId)),
        });
        if (cancelled) return;
        setRingDismissedRoomId(null);
        setActiveRoomId(initialRoomId);
        setCallState("connected");
      } catch {
        // ignore here; regular join actions still available
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialRoomId, activeCall, activeRoomId, buildCallSessionPayload]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (reconcileWatchdogRef.current) {
      window.clearTimeout(reconcileWatchdogRef.current);
      reconcileWatchdogRef.current = null;
    }
    if (!activeCall) {
      setCallState("idle");
      setActiveRoomId(null);
      setIsPresenting(false);
      if (ringIntervalRef.current) {
        window.clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      return;
    }
    if (meJoinedInActiveCall && Number(activeCall.joined_count || 0) >= 2) {
      receiverJoinSeenAtRef.current = receiverJoinSeenAtRef.current || new Date().toISOString();
      reconcileWatchdogRef.current = window.setTimeout(() => {
        if (callStateRef.current !== "connected") {
          void mutateCallState();
        }
      }, 1200);
    }
    const roomId = activeCall.id;
    const isHost = Number(activeCall.created_by_user_id || 0) === Number(currentUserId || 0);
    const joinedUserIds =
      activeCall.joined_user_ids ??
      (activeCall.joined_participants ?? []).map((member) => Number(member.user_id));
    const meJoined = joinedUserIds.includes(Number(currentUserId || 0));
    const dismissed = ringDismissedRoomId === roomId;
    let nextState: CallUiState = "idle";
    if (activeCall.status === "ended" || activeCall.status === "cancelled" || activeCall.is_active === false) {
      setActiveRoomId(null);
    } else if (dismissed && activeRoomId !== roomId && !shouldForceActiveCallVisibility) {
      // Prevent stale participant snapshots from resurrecting dismissed call bars.
      nextState = "idle";
    } else if (activeCall.status === "active") {
      if (meJoined || activeRoomId === roomId) {
        const hasRemoteAudio =
          liveKitAudioRef.current.size > 0 ||
          Number(activeCall.remote_audio_tracks_count || 0) > 0 ||
          (activeCall.effective_media_state === "connected");
        const expectsRemote = Number(activeCall.joined_count || 0) > 1;
        const mediaConnected =
          liveKitConnectedRef.current &&
          connectionState === "connected" &&
          (!expectsRemote || hasRemoteAudio);
        nextState = mediaConnected ? "connected" : "connecting";
      } else if (!dismissed && activeCall.can_join !== false) {
        nextState = "incoming-ringing";
      }
    } else if (activeCall.status === "scheduled" && isHost && !dismissed) {
      nextState = "outgoing-ringing";
    }
    if (nextState !== callState) setCallState(nextState);
    if ((prefData?.user?.desktop_sound ?? true) && (nextState === "incoming-ringing" || nextState === "outgoing-ringing")) {
      if (!ringIntervalRef.current) {
        playTone("ring", 260, ringVolume);
        ringIntervalRef.current = window.setInterval(() => playTone("ring", 260, ringVolume), 1200);
      }
    } else if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    return () => {
      if (reconcileWatchdogRef.current) {
        window.clearTimeout(reconcileWatchdogRef.current);
        reconcileWatchdogRef.current = null;
      }
      if (ringIntervalRef.current && nextState === "connected") {
        window.clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
    };
  }, [
    activeCall,
    activeRoomId,
    callState,
    connectionState,
    currentUserId,
    prefData?.user?.desktop_sound,
    ringDismissedRoomId,
    ringVolume,
    shouldForceActiveCallVisibility,
    meJoinedInActiveCall,
    mutateCallState,
  ]);

  useEffect(() => {
    const joinedCount = Number(activeCall?.joined_count || 0);
    const previous = lastJoinedCountRef.current;
    if (joinedCount > previous) {
      void mutateCallState();
    }
    if (meJoinedInActiveCall && joinedCount >= 2 && !receiverJoinSeenAtRef.current) {
      receiverJoinSeenAtRef.current = new Date().toISOString();
    }
    lastJoinedCountRef.current = joinedCount;
  }, [activeCall?.joined_count, meJoinedInActiveCall, mutateCallState]);

  useEffect(() => {
    if (!activeCall) return;
    const hasRemoteAudio =
      liveKitAudioRef.current.size > 0 ||
      Number(activeCall.remote_audio_tracks_count || 0) > 0 ||
      Boolean(activeCall.effective_media_state === "connected");
    const expectsRemote = Number(activeCall.joined_count || 0) > 1;
    const stableConnected = liveKitConnectedRef.current && (!expectsRemote || hasRemoteAudio);
    if (stableConnected && connectionState !== "connected") {
      setConnectionState("connected");
    }
    if (stableConnected && mediaError && !/autoplay|permission|microphone|device/i.test(mediaError)) {
      setMediaError(null);
    }
  }, [activeCall, connectionState, mediaError]);

  useEffect(() => {
    if (!activeCall) return;
    if (callState !== "incoming-ringing") return;
    if (!(prefData?.user?.desktop_toast ?? true)) return;
    const roomId = Number(activeCall.id || 0);
    if (!roomId || roomId === lastDesktopNotifiedCallRoomRef.current) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const notify = () => {
      try {
        return new Notification(`Incoming call: ${convLabel(conversation, currentUserId)}`, {
          body: "Tap Join now to answer.",
          tag: `chat-call-${roomId}`,
        });
      } catch {
        return null;
      }
    };
    if (Notification.permission === "granted") {
      notify();
      lastDesktopNotifiedCallRoomRef.current = roomId;
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          notify();
          lastDesktopNotifiedCallRoomRef.current = roomId;
        }
      });
    }
  }, [activeCall, callState, prefData?.user?.desktop_toast, conversation, currentUserId]);

  useEffect(() => {
    if (unansweredTimeoutRef.current) {
      window.clearTimeout(unansweredTimeoutRef.current);
      unansweredTimeoutRef.current = null;
    }
  }, [activeCall, callState]);

  const stopMediaSession = useCallback(() => {
    setIsPresenting(false);
    setCameraEnabled(false);
    if (liveKitRoomRef.current) {
      disconnectingRef.current = true;
      try {
        liveKitRoomRef.current.disconnect();
      } catch {
        // no-op
      }
      liveKitRoomRef.current = null;
      liveKitConnectedRef.current = false;
      setConnectionState("idle");
    }
    if (signalPollRef.current) {
      window.clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
    connectingPeersRef.current.clear();
    for (const [, pc] of peerConnectionsRef.current.entries()) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // no-op
      }
    }
    peerConnectionsRef.current.clear();
    for (const [, audio] of remoteAudioRef.current.entries()) {
      try {
        audio.pause();
      } catch {
        // no-op
      }
    }
    remoteAudioRef.current.clear();
    for (const [, mediaEl] of liveKitAudioRef.current.entries()) {
      try {
        mediaEl.pause();
      } catch {
        // no-op
      }
    }
    liveKitAudioRef.current.clear();
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) track.stop();
      localStreamRef.current = null;
    }
    if (analyzerRef.current) {
      cancelAnimationFrame(analyzerRef.current.raf);
      analyzerRef.current.audioCtx.close().catch(() => {});
      analyzerRef.current = null;
    }
    setAudioLevel(0);
    setMediaError(null);
    setLocalAudioTrackPresent(false);
    setRemoteAudioTracksCount(0);
    reconnectAttemptedRef.current = false;
    remoteTrackTimeoutSinceRef.current = null;
    remoteTrackRecoveryAttemptedRef.current = false;
    publishRecoveryAttemptedRef.current = false;
    publishRecoveryInFlightRef.current = null;
    publishRecoveryCooldownUntilRef.current = 0;
    publishAttemptIdRef.current = null;
    publishMissingSinceRef.current = null;
    receiverJoinSeenAtRef.current = null;
    callerBarVisibleAtRef.current = null;
    callerVisibilitySloMissReportedRef.current = false;
    currentCallSessionIdRef.current = null;
    liveKitIdentityRef.current = null;
    lastLiveKitEventRef.current = null;
    trackAttachCountRef.current = 0;
    lastJoinedCountRef.current = 0;
    if (reconcileWatchdogRef.current) {
      window.clearTimeout(reconcileWatchdogRef.current);
      reconcileWatchdogRef.current = null;
    }
    connectInFlightRef.current = null;
    remoteTrackSeenRef.current = false;
    playbackStartedRef.current = false;
    disconnectingRef.current = false;
    if (telemetryIntervalRef.current) {
      window.clearInterval(telemetryIntervalRef.current);
      telemetryIntervalRef.current = null;
    }
  }, []);

  const readLiveKitAudioState = useCallback(() => {
    const liveKitRoom = liveKitRoomRef.current;
    const localAudioPublished = Boolean(
      liveKitRoom?.localParticipant?.audioTrackPublications &&
        Array.from(liveKitRoom.localParticipant.audioTrackPublications.values()).some(
          (pub: any) => Boolean(pub?.track),
        ),
    );
    const remoteAudioTrackCount = liveKitRoom
      ? Array.from(liveKitRoom.remoteParticipants.values()).reduce((count: number, participant: any) => {
          const published = Array.from(participant?.audioTrackPublications?.values?.() || []).filter((pub: any) =>
            Boolean(pub?.track),
          ).length;
          return count + published;
        }, 0)
      : liveKitAudioRef.current.size;
    return { localAudioPublished, remoteAudioTrackCount };
  }, []);

  const runPrejoinDiagnostics = useCallback(async (): Promise<PrejoinDiagnostics> => {
    const messages: string[] = [];
    let permission: PrejoinDiagnostics["permission"] = "unknown";
    let micAvailable = false;
    let micCaptureOk = false;
    let autoplayOk = false;
    let inputDevices = 0;
    let outputDevices = 0;

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        inputDevices = devices.filter((d) => d.kind === "audioinput").length;
        outputDevices = devices.filter((d) => d.kind === "audiooutput").length;
        micAvailable = inputDevices > 0;
        if (!micAvailable) messages.push("No microphone device found.");
      } catch {
        messages.push("Unable to read media devices.");
      }
    }

    try {
      if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
        const perm = await (navigator as any).permissions.query({ name: "microphone" as PermissionName });
        permission = (perm?.state as PrejoinDiagnostics["permission"]) || "unknown";
      }
    } catch {
      permission = "unknown";
    }

    if (permission === "denied") {
      messages.push("Microphone permission denied.");
    } else if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micCaptureOk = stream.getAudioTracks().some((t) => t.readyState === "live");
        for (const track of stream.getTracks()) track.stop();
        if (!micCaptureOk) messages.push("Unable to capture microphone audio.");
      } catch {
        messages.push("Microphone capture failed.");
      }
    }

    if (typeof document !== "undefined") {
      try {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.muted = false;
        audio.volume = 0.01;
        audio.src =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        await audio.play();
        autoplayOk = true;
        audio.pause();
      } catch {
        messages.push("Autoplay may be blocked until user interaction.");
      }
    }

    let status: PrejoinStatus = "ready";
    if (permission === "denied" || !micAvailable || !micCaptureOk) status = "failed";
    else if (!autoplayOk) status = "warning";

    return {
      status,
      permission,
      mic_available: micAvailable,
      mic_capture_ok: micCaptureOk,
      autoplay_ok: autoplayOk,
      input_devices: inputDevices,
      output_devices: outputDevices,
      messages,
      checked_at: new Date().toISOString(),
    };
  }, []);

  const recoverLocalAudioPublish = useCallback(async () => {
    const now = Date.now();
    if (publishRecoveryCooldownUntilRef.current > now) {
      return false;
    }
    if (publishRecoveryInFlightRef.current) {
      return publishRecoveryInFlightRef.current;
    }
    const room = liveKitRoomRef.current;
    if (!room?.localParticipant) return false;
    publishAttemptIdRef.current = `pub-${room.name || "room"}-${Date.now()}`;
    publishRecoveryInFlightRef.current = (async () => {
      try {
        publishRecoveryPhaseRef.current = "recovering";
        publishRecoveryStartedAtRef.current = new Date().toISOString();
        pendingRecoveryTelemetryReasonRef.current = "publish_recovery_start";
        const participant = room.localParticipant;
        for (const pub of Array.from(participant.audioTrackPublications?.values?.() || []) as any[]) {
          try {
            if (pub?.track) participant.unpublishTrack(pub.track);
          } catch {
            // no-op
          }
        }
        await participant.setMicrophoneEnabled(false).catch(() => {});
        // Desktop/Electron publish recovery: reacquire local audio track before republish.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
        } catch {
          // no-op; fallback to participant publish path
        }
        await participant.setMicrophoneEnabled(true).catch(() => {});
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const { localAudioPublished } = readLiveKitAudioState();
        setLocalAudioTrackPresent(localAudioPublished);
        setMicEnabled(true);
        if (!localAudioPublished) {
          publishRecoveryPhaseRef.current = "timeout";
          setMediaError("Microphone not published. Click Retry to restore audio.");
          pendingRecoveryTelemetryReasonRef.current = "publish_recovery_timeout";
          publishRecoveryCooldownUntilRef.current = Date.now() + 12_000;
          return false;
        }
        publishRecoveryPhaseRef.current = "success";
        setMediaError(null);
        publishMissingSinceRef.current = null;
        pendingRecoveryTelemetryReasonRef.current = "publish_recovery_success";
        publishRecoveryCooldownUntilRef.current = 0;
        return true;
      } finally {
        publishRecoveryInFlightRef.current = null;
      }
    })();
    return publishRecoveryInFlightRef.current;
  }, [readLiveKitAudioState]);

  const runRemoteAudioRecoveryAssist = useCallback((reason: "zero_remote_track_timeout" | "manual_remote_audio_retry") => {
    pendingRecoveryTelemetryReasonRef.current = reason;
    const room = liveKitRoomRef.current;
    if (room) {
      for (const participant of Array.from(room.remoteParticipants?.values?.() || []) as any[]) {
        for (const publication of Array.from(participant?.audioTrackPublications?.values?.() || []) as any[]) {
          const track = publication?.track;
          if (!track || track?.kind !== "audio") continue;
          const key = String(publication?.trackSid || `${participant?.identity || "p"}-${Date.now()}`);
          if (liveKitAudioRef.current.has(key)) continue;
          try {
            const mediaEl = track.attach() as HTMLMediaElement;
            mediaEl.autoplay = true;
            mediaEl.muted = false;
            mediaEl.volume = 1;
            mediaEl.setAttribute("playsinline", "true");
            if (!mediaEl.parentElement && typeof document !== "undefined") {
              mediaEl.style.position = "fixed";
              mediaEl.style.width = "1px";
              mediaEl.style.height = "1px";
              mediaEl.style.opacity = "0";
              mediaEl.style.pointerEvents = "none";
              mediaEl.setAttribute("aria-hidden", "true");
              document.body.appendChild(mediaEl);
            }
            liveKitAudioRef.current.set(key, mediaEl);
            trackAttachCountRef.current += 1;
            void mediaEl.play().then(() => {
              playbackStartedRef.current = true;
              setMediaError(null);
            }).catch(() => setMediaError("Tap Retry audio to start remote playback."));
          } catch {
            setMediaError("Unable to attach remote audio track.");
          }
        }
      }
      setRemoteAudioTracksCount(readLiveKitAudioState().remoteAudioTrackCount);
    }
    if (room?.localParticipant) {
      void room.localParticipant
        .setMicrophoneEnabled(false)
        .then(() => room.localParticipant.setMicrophoneEnabled(true))
        .catch(() => {});
    }
    window.setTimeout(() => {
      const { remoteAudioTrackCount } = readLiveKitAudioState();
      if (remoteAudioTrackCount > 0) return;
      setMediaError("Remote audio unavailable. Click Retry audio or Repair voice.");
    }, 2000);
  }, [readLiveKitAudioState]);

  const pushCallTelemetry = useCallback(
    async (reason: string) => {
      const roomId = Number(activeRoomId || activeCall?.id || 0);
      if (!roomId) return;
      if (!activeCall?.is_active || callStateRef.current === "idle") return;
      if (!currentCallSessionIdRef.current) {
        currentCallSessionIdRef.current = getStableCallSessionId(roomId);
      }
      const liveKitRoom = liveKitRoomRef.current;
      const { localAudioPublished, remoteAudioTrackCount } = readLiveKitAudioState();
      setLocalAudioTrackPresent(localAudioPublished);
      setRemoteAudioTracksCount(remoteAudioTrackCount);
      const roomState = String(liveKitRoom?.state || "").toLowerCase();
      const normalizedConnectionState: "idle" | "connecting" | "connected" | "reconnecting" | "failed" =
        roomState.includes("reconnecting")
          ? "reconnecting"
          : roomState.includes("connected")
            ? "connected"
            : roomState.includes("connecting")
              ? "connecting"
              : roomState.includes("disconnected")
                ? activeCall?.is_active
                  ? "failed"
                  : "idle"
                : connectionState;
      const normalizedActiveConnectionState =
        normalizedConnectionState === "idle" ? "connecting" : normalizedConnectionState;
      const publishMissingHard =
        publishRecoveryPhaseRef.current !== "recovering" &&
        micEnabled &&
        !localAudioPublished;
      const mediaState =
        publishMissingHard && publishRecoveryPhaseRef.current === "timeout"
          ? "failed"
          : mediaError && publishRecoveryPhaseRef.current !== "recovering" && !/recovering/i.test(mediaError)
            ? "failed"
            : "ok";
      const effectiveMediaStateReason =
        publishRecoveryPhaseRef.current === "recovering"
          ? "publish_recovering"
          : publishRecoveryPhaseRef.current === "timeout"
            ? "publish_missing_local_track"
            : localAudioPublished
              ? remoteAudioTrackCount > 0
                ? "tracks_subscribed"
                : "waiting_remote_tracks"
              : "publish_missing_local_track";
      const payload = {
        reason,
        session_id: currentCallSessionIdRef.current,
        livekit_identity_prefix: liveKitIdentityRef.current ? liveKitIdentityRef.current.slice(0, 80) : null,
        track_attach_count: trackAttachCountRef.current,
        remote_participant_count: liveKitRoom ? liveKitRoom.remoteParticipants?.size || 0 : 0,
        last_livekit_event: lastLiveKitEventRef.current,
        call_state: callStateRef.current,
        connection_state: normalizedActiveConnectionState,
        media_state: mediaState,
        publish_state: localAudioPublished ? "published" : "muted_or_unpublished",
        subscribe_state: remoteAudioTrackCount > 0 ? "subscribed" : "waiting_remote",
        local_audio_track_present: localAudioPublished,
        remote_audio_tracks_count: remoteAudioTrackCount,
        effective_media_state_reason: effectiveMediaStateReason,
        recovery_attempt:
          publishRecoveryPhaseRef.current === "recovering" || publishRecoveryPhaseRef.current === "timeout"
            ? { phase: publishRecoveryPhaseRef.current, attempt_ts: publishRecoveryStartedAtRef.current }
            : null,
        publish_attempt_id: publishAttemptIdRef.current,
        attempt_started_at: publishRecoveryStartedAtRef.current,
        attempt_result:
          publishRecoveryPhaseRef.current === "success"
            ? "success"
            : publishRecoveryPhaseRef.current === "timeout"
              ? "timeout"
              : publishRecoveryPhaseRef.current === "recovering"
                ? "recovering"
                : null,
        remote_track_seen: remoteTrackSeenRef.current,
        playback_started: playbackStartedRef.current,
        audio_level: audioLevel,
        mic_enabled: micEnabled,
        camera_enabled: cameraEnabled,
        autoplay_blocked: /autoplay/i.test(mediaError || ""),
        device_state:
          mediaState === "failed" && (mediaError && /device|microphone/i.test(mediaError))
            ? "device_error"
            : "ready",
        permission_state: mediaError && /permission|denied/i.test(mediaError) ? "denied" : "granted",
        media_error: mediaError || "",
        joined_count_hint: Number(activeCall?.joined_count || 0),
        call_presence_state: !activeCall?.is_active
          ? "idle"
          : meJoinedInActiveCall
            ? "active_joined"
            : callStateRef.current === "incoming-ringing"
              ? "incoming_ringing"
              : "active_not_joined",
        media_readiness_state:
          normalizedActiveConnectionState === "reconnecting"
            ? "reconnecting"
            : publishMissingHard
              ? "publish_missing"
              : remoteAudioTrackCount > 0
                ? "connected"
                : "waiting_remote",
        receiver_join_seen_at: receiverJoinSeenAtRef.current,
        caller_bar_visible_at: callerBarVisibleAtRef.current,
        caller_visibility_delay_ms:
          receiverJoinSeenAtRef.current && callerBarVisibleAtRef.current
            ? Math.max(0, new Date(callerBarVisibleAtRef.current).getTime() - new Date(receiverJoinSeenAtRef.current).getTime())
            : null,
        caller_visibility_slo_miss: callerVisibilitySloMissReportedRef.current,
        client_ts: new Date().toISOString(),
        prejoin_summary: prejoinSummaryPendingRef.current,
      };
      const signature = JSON.stringify(payload);
      if (reason !== "interval" && signature === lastTelemetrySignatureRef.current) return;
      const minMs = reason === "state_change" ? 1200 : 0;
      const lastAt = lastTelemetrySentAtRef.current.get(reason) || 0;
      const nowMs = Date.now();
      if (minMs > 0 && nowMs - lastAt < minMs) return;
      lastTelemetrySentAtRef.current.set(reason, nowMs);
      lastTelemetrySignatureRef.current = signature;
      await callApiWithRetry(`/api/chat/calls/${roomId}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, { retries: 1, retryDelayMs: 160 })
        .then(() => {
          if (prejoinSummaryPendingRef.current) prejoinSummaryPendingRef.current = null;
        })
        .catch(() => {});
    },
    [activeRoomId, activeCall?.id, activeCall?.joined_count, activeCall?.is_active, audioLevel, cameraEnabled, connectionState, mediaError, meJoinedInActiveCall, micEnabled, readLiveKitAudioState],
  );

  useEffect(() => {
    if (!activeCall?.is_active || !meJoinedInActiveCall) return;
    if (!callerBarVisibleAtRef.current) {
      callerBarVisibleAtRef.current = new Date().toISOString();
    }
    if (!receiverJoinSeenAtRef.current || callerVisibilitySloMissReportedRef.current) return;
    const delay =
      new Date(callerBarVisibleAtRef.current || 0).getTime() - new Date(receiverJoinSeenAtRef.current).getTime();
    if (delay > 2000) {
      callerVisibilitySloMissReportedRef.current = true;
      pendingRecoveryTelemetryReasonRef.current = "caller_visibility_slo_miss";
      void pushCallTelemetry("state_change");
    }
  }, [activeCall?.is_active, meJoinedInActiveCall, pushCallTelemetry]);

  useEffect(() => {
    if (!activeCall || !activeCall.is_active) {
      if (telemetryIntervalRef.current) {
        window.clearInterval(telemetryIntervalRef.current);
        telemetryIntervalRef.current = null;
      }
      return;
    }
    void pushCallTelemetry("state_change");
    if (!telemetryIntervalRef.current) {
      telemetryIntervalRef.current = window.setInterval(() => {
        void pushCallTelemetry("interval");
      }, 8000);
    }
    return () => {
      if (telemetryIntervalRef.current) {
        window.clearInterval(telemetryIntervalRef.current);
        telemetryIntervalRef.current = null;
      }
    };
  }, [activeCall, pushCallTelemetry]);

  useEffect(() => {
    if (!activeCall?.is_active) return;
    void pushCallTelemetry("media_change");
  }, [activeCall?.is_active, connectionState, mediaError, micEnabled, cameraEnabled, isPresenting, pushCallTelemetry]);

  useEffect(() => {
    if (!activeCall?.is_active) return;
    const reason = pendingRecoveryTelemetryReasonRef.current;
    if (!reason) return;
    pendingRecoveryTelemetryReasonRef.current = null;
    void pushCallTelemetry(reason);
  }, [activeCall?.is_active, mediaError, localAudioTrackPresent, remoteAudioTracksCount, pushCallTelemetry]);

  useEffect(() => {
    if (!activeCall?.is_active) return;
    if (!meJoinedInActiveCall || !micEnabled || !publishMissingLocal) {
      publishMissingSinceRef.current = null;
      if (publishRecoveryPhaseRef.current !== "idle") {
        publishRecoveryPhaseRef.current = "idle";
        publishRecoveryStartedAtRef.current = null;
      }
      return;
    }
    const nowMs = Date.now();
    if (!publishMissingSinceRef.current) {
      publishMissingSinceRef.current = nowMs;
      return;
    }
    if (nowMs - publishMissingSinceRef.current < 4000) return;
    if (publishRecoveryAttemptedRef.current) return;
    publishRecoveryAttemptedRef.current = true;
    setMediaError("Microphone publish recovering…");
    void recoverLocalAudioPublish().then((recovered) => {
      if (recovered) {
        setConnectionState("connected");
        void pushCallTelemetry("state_change");
      }
    });
  }, [activeCall?.is_active, meJoinedInActiveCall, micEnabled, publishMissingLocal, recoverLocalAudioPublish, pushCallTelemetry]);

  useEffect(() => {
    if (!activeCall?.is_active || !meJoinedInActiveCall) {
      remoteTrackTimeoutSinceRef.current = null;
      remoteTrackRecoveryAttemptedRef.current = false;
      return;
    }
    const expectsRemote = Number(activeCall.joined_count || 0) > 1;
    if (!expectsRemote || remoteAudioTracksCount > 0) {
      remoteTrackTimeoutSinceRef.current = null;
      remoteTrackRecoveryAttemptedRef.current = false;
      return;
    }
    const nowMs = Date.now();
    if (!remoteTrackTimeoutSinceRef.current) {
      remoteTrackTimeoutSinceRef.current = nowMs;
      return;
    }
    if (nowMs - remoteTrackTimeoutSinceRef.current < 5000) return;
    if (remoteTrackRecoveryAttemptedRef.current) return;
    remoteTrackRecoveryAttemptedRef.current = true;
    setMediaError("Waiting for remote audio… trying to resubscribe.");
    runRemoteAudioRecoveryAssist("zero_remote_track_timeout");
  }, [activeCall, meJoinedInActiveCall, remoteAudioTracksCount, runRemoteAudioRecoveryAssist]);

  const connectLiveKitRoom = useCallback(
    async (conversationId: number, roomId: number) => {
      if (liveKitRoomRef.current && liveKitConnectedRef.current) {
        setConnectionState("connected");
        return liveKitRoomRef.current;
      }
      if (connectInFlightRef.current) {
        return connectInFlightRef.current;
      }
      disconnectingRef.current = false;
      setConnectionState("connecting");
      connectInFlightRef.current = (async () => {
        if (typeof navigator !== "undefined" && navigator.mediaDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasMic = devices.some((d) => d.kind === "audioinput");
            if (!hasMic) {
              setMediaError("No microphone device found.");
            }
          } catch {
            // no-op
          }
        }
        if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
          try {
            const perm = await (navigator as any).permissions.query({ name: "microphone" as PermissionName });
            if (perm?.state === "denied") {
              throw new ApiError("Microphone permission is denied. Please allow microphone access.", 403);
            }
          } catch (error) {
            if (error instanceof ApiError) throw error;
          }
        }
        const sessionId = getStableCallSessionId(roomId);
        currentCallSessionIdRef.current = sessionId;
        const tokenData = await apiFetchJson<LiveKitSessionToken>(
          `/api/chat/conversations/${conversationId}/calls/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
            body: JSON.stringify({ session_id: sessionId, client_kind: getCallClientKind() }),
          },
        );
        if (!tokenData.token || !tokenData.livekit_url) {
          throw new ApiError(tokenData.user_message || "Missing LiveKit token.", 503);
        }
        liveKitIdentityRef.current = tokenData.livekit_identity || null;
        const livekit = await import("livekit-client");
        const room = new livekit.Room({
          adaptiveStream: true,
          dynacast: true,
        });
        liveKitRoomRef.current = room;
        const attachRemoteAudioTrack = (track: any, publication: any, participant: any) => {
          try {
            if (track?.kind !== "audio") return;
            remoteTrackSeenRef.current = true;
            lastLiveKitEventRef.current = "track_subscribed";
            const key = String(publication?.trackSid || `${participant?.identity || "p"}-${Date.now()}`);
            if (liveKitAudioRef.current.has(key)) {
              setRemoteAudioTracksCount(readLiveKitAudioState().remoteAudioTrackCount);
              return;
            }
            const mediaEl = track.attach() as HTMLMediaElement;
            mediaEl.autoplay = true;
            mediaEl.muted = false;
            mediaEl.volume = 1;
            mediaEl.setAttribute("playsinline", "true");
            if (!mediaEl.parentElement && typeof document !== "undefined") {
              mediaEl.style.position = "fixed";
              mediaEl.style.width = "1px";
              mediaEl.style.height = "1px";
              mediaEl.style.opacity = "0";
              mediaEl.style.pointerEvents = "none";
              mediaEl.setAttribute("aria-hidden", "true");
              document.body.appendChild(mediaEl);
            }
            liveKitAudioRef.current.set(key, mediaEl);
            trackAttachCountRef.current += 1;
            setRemoteAudioTracksCount(readLiveKitAudioState().remoteAudioTrackCount);
            void mediaEl.play().then(() => {
              playbackStartedRef.current = true;
              setMediaError(null);
              void pushCallTelemetry("state_change");
            }).catch(() => {
              setMediaError("Tap Retry audio to start remote playback.");
              void pushCallTelemetry("state_change");
            });
          } catch {
            setMediaError("Unable to attach remote audio track.");
          }
        };
        const scanRemoteAudioTracks = () => {
          for (const participant of Array.from(room.remoteParticipants.values()) as any[]) {
            for (const publication of Array.from(participant?.audioTrackPublications?.values?.() || []) as any[]) {
              if (publication?.track) attachRemoteAudioTrack(publication.track, publication, participant);
            }
          }
        };
        room.on(livekit.RoomEvent.Reconnecting, () => {
          lastLiveKitEventRef.current = "reconnecting";
          setConnectionState("reconnecting");
        });
        room.on(livekit.RoomEvent.Reconnected, () => {
          lastLiveKitEventRef.current = "reconnected";
          scanRemoteAudioTracks();
          const hasRemote = liveKitAudioRef.current.size > 0;
          setConnectionState("connected");
          if (hasRemote) setMediaError(null);
        });
        room.on(livekit.RoomEvent.Disconnected, () => {
          lastLiveKitEventRef.current = "disconnected";
          liveKitConnectedRef.current = false;
          if (disconnectingRef.current || callStateRef.current === "idle") {
            setConnectionState("idle");
            return;
          }
          setConnectionState("failed");
          setMediaError("Connection lost. Click Retry to reconnect audio.");
        });
        room.on(livekit.RoomEvent.LocalTrackUnpublished, (publication: any) => {
          lastLiveKitEventRef.current = "local_track_unpublished";
          const src = String(publication?.source || "").toLowerCase();
          if (src.includes("screen")) {
            setIsPresenting(false);
          }
          const { localAudioPublished } = readLiveKitAudioState();
          setLocalAudioTrackPresent(localAudioPublished);
          void pushCallTelemetry("state_change");
        });
        room.on(livekit.RoomEvent.LocalTrackPublished, () => {
          lastLiveKitEventRef.current = "local_track_published";
          const { localAudioPublished } = readLiveKitAudioState();
          setLocalAudioTrackPresent(localAudioPublished);
          if (localAudioPublished) {
            setMediaError(null);
            publishMissingSinceRef.current = null;
            publishRecoveryAttemptedRef.current = false;
          }
          void pushCallTelemetry("state_change");
        });
        room.on(livekit.RoomEvent.ConnectionStateChanged, (state: string) => {
          lastLiveKitEventRef.current = `connection_${state}`;
          if (state === "connected") {
            const hasRemote = liveKitAudioRef.current.size > 0;
            setConnectionState("connected");
            if (hasRemote) setMediaError(null);
          } else if (state === "connecting") {
            setConnectionState("connecting");
          } else if (state === "reconnecting") {
            setConnectionState("reconnecting");
          } else if (state === "disconnected" && !disconnectingRef.current && callStateRef.current !== "idle") {
            setConnectionState("failed");
          }
        });
        room.on(livekit.RoomEvent.ParticipantConnected, () => {
          lastLiveKitEventRef.current = "participant_connected";
          window.setTimeout(scanRemoteAudioTracks, 250);
          void pushCallTelemetry("state_change");
        });
        room.on(livekit.RoomEvent.TrackSubscribed, (track: any, publication: any, participant: any) => {
          attachRemoteAudioTrack(track, publication, participant);
        });
        room.on(livekit.RoomEvent.TrackUnsubscribed, (track: any, publication: any) => {
          lastLiveKitEventRef.current = "track_unsubscribed";
          try {
            const key = String(publication?.trackSid || "");
            const mediaEl = key ? liveKitAudioRef.current.get(key) : null;
            if (mediaEl) {
              mediaEl.pause();
              try {
                track?.detach?.(mediaEl);
              } catch {
                // no-op
              }
              if (mediaEl.parentElement) {
                mediaEl.parentElement.removeChild(mediaEl);
              }
              liveKitAudioRef.current.delete(key);
              setRemoteAudioTracksCount(readLiveKitAudioState().remoteAudioTrackCount);
            }
          } catch {
            // no-op
          }
          void pushCallTelemetry("state_change");
        });
        await room.connect(tokenData.livekit_url, tokenData.token, {
          autoSubscribe: true,
        });
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(false).catch(() => {});
        liveKitConnectedRef.current = true;
        setMicEnabled(true);
        const firstAudioState = readLiveKitAudioState();
        setLocalAudioTrackPresent(firstAudioState.localAudioPublished);
        setRemoteAudioTracksCount(firstAudioState.remoteAudioTrackCount);
        setCameraEnabled(false);
        setConnectionState("connected");
        scanRemoteAudioTracks();
        window.setTimeout(scanRemoteAudioTracks, 800);
        reconnectAttemptedRef.current = false;
        window.setTimeout(() => {
          if (liveKitAudioRef.current.size === 0 && (callStateRef.current === "connected" || callStateRef.current === "connecting")) {
            if (!reconnectAttemptedRef.current && room?.localParticipant) {
              reconnectAttemptedRef.current = true;
              void room.localParticipant.setMicrophoneEnabled(false)
                .then(() => room.localParticipant.setMicrophoneEnabled(true))
                .then(() => {
                  setMicEnabled(true);
                })
                .catch(() => {});
            } else {
              setMediaError("Connected, waiting for remote audio… tap Retry if it does not recover.");
            }
          }
        }, 5000);
        return room;
      })();
      try {
        return await connectInFlightRef.current;
      } finally {
        connectInFlightRef.current = null;
      }
    },
    [pushCallTelemetry, readLiveKitAudioState],
  );

  const sendSignal = useCallback(
    async (
      roomId: number,
      signalType: "offer" | "answer" | "ice" | "leave" | "presenting" | "media_repair",
      payload: Record<string, unknown>,
      toUserId?: number
    ) => {
      await callApiWithRetry(`/api/chat/calls/${roomId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal_type: signalType,
          payload,
          to_user_id: Number.isFinite(Number(toUserId)) ? Number(toUserId) : null,
        }),
      }, { retries: 1, retryDelayMs: 140 });
    },
    []
  );

  const ensureLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const n = (data[i] - 128) / 128;
          sum += n * n;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 2));
        analyzerRef.current!.raf = requestAnimationFrame(tick);
      };
      analyzerRef.current = { raf: requestAnimationFrame(tick), audioCtx, analyser };
      setMediaError(null);
      return stream;
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Microphone access failed.");
      throw error;
    }
  }, []);

  const ensurePeerConnection = useCallback(
    async (roomId: number, remoteUserId: number) => {
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: getRtcIceServers() as RTCIceServer[] });
      const stream = await ensureLocalMedia();
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(roomId, "ice", { candidate: event.candidate }, remoteUserId).catch(() => {});
      };
      pc.ontrack = (event) => {
        const streamIn = event.streams[0];
        if (!streamIn) return;
        let audio = remoteAudioRef.current.get(remoteUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          remoteAudioRef.current.set(remoteUserId, audio);
        }
        audio.srcObject = streamIn;
        void audio.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          try {
            pc.restartIce();
          } catch {
            // no-op
          }
        }
      };
      peerConnectionsRef.current.set(remoteUserId, pc);
      return pc;
    },
    [ensureLocalMedia, sendSignal]
  );

  const handleIncomingSignal = useCallback(
    async (roomId: number, signal: CallSignal) => {
      const fromUserId = Number(signal.from_user_id || 0);
      if (!fromUserId || fromUserId === Number(currentUserId || 0)) return;
      if (signal.signal_type === "leave") {
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(fromUserId);
        }
        const audio = remoteAudioRef.current.get(fromUserId);
        if (audio) {
          audio.pause();
          remoteAudioRef.current.delete(fromUserId);
        }
        return;
      }
      if (signal.signal_type === "moderation_end") {
        setCallState("idle");
        setActiveRoomId(null);
        stopMediaSession();
        onToast("Call ended by moderator.", "info");
        return;
      }
      if (signal.signal_type === "moderation_remove") {
        setCallState("idle");
        setActiveRoomId(null);
        stopMediaSession();
        onToast("You were removed from the call.", "error");
        return;
      }
      if (signal.signal_type === "moderation_mute") {
        if (liveKitRoomRef.current?.localParticipant) {
          await liveKitRoomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        }
        if (localStreamRef.current) {
          for (const track of localStreamRef.current.getAudioTracks()) track.enabled = false;
        }
        setMicEnabled(false);
        onToast("You were muted by moderator.", "info");
        return;
      }
      if (signal.signal_type === "moderation_unmute") {
        if (liveKitRoomRef.current?.localParticipant) {
          await liveKitRoomRef.current.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        }
        if (localStreamRef.current) {
          for (const track of localStreamRef.current.getAudioTracks()) track.enabled = true;
        }
        setMicEnabled(true);
        onToast("You were unmuted by moderator.", "info");
        return;
      }
      if (signal.signal_type === "media_repair") {
        const room = liveKitRoomRef.current;
        if (room?.localParticipant) {
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          await room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
          setMicEnabled(true);
        }
        setMediaError(null);
        onToast("Voice repair requested. Re-publishing microphone…", "info");
        return;
      }
      const pc = await ensurePeerConnection(roomId, fromUserId);
      if (signal.signal_type === "offer") {
        const sdp = signal.payload?.sdp as RTCSessionDescriptionInit | undefined;
        if (!sdp) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(roomId, "answer", { sdp: answer }, fromUserId);
        return;
      }
      if (signal.signal_type === "answer") {
        const sdp = signal.payload?.sdp as RTCSessionDescriptionInit | undefined;
        if (!sdp || !pc.localDescription) return;
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        connectingPeersRef.current.delete(fromUserId);
        setCallState("connected");
        return;
      }
      if (signal.signal_type === "ice") {
        const candidate = signal.payload?.candidate as RTCIceCandidateInit | undefined;
        if (!candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    },
    [currentUserId, ensurePeerConnection, sendSignal, stopMediaSession, onToast]
  );

  useEffect(() => {
    if (liveKitPrimary) return;
    if (!activeRoomId || (callState !== "connecting" && callState !== "connected" && callState !== "outgoing-ringing")) {
      if (signalPollRef.current) {
        window.clearInterval(signalPollRef.current);
        signalPollRef.current = null;
      }
      return;
    }
    if (signalPollRef.current) return;
    const pollSignals = async () => {
      try {
        const data = await callApiWithRetry<{ signals: CallSignal[] }>(
          `/api/chat/calls/${activeRoomId}/signal?after_id=${signalCursorRef.current}`,
          { method: "GET" },
          { retries: 1, retryDelayMs: 120 }
        );
        for (const signal of data.signals || []) {
          signalCursorRef.current = Math.max(signalCursorRef.current, Number(signal.id || 0));
          await handleIncomingSignal(activeRoomId, signal);
        }
      } catch {
        // no-op
      }
    };
    void pollSignals();
    const pollMs = callState === "outgoing-ringing" || callState === "connecting" ? 600 : 650;
    signalPollRef.current = window.setInterval(() => void pollSignals(), pollMs);
    return () => {
      if (signalPollRef.current) {
        window.clearInterval(signalPollRef.current);
        signalPollRef.current = null;
      }
    };
  }, [activeRoomId, callState, handleIncomingSignal, liveKitPrimary]);

  useEffect(() => {
    if (liveKitPrimary) return;
    if (!activeCall || !activeRoomId || activeCall.id !== activeRoomId) return;
    if (callState !== "connected" && callState !== "connecting" && callState !== "outgoing-ringing") return;
    const myId = Number(currentUserId || 0);
    if (!myId) return;
    const peers = (activeCall.joined_user_ids ?? []).filter((id) => id !== myId);
    for (const peerId of peers) {
      if (peerConnectionsRef.current.has(peerId) || connectingPeersRef.current.has(peerId)) continue;
      const shouldOffer = myId < peerId;
      void (async () => {
        connectingPeersRef.current.add(peerId);
        try {
          const pc = await ensurePeerConnection(activeRoomId, peerId);
          if (shouldOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(activeRoomId, "offer", { sdp: offer }, peerId);
            setCallState("connecting");
          }
        } catch {
          // no-op
        } finally {
          if (!shouldOffer) connectingPeersRef.current.delete(peerId);
        }
      })();
    }
    for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
      if (!peers.includes(peerId)) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }
    }
  }, [activeCall, activeRoomId, callState, currentUserId, ensurePeerConnection, sendSignal, liveKitPrimary]);

  useEffect(() => {
    signalCursorRef.current = 0;
  }, [activeRoomId]);

  useEffect(() => {
    if (callState === "idle") {
      stopMediaSession();
    }
  }, [callState, stopMediaSession]);

  useEffect(() => {
    return () => {
      stopMediaSession();
    };
  }, [stopMediaSession]);

  const launchCall = useCallback(
    async (mode: "call" | "screenshare") => {
      if (callActionRef.current.joining || callActionRef.current.ending) return;
      if (!prejoinBypassRef.current) {
        pendingCallIntentRef.current = { kind: "launch", mode };
        setShowPrejoin(true);
        setPrejoinBusy(true);
        const result = await runPrejoinDiagnostics().catch(() => null);
        setPrejoinStatus(result);
        setPrejoinBusy(false);
        return;
      }
      prejoinBypassRef.current = false;
      try {
        callActionRef.current.joining = true;
        if (activeCall) {
        setRingDismissedRoomId(null);
        setActiveRoomId(activeCall.id);
        setCallState("connecting");
        setConnectionState("connecting");
        const joinRes = await apiFetchJson<{ operation_status?: string; user_message?: string }>(`/api/chat/calls/${activeCall.id}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
          body: JSON.stringify(buildCallSessionPayload(activeCall.id)),
        });
        try {
          await connectLiveKitRoom(conversation.id, activeCall.id);
          setCallState("connected");
          setConnectionState("connected");
          setMediaError(null);
          void pushCallTelemetry("state_change");
          onToast(joinRes.user_message || "Joined active call.", "success");
        } catch (connectError) {
          setCallState("connecting");
          setConnectionState("reconnecting");
          const rawMsg = connectError instanceof ApiError ? connectError.message : "Joined call, but audio is still connecting.";
          const msg = /request failed/i.test(rawMsg) ? "Joined call. Establishing audio channel…" : rawMsg;
          setMediaError(msg);
          void pushCallTelemetry("state_change");
          onToast(msg, "info");
        }
          void mutateCalendar();
          void mutateCallState();
          return;
        }
        setCallLoading(mode);
        const data = await apiFetchJson<{ join_link: string | null; user_message?: string; room?: { id?: number } }>(
          `/api/chat/conversations/${conversation.id}/calls`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
            body: JSON.stringify({ mode, duration_minutes: 30 }),
          }
        );
        const roomIdFromCreate = Number(data?.room?.id || 0);
        const roomId = roomIdFromCreate > 0 ? roomIdFromCreate : null;
        if (roomId) {
          await apiFetchJson(`/api/chat/calls/${roomId}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
            body: JSON.stringify(buildCallSessionPayload(roomId)),
          });
          setRingDismissedRoomId(null);
          setActiveRoomId(roomId);
          setCallState("connecting");
          setConnectionState("connecting");
          try {
            await connectLiveKitRoom(conversation.id, roomId);
            setCallState("connected");
            setConnectionState("connected");
            setMediaError(null);
            void pushCallTelemetry("state_change");
          } catch (connectError) {
            setCallState("connecting");
            setConnectionState("reconnecting");
            const rawMsg = connectError instanceof ApiError ? connectError.message : "Call started, but audio is still connecting.";
            const msg = /request failed/i.test(rawMsg) ? "Call started. Establishing audio channel…" : rawMsg;
            setMediaError(msg);
            void pushCallTelemetry("state_change");
            onToast(msg, "info");
          }
          await apiFetchJson(`/api/chat/conversations/${conversation.id}/calls/ring`, { method: "POST" }).catch(() => {});
        }
        onToast(data.user_message || (mode === "screenshare" ? "Screen share started." : "Call started."), "success");
        void mutateCalendar();
        void mutateCallState();
        void mutateMessages();
        onMutateConversations();
        setDrawerView("calendar");
      } catch (error) {
        const msg = mapCallActionError(error, "Unable to start call.");
        onToast(msg, "error");
      } finally {
        callActionRef.current.joining = false;
        setCallLoading(null);
      }
    },
    [activeCall, buildCallSessionPayload, connectLiveKitRoom, conversation.id, mutateCalendar, mutateCallState, mutateMessages, onMutateConversations, onToast, pushCallTelemetry, runPrejoinDiagnostics]
  );

  const endActiveCall = useCallback(
    async (eventId: number) => {
      if (callActionRef.current.ending) return;
      setCallState("idle");
      setActiveRoomId(null);
      setRingDismissedRoomId(eventId);
      setConnectionState("idle");
      setMediaError(null);
      stopMediaSession();
      try {
        callActionRef.current.ending = true;
        await callApiWithRetry(`/api/chat/conversations/${conversation.id}/calls/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
          body: JSON.stringify({ reason: "ended" }),
        }, { retries: 2, retryDelayMs: 240 });
        onToast("Call ended.", "success");
        window.setTimeout(() => {
          void mutateCallState();
          void mutateCalendar();
        }, 350);
        void mutateCalendar();
        void mutateCallState();
        void mutateMessages();
        onMutateConversations();
      } catch (error) {
        // Keep local teardown optimistic; reconcile from server state.
        const msg = mapCallActionError(error, "Unable to end call.");
        onToast(msg, "error");
        void mutateCallState();
      } finally {
        callActionRef.current.ending = false;
      }
    },
    [conversation.id, mutateCalendar, mutateCallState, mutateMessages, onMutateConversations, onToast, stopMediaSession]
  );

  const joinCallRoom = useCallback(
    async (roomId: number, successMessage = "Joined call.") => {
      if (callActionRef.current.joining) return;
      if (!prejoinBypassRef.current) {
        pendingCallIntentRef.current = { kind: "join", roomId, successMessage };
        setShowPrejoin(true);
        setPrejoinBusy(true);
        const result = await runPrejoinDiagnostics().catch(() => null);
        setPrejoinStatus(result);
        setPrejoinBusy(false);
        return;
      }
      prejoinBypassRef.current = false;
      if (activeCall && Number(activeCall.id) === Number(roomId) && activeCall.can_join === false) {
        setCallState("idle");
        setActiveRoomId(null);
        setRingDismissedRoomId(roomId);
        onToast("This call is no longer active.", "info");
        void mutateCallState();
        return;
      }
      try {
        callActionRef.current.joining = true;
        setRingDismissedRoomId(null);
        setActiveRoomId(roomId);
        setCallState("connecting");
        setConnectionState("connecting");
        const joinRes = await apiFetchJson<{ operation_status?: string; user_message?: string }>(`/api/chat/calls/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
          body: JSON.stringify(buildCallSessionPayload(roomId)),
        });
        try {
          await connectLiveKitRoom(conversation.id, roomId);
          setCallState("connected");
          setConnectionState("connected");
          setMediaError(null);
          void pushCallTelemetry("state_change");
          onToast(joinRes.user_message || successMessage, "success");
        } catch (connectError) {
          setCallState("connecting");
          setConnectionState("reconnecting");
          const rawMsg = connectError instanceof ApiError ? connectError.message : "Joined call, but audio is still connecting.";
          const msg = /request failed/i.test(rawMsg) ? "Joined call. Establishing audio channel…" : rawMsg;
          setMediaError(msg);
          void pushCallTelemetry("state_change");
          onToast(msg, "info");
        }
        void mutateCalendar();
        void mutateCallState();
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setCallState("idle");
          setActiveRoomId(null);
          setRingDismissedRoomId(roomId);
          onToast("This call has already ended.", "info");
          void mutateCalendar();
          void mutateCallState();
          return;
        }
        const msg = mapCallActionError(error, "Unable to join call.");
        onToast(msg, "error");
      } finally {
        callActionRef.current.joining = false;
      }
    },
    [activeCall, buildCallSessionPayload, connectLiveKitRoom, conversation.id, mutateCalendar, mutateCallState, onToast, pushCallTelemetry, runPrejoinDiagnostics]
  );

  const retryCallConnection = useCallback(async () => {
    if (!activeCall) return;
    const roomId = Number(activeCall.id || 0);
    if (!roomId) return;
    try {
      setConnectionState("connecting");
      setMediaError(null);
      await apiFetchJson(`/api/chat/calls/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
        body: JSON.stringify(buildCallSessionPayload(roomId)),
      });
      setActiveRoomId(roomId);
      setCallState("connecting");
      await connectLiveKitRoom(conversation.id, roomId);
      setCallState("connected");
      setConnectionState("connected");
      setMediaError(null);
      void mutateCalendar();
      void mutateCallState();
      onToast("Reconnected to call.", "success");
    } catch (error) {
      setConnectionState("failed");
      const msg = mapCallActionError(error, "Unable to reconnect.");
      setMediaError(msg);
      onToast(msg, "error");
    }
  }, [activeCall, buildCallSessionPayload, connectLiveKitRoom, conversation.id, mutateCalendar, mutateCallState, onToast]);

  const dismissIncomingCall = useCallback((roomId: number, toastMessage = "Call dismissed.") => {
    setActiveRoomId((curr) => (curr === roomId ? null : curr));
    setRingDismissedRoomId(roomId);
    setCallState("idle");
    setConnectionState("idle");
    setMediaError(null);
    stopMediaSession();
    if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    void apiFetchJson(`/api/chat/calls/${roomId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
      body: JSON.stringify(buildCallSessionPayload(roomId)),
    }).catch(() => {});
    void mutateCallState();
    onToast(toastMessage, "success");
  }, [buildCallSessionPayload, mutateCallState, onToast, stopMediaSession]);

  const moderateCall = useCallback(
    async (action: "mute_participant" | "unmute_participant" | "remove_participant" | "end_for_all", targetUserId?: number) => {
      if (!activeCall) return;
      if (activeCall.signal_schema_ready === false) {
        onToast("Call control is temporarily gated. Run latest call migrations and retry.", "info");
        return;
      }
      const busyKey =
        action === "end_for_all"
          ? "end_all"
          : action === "remove_participant"
            ? "remove"
            : action === "unmute_participant"
              ? "unmute"
              : "mute";
      setModerationBusy(busyKey);
      try {
        const stableIdempotencyKey =
          action === "end_for_all" ? `end-all-${activeCall.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : undefined;
        const callModerate = async () =>
          apiFetchJson<{ operation_status?: string; user_message?: string; hint?: string }>(
            `/api/chat/calls/${activeCall.id}/moderate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...buildCallMutationHeadersWithKey(stableIdempotencyKey) },
              body: JSON.stringify({ action, target_user_id: targetUserId ?? null }),
            }
          );
        let res: { operation_status?: string; user_message?: string; hint?: string } | null = null;
        if (action === "end_for_all") {
          const waits = [0, 400, 900, 1800];
          for (let i = 0; i < waits.length; i += 1) {
            if (i > 0) {
              onToast("Ending call… retrying in background", "info");
            }
            if (waits[i] > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, waits[i]));
            }
            try {
              const attempt = await callModerate();
              res = attempt;
              if (attempt.operation_status !== "error") break;
            } catch (attemptError) {
              if (i === waits.length - 1) throw attemptError;
            }
          }
        } else {
          res = await callModerate();
        }
        if (!res) throw new ApiError("Unable to confirm call action.", 503);
        onToast(res.user_message || "Moderation action applied.", res.operation_status === "blocked" ? "info" : "success");
        if (action === "end_for_all") {
          setCallState("idle");
          setActiveRoomId(null);
          setRingDismissedRoomId(Number(activeCall.id || 0));
          setConnectionState("idle");
          setMediaError(null);
          stopMediaSession();
          window.setTimeout(() => {
            void mutateCallState();
            void mutateCalendar();
          }, 350);
        }
        void mutateCalendar();
        void mutateCallState();
        void mutateMessages();
      } catch (error) {
        const msg = mapCallActionError(error, "Moderation action failed.");
        onToast(msg, "error");
      } finally {
        setModerationBusy(null);
      }
    },
    [activeCall, mutateCalendar, mutateCallState, mutateMessages, onToast, stopMediaSession]
  );

  const copyCallDiagnostics = useCallback(async () => {
    if (!activeCall) return;
    try {
      const data = await apiFetchJson<{ diagnostics: unknown }>(`/api/chat/calls/${activeCall.id}/diagnostics`);
      const text = JSON.stringify(data.diagnostics || {}, null, 2);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      onToast("Call diagnostics copied.", "success");
    } catch (error) {
      const msg = mapCallActionError(error, "Unable to copy diagnostics.");
      onToast(msg, "error");
    }
  }, [activeCall, onToast]);

  const requestVoiceRepair = useCallback(async () => {
    if (!activeCall) return;
    if (activeCall.signal_schema_ready === false) {
      onToast("Voice repair is disabled until call schema prerequisites are updated.", "info");
      return;
    }
    const roomId = Number(activeCall.id || 0);
    if (!roomId) return;
    try {
      await sendSignal(roomId, "media_repair", {}, undefined);
      const recovered = await recoverLocalAudioPublish();
      void pushCallTelemetry("state_change");
      if (recovered) {
        setConnectionState("connected");
        onToast("Voice repair triggered. Microphone republished.", "success");
      } else {
        onToast("Voice repair attempted. Please tap Retry if audio is still missing.", "info");
      }
    } catch (error) {
      const msg = mapCallActionError(error, "Unable to trigger voice repair.");
      onToast(msg, "error");
    }
  }, [activeCall, onToast, recoverLocalAudioPublish, sendSignal, pushCallTelemetry]);

  const retryPrejoinChecks = useCallback(async () => {
    setPrejoinBusy(true);
    const result = await runPrejoinDiagnostics().catch(() => null);
    setPrejoinStatus(result);
    setPrejoinBusy(false);
  }, [runPrejoinDiagnostics]);

  const proceedFromPrejoin = useCallback(async () => {
    if (prejoinStatus) {
      prejoinSummaryPendingRef.current = prejoinStatus;
      if (prejoinStatus.status === "failed") {
        setMediaError(prejoinStatus.messages[0] || "Prejoin checks failed.");
      } else if (prejoinStatus.status === "warning") {
        setMediaError(prejoinStatus.messages[0] || "Prejoin warning detected.");
      }
    }
    const intent = pendingCallIntentRef.current;
    pendingCallIntentRef.current = null;
    setShowPrejoin(false);
    if (!intent) return;
    prejoinBypassRef.current = true;
    if (intent.kind === "launch" && intent.mode) {
      await launchCall(intent.mode);
      return;
    }
    if (intent.kind === "join" && intent.roomId) {
      await joinCallRoom(intent.roomId, intent.successMessage || "Joined call.");
    }
  }, [joinCallRoom, launchCall, prejoinStatus]);

  const cancelPrejoin = useCallback(() => {
    pendingCallIntentRef.current = null;
    prejoinBypassRef.current = false;
    setShowPrejoin(false);
    setCallLoading(null);
  }, []);

  const leaveCurrentCall = useCallback(
    async (roomId: number) => {
      try {
        await apiFetchJson(`/api/chat/calls/${roomId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildCallMutationHeaders() },
          body: JSON.stringify(buildCallSessionPayload(roomId)),
        }).catch(() => {});
        await sendSignal(roomId, "leave", {}).catch(() => {});
      } finally {
        setCallState("idle");
        setActiveRoomId(null);
        stopMediaSession();
        void mutateCalendar();
        void mutateCallState();
      }
    },
    [buildCallSessionPayload, mutateCalendar, mutateCallState, sendSignal, stopMediaSession]
  );

  const toggleScreenShare = useCallback(
    async (roomId: number) => {
      if (callActionRef.current.sharing || !liveKitRoomRef.current?.localParticipant) return;
      try {
        callActionRef.current.sharing = true;
        const next = !isPresenting;
        await liveKitRoomRef.current.localParticipant.setScreenShareEnabled(next);
        await sendSignal(roomId, "presenting", { enabled: next }).catch(() => {});
        setIsPresenting(next);
        onToast(next ? "Screen sharing started." : "Screen sharing stopped.", "success");
      } catch (error) {
        const raw = error instanceof Error ? error.message : "Screen share unavailable.";
        let msg = raw;
        if (/permission|denied|not allowed|blocked/i.test(raw)) {
          msg = "Screen share permission denied. Please allow capture and try again.";
        } else if (/cancel|aborted|dismiss/i.test(raw)) {
          msg = "Screen share selection was cancelled.";
        } else if (!raw || raw === "Screen share unavailable.") {
          msg = "Unable to start screen share right now.";
        }
        onToast(msg, "error");
        setIsPresenting(false);
        await sendSignal(roomId, "presenting", { enabled: false }).catch(() => {});
      } finally {
        callActionRef.current.sharing = false;
      }
    },
    [isPresenting, onToast, sendSignal]
  );

  const setManualPresence = useCallback(
    async (manualPresence: "available" | "busy") => {
      try {
        await apiFetchJson("/api/chat/presence", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manual_presence: manualPresence }),
        });
        onToast(`Status set to ${manualPresence === "busy" ? "Busy" : "Available"}.`, "success");
        void mutatePresence();
      } catch (error) {
        const msg = error instanceof ApiError ? error.message : "Unable to update status.";
        onToast(msg, "error");
      }
    },
    [mutatePresence, onToast]
  );

  return (
    <div
      className="relative flex w-full min-w-0"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        const current = e.currentTarget.getBoundingClientRect();
        if (e.clientX < current.left || e.clientX > current.right || e.clientY < current.top || e.clientY > current.bottom) {
          setDragOver(false);
        }
      }}
      onDrop={onDropZone}
    >
      <section className="flex min-w-0 flex-1 flex-col">
        <header className={CHAT_UI_V2_ENABLED ? styles.workspaceHeader : "border-b border-[#2b3346] bg-[#10172b]/95 px-5 py-3 backdrop-blur"}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="rounded p-1 hover:bg-slate-100 md:hidden">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className={`grid h-10 w-10 place-items-center rounded-xl text-xs font-bold text-white shadow-sm ${avatarColor(conversation.id)}`}>
              {conversation.type === "group" ? <Users className="h-4 w-4" /> : initials(convLabel(conversation, currentUserId))}
            </div>
            <div className="min-w-0 flex-1">
              <p className={CHAT_UI_V2_ENABLED ? styles.conversationTitle : "truncate text-base font-bold tracking-tight text-slate-100"}>{convLabel(conversation, currentUserId)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--chat-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {conversation.type === "group" ? `${safeConversationMembers.length} members` : "Direct message · Available"}
              </p>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button
                type="button"
                onClick={async () => launchCall("call")}
                disabled={callLoading !== null}
                className={styles.primaryAction}
              >
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                {callLoading === "call" ? "Starting…" : "Call"}
              </button>
              <button
                type="button"
                onClick={async () => launchCall("screenshare")}
                disabled={callLoading !== null}
                className={styles.primaryAction}
              >
                <MonitorUp className="mr-1 inline h-3.5 w-3.5" />
                {callLoading === "screenshare" ? "Starting…" : "Share"}
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "calendar" ? null : "calendar"))}
                className={[styles.secondaryAction, drawerView === "calendar" ? "border-[var(--chat-primary)] bg-[var(--chat-surface-teal)] text-[var(--chat-primary)]" : ""].join(" ")}
              >
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "details" ? null : "details"))}
                className={[styles.secondaryAction, drawerView === "details" ? "border-[var(--chat-primary)] bg-[var(--chat-surface-teal)] text-[var(--chat-primary)]" : ""].join(" ")}
              >
                <Info className="mr-1 inline h-3.5 w-3.5" />
                Details
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "pins" ? null : "pins"))}
                className={[styles.secondaryAction, drawerView === "pins" ? "border-[var(--chat-primary)] bg-[var(--chat-surface-teal)] text-[var(--chat-primary)]" : ""].join(" ")}
              >
                <Pin className="mr-1 inline h-3.5 w-3.5" />
                Pins
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "notify" ? null : "notify"))}
                className={[styles.secondaryAction, drawerView === "notify" ? "border-[var(--chat-primary)] bg-[var(--chat-surface-teal)] text-[var(--chat-primary)]" : ""].join(" ")}
              >
                <Bell className="mr-1 inline h-3.5 w-3.5" />
                Notify
              </button>
              <select
                value={presenceData?.manual_presence || "available"}
                onChange={async (e) => {
                  await setManualPresence(e.target.value === "busy" ? "busy" : "available");
                }}
                className={`${styles.secondaryAction} px-2`}
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search in chat"
                className={`${styles.workspaceSearch} rounded-xl py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--chat-soft)]`}
              />
            </div>
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value as "all" | "conversation")}
              className={`${styles.secondaryAction} px-3`}
            >
              <option value="conversation">This chat</option>
              <option value="all">All chats</option>
            </select>
          </div>
          {searchQ.trim().length >= 2 && searchData ? (
            <div className="chat-scrollbar mt-2 max-h-32 overflow-y-auto rounded-md border border-[#364157] bg-[#0b1121] p-1.5">
              <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {searchData.results?.length ?? 0} matches
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQ("")}
                  className="text-[10px] font-medium text-indigo-600 hover:underline"
                >
                  Clear
                </button>
              </div>
              {(searchData.results ?? []).slice(0, 8).map((row) => (
                <button
                  key={`${row.conversation_id}-${row.id}`}
                  type="button"
                  onClick={() => {
                    if (row.conversation_id !== conversation.id) return;
                    const el = document.getElementById(`message-${row.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="w-full rounded px-2 py-1 text-left hover:bg-[#18223a]"
                >
                  <p className="truncate text-[11px] font-medium text-slate-200">{row.sender_name}</p>
                  <p className="truncate text-[11px] text-slate-400">{row.content}</p>
                </button>
              ))}
              {searchData.results?.length === 0 ? <p className="px-2 py-1 text-xs text-slate-400">No matches</p> : null}
            </div>
          ) : null}
        </header>

        <div className={`chat-scrollbar ${CHAT_UI_V2_ENABLED ? styles.timeline : "flex-1 overflow-y-auto bg-[linear-gradient(180deg,#0d1428_0%,#0a1020_100%)] px-5 py-4"}`}>
          {(pinData?.pins?.length ?? 0) > 0 ? (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <Pin className="h-3.5 w-3.5 text-amber-300" />
              {pinData!.pins.slice(0, 4).map((pin) => (
                <button
                  key={pin.pin_id}
                  type="button"
                  onClick={() => document.getElementById(`message-${pin.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="max-w-56 truncate rounded-md bg-[#2e2412] px-2 py-1 text-xs text-amber-100 shadow-sm hover:bg-[#3d3016]"
                  title={pin.content}
                >
                  {pin.content || pin.attachment_name || "Pinned message"}
                </button>
              ))}
            </div>
          ) : null}
          {showChatInfo ? (
            <div className="mb-3 rounded-xl border border-[#364157] bg-[#111a30] px-3 py-2 text-xs text-slate-300 shadow-sm">
              <span className="font-semibold text-slate-100">{conversation.type === "group" ? "Group chat" : "Direct chat"}</span>
              <span className="mx-2 text-slate-300">•</span>
              Last update {conversation.last_message?.created_at ? formatRelative(conversation.last_message.created_at) : "just now"}
              <span className="mx-2 text-slate-300">•</span>
              {safeConversationMembers.length} participant{safeConversationMembers.length === 1 ? "" : "s"}
            </div>
          ) : null}
          {grouped.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-slate-400">No messages yet. Start the conversation.</div>
          ) : null}
          <div className="space-y-1">
            {grouped.map((item, idx) =>
              item.type === "divider" ? (
                <div key={`day-${idx}`} className="my-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="rounded-full border border-[#3c4560] bg-[#121b30] px-3 py-1 text-[11px] font-semibold text-slate-300 shadow-sm">{item.label}</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              ) : (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  isMe={item.message.sender_id === currentUserId}
                  currentUserId={currentUserId}
                  showSender={item.showSender}
                  onOpenThread={() => setThreadParent(item.message)}
                  onMutateMessages={() => {
                    void mutateMessages();
                    onMutateConversations();
                  }}
                />
              )
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div className={CHAT_UI_V2_ENABLED ? styles.composerArea : "border-t border-[#2b3346] bg-[#10172b]/95 px-4 py-3 backdrop-blur"}>
          {uploadQueue.length > 0 ? (
            <div className="mb-2 space-y-1">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-[#3a4660] bg-[#0d1426] px-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatFileSize(item.size)} • {item.status === "uploading" ? "Uploading…" : item.status === "ready" ? "Ready" : item.error || "Failed"}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeUploadItem(item.id)} className="rounded-lg p-1 text-slate-400 transition hover:bg-indigo-500/15 hover:text-indigo-300">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className={CHAT_UI_V2_ENABLED ? styles.composer : ""}>
          <div className="mb-1 flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowEmoji((v) => !v);
                  setShowGif(false);
                }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-500/15 hover:text-indigo-300"
              >
                <Smile className="h-4 w-4" />
              </button>
              {showEmoji ? <EmojiPicker onClose={() => setShowEmoji(false)} onSelect={(emoji) => setMessageInput((prev) => prev + emoji)} /> : null}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowGif((v) => !v);
                  setShowEmoji(false);
                }}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-indigo-500/15 hover:text-indigo-300"
              >
                GIF
              </button>
              {showGif ? (
                <GifPicker
                  onClose={() => setShowGif(false)}
                  onSelect={async (gifUrl) => {
                    setShowGif(false);
                    await sendMessage("", { type: "image", url: gifUrl, name: "GIF", size: 0 });
                  }}
                />
              ) : null}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-500/15 hover:text-indigo-300">
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={async (e) => {
                if (e.target.files?.length) await uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={2000}
              value={messageInput}
              onChange={(e) => {
                const next = e.target.value;
                setMessageInput(next);
                const mention = extractMentionQuery(next);
                setMentionOpen(!!mention);
                setMentionIndex(0);
              }}
              onKeyDown={async (e) => {
                if (mentionOpen && mentionOptions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev + 1) % mentionOptions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev - 1 + mentionOptions.length) % mentionOptions.length);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const selected = mentionOptions[mentionIndex];
                    if (selected) {
                      setMessageInput((prev) => injectMentionToken(prev, selected));
                      setMentionOpen(false);
                    }
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  await sendComposer();
                }
              }}
              placeholder="Type a message"
              className={CHAT_UI_V2_ENABLED ? "flex-1 overflow-y-auto" : "max-h-[220px] min-h-[56px] flex-1 resize-none overflow-y-auto rounded-2xl border border-[#3a4660] bg-[#0a1121] px-4 py-3 text-sm leading-6 text-slate-100 shadow-[inset_0_1px_2px_rgba(2,6,23,0.45)] outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"}
            />
            <button
              type="button"
              onClick={async () => sendComposer()}
              disabled={!canSend}
              className={CHAT_UI_V2_ENABLED ? styles.sendButton : "rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-2.5 text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {mentionOpen && mentionOptions.length > 0 ? (
            <div className="chat-scrollbar mt-2 max-h-52 overflow-y-auto rounded-xl border border-[#3a4660] bg-[#0a1121] p-1 shadow-lg">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mention users or candidates</p>
              {mentionOptions.map((option, idx) => (
                <button
                  key={`${option.type}-${option.id}`}
                  type="button"
                  onClick={() => {
                    setMessageInput((prev) => injectMentionToken(prev, option));
                    setMentionOpen(false);
                    textareaRef.current?.focus();
                  }}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left",
                    idx === mentionIndex ? "bg-indigo-500/20 text-indigo-200" : "text-slate-200 hover:bg-[#18223a]",
                  ].join(" ")}
                >
                  <span className="truncate text-xs font-medium">{option.label}</span>
                  <span className={["rounded px-1.5 py-0.5 text-[10px]", option.type === "candidate" ? "bg-emerald-500/20 text-emerald-200" : "bg-indigo-500/20 text-indigo-200"].join(" ")}>
                    {option.type}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {parseMentionsFromText(messageInput).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {parseMentionsFromText(messageInput).map((mention, idx) => (
                <span
                  key={`${mention.type}-${mention.id}-${idx}`}
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    mention.type === "candidate" ? "bg-emerald-500/20 text-emerald-200" : "bg-indigo-500/20 text-indigo-200",
                  ].join(" ")}
                >
                  @{mention.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <p>Enter to send • Shift+Enter for new line • Drag files to upload</p>
            <p className="hidden sm:block">
              {messageInput.length}/2000
              {readyAttachmentCount > 0 ? ` • ${readyAttachmentCount} file(s) ready` : ""}
              {failedAttachmentCount > 0 ? ` • ${failedAttachmentCount} failed` : ""}
            </p>
          </div>
        </div>
        </div>
      </section>

      {threadParent ? (
        <ThreadPanel
          conversationId={conversation.id}
          parent={threadData?.parent_message ?? threadParent}
          replies={threadData?.replies ?? []}
          currentUserId={currentUserId}
          onClose={() => setThreadParent(null)}
          onSendReply={sendThreadReply}
        />
      ) : null}

      {drawerView ? (
        <ChatContextDrawer
          view={drawerView}
          onClose={() => setDrawerView(null)}
          details={detailsData}
          pins={pinData?.pins ?? []}
          conversationId={conversation.id}
          preferences={prefData}
          externalInvites={externalInviteData?.invites ?? []}
          calendarEvents={calendarData?.events ?? []}
          onCalendarChanged={() => {
            void mutateCalendar();
            void mutateMessages();
            onMutateConversations();
          }}
          onExternalInvitesChanged={() => {
            void mutateExternalInvites();
          }}
          onPinnedChanged={() => {
            void mutatePins();
            onMutateConversations();
            void mutateMessages();
          }}
          onPreferencesSaved={() => {
            void mutatePrefs();
            onMutateConversations();
          }}
          ringVolume={ringVolume}
          onRingVolumeChange={setRingVolume}
          onToast={onToast}
        />
      ) : null}

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-indigo-900/20 backdrop-blur-[1px]">
          <div className="rounded-xl border border-indigo-400/70 bg-[#0a1121]/95 px-5 py-3 text-sm font-medium text-indigo-200 shadow">
            Drop files here to upload
          </div>
        </div>
      ) : null}

      {showPrejoin ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/65 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#33405d] bg-[#0f162a] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Prejoin audio checks</h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  !prejoinStatus || prejoinStatus.status === "checking"
                    ? "border-slate-500/50 text-slate-300"
                    : prejoinStatus.status === "ready"
                      ? "border-emerald-500/50 text-emerald-200"
                      : prejoinStatus.status === "warning"
                        ? "border-amber-500/50 text-amber-200"
                        : "border-rose-500/50 text-rose-200"
                }`}
              >
                {!prejoinStatus ? "Checking" : prejoinStatus.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              We’ll verify microphone and playback readiness. You can still continue with warnings.
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-[#33405d] bg-[#121a30] p-3 text-xs text-slate-200">
              <div className="flex items-center justify-between">
                <span>Microphone permission</span>
                <span className="font-medium text-slate-100">{prejoinStatus?.permission ?? "checking"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Mic capture test</span>
                <span className="font-medium text-slate-100">{prejoinStatus?.mic_capture_ok ? "ok" : "pending"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Playback probe</span>
                <span className="font-medium text-slate-100">{prejoinStatus?.autoplay_ok ? "ok" : "blocked/pending"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Input devices</span>
                <span className="font-medium text-slate-100">{prejoinStatus?.input_devices ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Output devices</span>
                <span className="font-medium text-slate-100">{prejoinStatus?.output_devices ?? 0}</span>
              </div>
            </div>

            <div className="mt-3 max-h-28 space-y-1 overflow-y-auto rounded-md bg-[#0b1122] px-3 py-2 text-[11px] text-slate-300">
              {(prejoinStatus?.messages?.length ? prejoinStatus.messages : ["Running checks…"]).map((message, idx) => (
                <p key={`${message}-${idx}`}>{message}</p>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelPrejoin}
                className="rounded-lg border border-[#33405d] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#1a233a]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={prejoinBusy}
                onClick={() => {
                  void retryPrejoinChecks();
                }}
                className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
              >
                {prejoinBusy ? "Checking…" : "Retry checks"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void proceedFromPrejoin();
                }}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
              >
                Join now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCall && !(ringDismissedRoomId === activeCall.id && activeRoomId !== activeCall.id && !shouldForceActiveCallVisibility) ? (
        <div className="pointer-events-none absolute bottom-24 right-6 z-40">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 shadow-[0_10px_30px_rgba(16,185,129,0.25)] backdrop-blur">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold text-emerald-100">
              Call is active • {activeCallDuration} • {Number(activeCall.joined_count || 0)} participant{Number(activeCall.joined_count || 0) === 1 ? "" : "s"}
            </span>
            {publishMissingLocal && /recovering/i.test(mediaError || "")
              ? <span className="text-[11px] text-amber-200/90">Microphone publish recovering…</span>
              : null}
            {publishMissingLocal && !/recovering/i.test(mediaError || "")
              ? <span className="text-[11px] text-amber-200/90">Microphone not published…</span>
              : null}
            {!publishMissingLocal && connectionState === "reconnecting" ? <span className="text-[11px] text-amber-200/90">Reconnecting…</span> : null}
            {!publishMissingLocal && callState === "connecting" ? <span className="text-[11px] text-emerald-200/90">Connecting audio…</span> : null}
            {!publishMissingLocal && callState === "connected" && !hasRemoteAudioActive && Number(activeCall.joined_count || 0) > 1 ? (
              <span className="text-[11px] text-amber-200/90">Waiting for remote audio…</span>
            ) : null}
            {connectionState === "failed" ? (
              <button
                type="button"
                onClick={async () => retryCallConnection()}
                className="rounded-full border border-rose-300/40 px-2 py-0.5 text-[11px] text-rose-100 hover:bg-rose-500/20"
              >
                Connection failed • Retry
              </button>
            ) : null}
            {callState === "connected" && !hasRemoteAudioActive && Number(activeCall.joined_count || 0) > 1 ? (
              <button
                type="button"
                onClick={() => runRemoteAudioRecoveryAssist("manual_remote_audio_retry")}
                className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-500/20"
              >
                Retry audio
              </button>
            ) : null}
            {mediaError ? <span className="max-w-[220px] truncate text-[11px] text-rose-200">{mediaError}</span> : null}
            {schemaGateBlocked ? (
              <span className="max-w-[220px] truncate text-[11px] text-amber-200">Call controls limited until latest call schema migrations are applied.</span>
            ) : null}
            {isPresenting ? <span className="rounded-full border border-cyan-300/40 px-2 py-0.5 text-[11px] text-cyan-100">Presenting</span> : null}
            {callState === "connected" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 px-2 py-0.5 text-[11px] text-emerald-100/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" style={{ opacity: Math.max(0.2, audioLevel) }} />
                Mic {micEnabled ? "on" : "off"}
              </span>
            ) : null}
            {callState === "incoming-ringing" ? (
              <>
                <button
                  type="button"
                  onClick={async () => joinCallRoom(activeCall.id, "Call accepted.")}
                  className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => dismissIncomingCall(activeCall.id, "Call declined.")}
                  className="rounded-full border border-rose-400/50 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
                >
                  Decline
                </button>
              </>
            ) : callState !== "connected" && activeCall.can_join !== false && !meJoinedInActiveCall ? (
              <button
                type="button"
                onClick={async () => joinCallRoom(activeCall.id, "Joined call.")}
                className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
              >
                Join now
              </button>
            ) : null}
            {callState === "connected" ? (
              <button
                type="button"
                onClick={() => {
                  setMicEnabled((prev) => {
                    const next = !prev;
                    if (liveKitRoomRef.current?.localParticipant) {
                      void liveKitRoomRef.current.localParticipant.setMicrophoneEnabled(next).catch(() => {});
                    }
                    if (localStreamRef.current) {
                      for (const track of localStreamRef.current.getAudioTracks()) track.enabled = next;
                    }
                    return next;
                  });
                }}
                className="rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
              >
                {micEnabled ? <Mic className="mr-1 inline-block h-3.5 w-3.5" /> : <MicOff className="mr-1 inline-block h-3.5 w-3.5" />}
                {micEnabled ? "Mute" : "Unmute"}
              </button>
            ) : null}
            {callState === "connected" ? (
              <button
                type="button"
                onClick={() => {
                  setCameraEnabled((prev) => {
                    const next = !prev;
                    if (liveKitRoomRef.current?.localParticipant?.setCameraEnabled) {
                      void liveKitRoomRef.current.localParticipant.setCameraEnabled(next).catch(() => {});
                    }
                    return next;
                  });
                }}
                className="rounded-full border border-indigo-400/50 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/25"
              >
                {cameraEnabled ? "Camera off" : "Camera on"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                if (!(activeRoomId === activeCall.id || callState === "connected")) {
                  onToast("Join the active call first to share your screen.", "info");
                  return;
                }
                if (liveKitRoomRef.current?.localParticipant?.setScreenShareEnabled) {
                  await toggleScreenShare(activeCall.id);
                } else {
                  onToast("Screen share is not available in this session.", "error");
                }
              }}
              className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
            >
              {isPresenting ? "Stop share" : "Share Screen"}
            </button>
            {callState === "connected" ? (
              <button
                type="button"
                onClick={async () => leaveCurrentCall(activeCall.id)}
                className="rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/25"
              >
                Leave
              </button>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                if (activeRoomId === activeCall.id || callState === "connected" || meJoinedInActiveCall) {
                  await endActiveCall(activeCall.id);
                  return;
                }
                dismissIncomingCall(activeCall.id, "Call dismissed.");
              }}
              className="rounded-full border border-rose-400/50 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
            >
              {activeRoomId === activeCall.id || callState === "connected" || meJoinedInActiveCall ? "End call" : "Dismiss"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await copyCallDiagnostics();
              }}
              className="rounded-full border border-indigo-300/40 px-2 py-1 text-[11px] text-indigo-100 hover:bg-indigo-500/20"
            >
              Copy diagnostics
            </button>
            {canModerate && callState === "connected" ? (
              <>
                <button
                  type="button"
                  disabled={moderationBusy !== null || schemaGateBlocked}
                  onClick={async () => {
                    await moderateCall("end_for_all");
                  }}
                  className="rounded-full border border-rose-300/70 bg-rose-500/25 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/35 disabled:opacity-60"
                >
                  {moderationBusy === "end_all" ? "Ending…" : "End for all"}
                </button>
                {activeCall.joined_participants
                  ?.filter((p) => Number(p.user_id) !== Number(currentUserId || 0))
                  .slice(0, 2)
                  .map((p) => (
                    <div key={p.user_id} className="inline-flex items-center gap-1 rounded-full border border-slate-500/50 px-2 py-0.5 text-[11px] text-slate-200">
                      <span className="max-w-[84px] truncate">{p.full_name.split(" ")[0]}</span>
                      <button
                        type="button"
                        disabled={moderationBusy !== null || schemaGateBlocked}
                        onClick={async () => {
                          await moderateCall(p.muted ? "unmute_participant" : "mute_participant", p.user_id);
                        }}
                        className="rounded px-1 text-[10px] text-amber-200 hover:bg-amber-500/20"
                      >
                        {p.muted ? "Unmute" : "Mute"}
                      </button>
                      <button
                        type="button"
                        disabled={moderationBusy !== null || schemaGateBlocked}
                        onClick={async () => {
                          await moderateCall("remove_participant", p.user_id);
                        }}
                        className="rounded px-1 text-[10px] text-rose-200 hover:bg-rose-500/20"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                <button
                  type="button"
                  disabled={schemaGateBlocked}
                  onClick={async () => {
                    await requestVoiceRepair();
                  }}
                  className="rounded-full border border-emerald-300/40 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  Repair voice
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  isMe,
  currentUserId,
  showSender,
  onOpenThread,
  onMutateMessages,
}: {
  message: Message;
  isMe: boolean;
  currentUserId: number | null;
  showSender: boolean;
  onOpenThread: () => void;
  onMutateMessages: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editInput, setEditInput] = useState(message.content || "");

  async function addReaction(emoji: string) {
    try {
      await apiFetchJson(`/api/chat/messages/${message.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      onMutateMessages();
    } catch {}
  }

  async function removeReaction(emoji: string) {
    try {
      await apiFetchJson(`/api/chat/messages/${message.id}/reactions?emoji=${encodeURIComponent(emoji)}`, {
        method: "DELETE",
      });
      onMutateMessages();
    } catch {}
  }

  async function saveEdit() {
    if (!editInput.trim()) return;
    try {
      await apiFetchJson(`/api/chat/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editInput.trim() }),
      });
      setEditing(false);
      onMutateMessages();
    } catch {}
  }

  async function deleteMessage() {
    try {
      await apiFetchJson(`/api/chat/messages/${message.id}`, { method: "DELETE" });
      onMutateMessages();
    } catch {}
  }

  return (
    <div
      id={`message-${message.id}`}
      className={`group ${CHAT_UI_V2_ENABLED ? styles.messageRow : `flex gap-2 ${isMe ? "justify-end" : ""}`}`}
    >
      <div className="w-9 shrink-0">
          {showSender ? (
            <div className={`grid h-9 w-9 place-items-center rounded-xl text-[11px] font-bold text-white shadow-sm ${avatarColor(message.sender_id)}`}>
              {initials(message.sender_name)}
            </div>
          ) : null}
      </div>
      <div className={`${CHAT_UI_V2_ENABLED ? styles.messageContent : "max-w-[76%]"} ${CHAT_UI_V2_ENABLED && isMe ? styles.ownMessage : ""}`}>
        {showSender ? (
          <div className="mb-0.5 flex items-baseline gap-2">
            <p className={CHAT_UI_V2_ENABLED ? styles.messageSender : "text-[11px] font-semibold text-slate-300"}>{isMe ? "You" : message.sender_name}</p>
            <span className={CHAT_UI_V2_ENABLED ? styles.messageMeta : "text-[10px] text-slate-400"}>{formatTime(message.created_at)}</span>
          </div>
        ) : null}
        {message.attachment_url && isImageAttachment(message) ? (
          <a href={message.attachment_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={message.attachment_url} alt={message.attachment_name || "Attachment"} className="mt-1 max-h-80 rounded-xl border border-[var(--chat-border)] object-contain shadow-sm" />
          </a>
        ) : null}
        {message.attachment_url && message.attachment_type === "file" ? (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${
              isMe ? "border-indigo-300/40 bg-indigo-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <FileBadge name={message.attachment_name || ""} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800">{message.attachment_name || "Attachment"}</p>
              <p className="text-[10px] text-slate-400">{formatFileSize(message.attachment_size)}</p>
            </div>
            <Download className="ml-auto h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : null}
        {message.content ? (
          <div className={CHAT_UI_V2_ENABLED ? styles.messageBody : `mt-1 rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${isMe ? "bg-indigo-600 text-white" : "border border-slate-700 bg-slate-800 text-slate-100"}`}>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={editInput}
                  onChange={(e) => setEditInput(e.target.value)}
                  className={`w-full resize-none rounded border px-2 py-1 text-xs ${isMe ? "border-indigo-300 text-slate-900" : "border-slate-300 text-slate-900"}`}
                />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveEdit} className="rounded bg-slate-900/15 px-2 py-1 text-[11px] font-medium">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded bg-slate-900/10 px-2 py-1 text-[11px] font-medium">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {renderMessageWithMentions(message.content, message.mentions)}
                </span>
                {message.edited_at ? <span className="ml-1 text-[11px] text-[var(--chat-soft)]">(edited)</span> : null}
              </>
            )}
          </div>
        ) : null}
        {message.reactions && message.reactions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={`${message.id}-${reaction.emoji}`}
                type="button"
                onClick={async () => {
                  const hasMe = reaction.users.some((u) => u.user_id === currentUserId);
                  if (hasMe) await removeReaction(reaction.emoji);
                  else await addReaction(reaction.emoji);
                }}
                className="rounded-full border border-[#3a4660] bg-[#121a30] px-2 py-0.5 text-[11px] text-slate-200 hover:bg-[#1b2540]"
                title={reaction.users.map((u) => u.full_name).join(", ")}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
        {!showSender ? <span className={`mt-1 inline-block ${CHAT_UI_V2_ENABLED ? styles.messageMeta : "text-[10px] text-slate-400"}`}>{formatTime(message.created_at)}</span> : null}
        {message.thread_reply_count ? (
          <button type="button" onClick={onOpenThread} className="mt-1 block text-xs font-semibold text-[var(--chat-primary)] hover:underline">
            {message.thread_reply_count} thread repl{message.thread_reply_count === 1 ? "y" : "ies"}
          </button>
        ) : null}
        <div className={CHAT_UI_V2_ENABLED ? styles.messageToolbar : "mt-1 flex gap-2 text-[10px] text-slate-400"} aria-label="Message actions">
          <button type="button" onClick={() => addReaction("👍")} aria-label="React with thumbs up">👍</button>
          <button type="button" onClick={onOpenThread}>Reply</button>
          <button type="button" onClick={async () => { if (message.content) await navigator.clipboard?.writeText(message.content); }} aria-label="Copy message">Copy</button>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="More message actions">•••</button>
        </div>
        {menuOpen ? (
          <div className={`mt-1 inline-flex rounded border border-[#3a4660] bg-[#0f1629] shadow-sm ${isMe ? "ml-auto" : ""}`}>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setMenuOpen(false);
              }}
              className="px-2 py-1 text-[11px] text-slate-200 hover:bg-[#1a233a]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await deleteMessage();
              }}
              className="border-l border-[#3a4660] px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/15"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await apiFetchJson(`/api/chat/conversations/${message.conversation_id}/pin`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ message_id: message.id }),
                });
                onMutateMessages();
              }}
              className="border-l border-[#3a4660] px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/15"
            >
              Pin
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatContextDrawer({
  view,
  onClose,
  details,
  pins,
  conversationId,
  preferences,
  externalInvites,
  calendarEvents,
  onCalendarChanged,
  onExternalInvitesChanged,
  onPinnedChanged,
  onPreferencesSaved,
  ringVolume,
  onRingVolumeChange,
  onToast,
}: {
  view: DrawerView;
  onClose: () => void;
  details?: ConversationDetails;
  pins: PinnedMessageItem[];
  conversationId: number;
  preferences?: {
    user: { mention_only: boolean; desktop_sound: boolean; desktop_toast: boolean; email_digest: boolean; email_digest_frequency: string };
    conversations: Array<{ conversation_id: number; muted: boolean; mention_only: boolean }>;
  };
  externalInvites: ExternalInvite[];
  calendarEvents: ChatCalendarEvent[];
  onCalendarChanged: () => void;
  onExternalInvitesChanged: () => void;
  onPinnedChanged: () => void;
  onPreferencesSaved: () => void;
  ringVolume: number;
  onRingVolumeChange: (next: number) => void;
  onToast: (message: string, tone?: ToastTone) => void;
}) {
  const conversationPreference = preferences?.conversations.find((pref) => pref.conversation_id === conversationId);
  const [scheduleTitle, setScheduleTitle] = useState("Scheduled chat call");
  const [scheduleStart, setScheduleStart] = useState(() => {
    const d = new Date(Date.now() + 10 * 60_000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const [scheduleDuration, setScheduleDuration] = useState(30);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [externalNameInput, setExternalNameInput] = useState("");
  const [externalEmailInput, setExternalEmailInput] = useState("");
  const [externalExpiryHours, setExternalExpiryHours] = useState(24);
  const [externalBusy, setExternalBusy] = useState(false);

  async function togglePin(messageId: number, isPinned: boolean) {
    if (isPinned) {
      await apiFetchJson(`/api/chat/conversations/${conversationId}/pin?message_id=${messageId}`, { method: "DELETE" });
    } else {
      await apiFetchJson(`/api/chat/conversations/${conversationId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId }),
      });
    }
    onPinnedChanged();
  }

  async function savePreference(next: {
    muted?: boolean;
    mention_only?: boolean;
    desktop_toast?: boolean;
    desktop_sound?: boolean;
    email_digest?: boolean;
  }) {
    const existingUser = preferences?.user ?? {
      mention_only: false,
      desktop_sound: true,
      desktop_toast: true,
      email_digest: false,
      email_digest_frequency: "daily",
    };
    await apiFetchJson("/api/chat/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: {
          ...existingUser,
          desktop_toast: next.desktop_toast ?? existingUser.desktop_toast,
          desktop_sound: next.desktop_sound ?? existingUser.desktop_sound,
          email_digest: next.email_digest ?? existingUser.email_digest,
        },
        conversations: [
          {
            conversation_id: conversationId,
            muted: next.muted ?? conversationPreference?.muted ?? false,
            mention_only: next.mention_only ?? conversationPreference?.mention_only ?? false,
          },
        ],
      }),
    });
    onPreferencesSaved();
  }

  async function createScheduledCall() {
    try {
      setCalendarBusy(true);
      const parsed = new Date(scheduleStart);
      if (Number.isNaN(parsed.getTime())) {
        onToast("Please choose a valid start date/time.", "error");
        return;
      }
      const startIso = parsed.toISOString();
      await apiFetchJson(`/api/chat/conversations/${conversationId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: scheduleTitle,
          start_at: startIso,
          duration_minutes: scheduleDuration,
        }),
      });
      onCalendarChanged();
      onToast("Call scheduled successfully.", "success");
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : "Unable to schedule call.";
      onToast(msg, "error");
    } finally {
      setCalendarBusy(false);
    }
  }

  async function createExternalInvite() {
    if (!externalNameInput.trim() || !externalEmailInput.trim()) return;
    try {
      setExternalBusy(true);
      const payload = await apiFetchJson<{ invite_link: string }>(
        `/api/chat/conversations/${conversationId}/external-invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_name: externalNameInput.trim(),
            external_email: externalEmailInput.trim(),
            expiry_hours: externalExpiryHours,
          }),
        }
      );
      if (payload.invite_link) {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(payload.invite_link);
          }
        } catch {}
      }
      setExternalNameInput("");
      setExternalEmailInput("");
      onExternalInvitesChanged();
    } finally {
      setExternalBusy(false);
    }
  }

  async function revokeExternalInvite(inviteId: number) {
    await apiFetchJson(`/api/chat/conversations/${conversationId}/external-invites/${inviteId}`, {
      method: "DELETE",
    });
    onExternalInvitesChanged();
  }

  return (
    <aside className={CHAT_UI_V2_ENABLED ? styles.contextPanel : "w-[340px] shrink-0 border-l border-[#2e3a56] bg-[#0d1428]/95 backdrop-blur"}>
      <div className="flex min-h-16 items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
        <div><p className="font-[var(--font-ats-heading)] text-base font-bold capitalize text-[var(--chat-text)]">{view}</p><p className="text-xs text-[var(--chat-muted)]">Conversation workspace</p></div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--chat-muted)] hover:bg-[var(--chat-surface-teal)]" aria-label={`Close ${view} panel`}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="chat-scrollbar h-[calc(100%-53px)] overflow-y-auto p-4">
        {view === "details" ? (
          <div className="space-y-3 text-sm text-slate-200">
            <div className="rounded-xl border border-[#33405d] bg-[#121a30] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Conversation</p>
              <p className="mt-1 font-semibold text-slate-100">{details?.conversation.name || "Direct chat"}</p>
              <p className="mt-1 text-xs text-slate-400">Updated {details?.conversation.updated_at ? formatRelative(details.conversation.updated_at) : "-"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#33405d] bg-[#121a30] p-2 text-center">
                <p className="text-lg font-bold text-slate-100">{details?.members.length ?? 0}</p>
                <p className="text-[11px] text-slate-400">Members</p>
              </div>
              <div className="rounded-lg border border-[#33405d] bg-[#121a30] p-2 text-center">
                <p className="text-lg font-bold text-slate-100">{details?.stats.shared_files ?? 0}</p>
                <p className="text-[11px] text-slate-400">Files</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Members</p>
              <div className="space-y-1">
                {(details?.members ?? []).map((m) => (
                  <div key={m.user_id} className="rounded-lg border border-[#33405d] bg-[#121a30] px-2 py-1.5">
                    <p className="text-sm font-medium text-slate-100">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#33405d] bg-[#121a30] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">External guest access</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  value={externalNameInput}
                  onChange={(e) => setExternalNameInput(e.target.value)}
                  placeholder="Guest name"
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                />
                <input
                  type="email"
                  value={externalEmailInput}
                  onChange={(e) => setExternalEmailInput(e.target.value)}
                  placeholder="Guest email"
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                />
                <select
                  value={externalExpiryHours}
                  onChange={(e) => setExternalExpiryHours(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                >
                  <option value={4}>4 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                </select>
                <button
                  type="button"
                  onClick={async () => createExternalInvite()}
                  disabled={externalBusy || !externalNameInput.trim() || !externalEmailInput.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {externalBusy ? "Creating…" : "Create temporary link"}
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {externalInvites.length === 0 ? <p className="text-xs text-slate-400">No external links yet.</p> : null}
                {externalInvites.map((invite) => (
                  <div key={invite.id} className="rounded-lg border border-[#3a4660] bg-[#0b1223] p-2">
                    <p className="text-xs font-semibold text-slate-100">External • {invite.external_name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Expires {new Date(invite.expires_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {!invite.revoked_at ? (
                      <button
                        type="button"
                        onClick={async () => revokeExternalInvite(invite.id)}
                        className="mt-1 rounded border border-rose-400/40 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/15"
                      >
                        Remove access
                      </button>
                    ) : (
                      <span className="mt-1 inline-flex rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200">Revoked</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {view === "pins" ? (
          <div className="space-y-2">
            {pins.length === 0 ? <p className="text-sm text-slate-400">No pinned messages yet.</p> : null}
            {pins.map((pin) => (
              <div key={pin.pin_id} className="rounded-xl border border-[#33405d] bg-[#121a30] p-3">
                <p className="line-clamp-3 text-sm text-slate-100">{pin.content || pin.attachment_name || "Attachment"}</p>
                <p className="mt-1 text-[11px] text-slate-400">Pinned by {pin.pinned_by_name}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await togglePin(pin.id, true);
                  }}
                    className="mt-2 rounded border border-amber-500/50 px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/15"
                >
                  Unpin
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {view === "notify" ? (
          <div className="space-y-3 text-sm">
            <ToggleRow
              label="Mute this conversation"
              checked={conversationPreference?.muted ?? false}
              onChange={async (checked) => savePreference({ muted: checked })}
            />
            <ToggleRow
              label="Mentions only in this chat"
              checked={conversationPreference?.mention_only ?? false}
              onChange={async (checked) => savePreference({ mention_only: checked })}
            />
            <ToggleRow
              label="Desktop toast notifications"
              checked={preferences?.user.desktop_toast ?? true}
              onChange={async (checked) => savePreference({ desktop_toast: checked })}
            />
            <ToggleRow
              label="Notification sound"
              checked={preferences?.user.desktop_sound ?? true}
              onChange={async (checked) => savePreference({ desktop_sound: checked })}
            />
            <div className="rounded-lg border border-[#33405d] bg-[#121a30] px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-slate-200">Ringtone volume</span>
                <span className="text-[11px] text-slate-400">{Math.round(ringVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(ringVolume * 100)}
                onChange={(e) => onRingVolumeChange(Math.min(1, Math.max(0.1, Number(e.target.value) / 100)))}
                className="w-full accent-indigo-500"
              />
            </div>
            <ToggleRow
              label="Email digest"
              checked={preferences?.user.email_digest ?? false}
              onChange={async (checked) => savePreference({ email_digest: checked })}
            />
          </div>
        ) : null}

        {view === "calendar" ? (
          <div className="space-y-3 text-sm text-slate-200">
            <div className="rounded-xl border border-[#33405d] bg-[#121a30] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Schedule call</p>
              <div className="mt-2 space-y-2">
                <input
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="Call title"
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                />
                <DateTimePicker value={scheduleStart} onChange={setScheduleStart} />
                <select
                  value={scheduleDuration}
                  onChange={(e) => setScheduleDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                <button
                  type="button"
                  onClick={async () => createScheduledCall()}
                  disabled={calendarBusy}
                  className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
                >
                  {calendarBusy ? "Scheduling…" : "Schedule call"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#33405d] bg-[#121a30] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Upcoming</p>
              <div className="space-y-2">
                {calendarEvents.length === 0 ? <p className="text-xs text-slate-400">No scheduled calls yet.</p> : null}
                {calendarEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-[#3a4660] bg-[#0b1223] p-2">
                    <p className="truncate text-xs font-semibold text-slate-100">{event.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {new Date(event.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {(event.join_url || event.meet_link) ? (
                      <a
                        href={event.join_url || event.meet_link || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Join call
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => Promise<void> }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-[#33405d] bg-[#121a30] px-3 py-2">
      <span className="text-sm text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={async (e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-indigo-600"
      />
    </label>
  );
}

function FileBadge({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return <FileText className="h-4 w-4 text-rose-500" />;
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return <ImageIcon className="h-4 w-4 text-indigo-500" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

function ThreadPanel({
  conversationId,
  parent,
  replies,
  currentUserId,
  onClose,
  onSendReply,
}: {
  conversationId: number;
  parent: Message;
  replies: Message[];
  currentUserId: number | null;
  onClose: () => void;
  onSendReply: (content: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <aside className={CHAT_UI_V2_ENABLED ? styles.threadPanel : "w-[400px] shrink-0 border-l border-[#2e3a56] bg-[#121a30] text-slate-100"}>
      <div className="flex min-h-16 items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
        <div><p className="font-[var(--font-ats-heading)] text-base font-bold text-[var(--chat-text)]">Thread</p><p className="text-xs text-[var(--chat-muted)]">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</p></div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--chat-surface-teal)]" aria-label="Close thread">
          <X className="h-4 w-4 text-[var(--chat-muted)]" />
        </button>
      </div>
      <div className="chat-scrollbar h-[calc(100%-130px)] overflow-y-auto bg-[var(--chat-surface-soft)] px-3 py-3">
        <div className="mb-2 rounded-lg border border-slate-700 bg-[#212735] px-2 py-1 text-[11px] text-slate-300">
          {replies.length} repl{replies.length === 1 ? "y" : "ies"} • started {formatRelative(parent.created_at)}
        </div>
        <MessageBubble
          message={parent}
          isMe={parent.sender_id === currentUserId}
          currentUserId={currentUserId}
          showSender
          onOpenThread={() => {}}
          onMutateMessages={() => {}}
        />
        <div className="my-3 h-px bg-[#2f3953]" />
        <div className="space-y-2">
          {replies.map((reply) => (
            <MessageBubble
              key={reply.id}
              message={reply}
              isMe={reply.sender_id === currentUserId}
              currentUserId={currentUserId}
              showSender
              onOpenThread={() => {}}
              onMutateMessages={() => {}}
            />
          ))}
          {replies.length === 0 ? <p className="text-xs text-slate-400">No replies yet.</p> : null}
        </div>
      </div>
      <div className="border-t border-[var(--chat-border)] bg-white p-3">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reply in thread"
          className="w-full resize-none rounded-xl border border-[var(--chat-border)] bg-white px-3 py-2.5 text-sm text-[var(--chat-text)] outline-none transition focus:border-[var(--chat-primary)] focus:ring-2 focus:ring-[var(--ats-focus)]"
        />
        <button
          type="button"
          disabled={sending}
          onClick={async () => {
            if (!input.trim()) return;
            setSending(true);
            try {
              await onSendReply(input.trim());
              setInput("");
            } finally {
              setSending(false);
            }
          }}
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-1.5 text-xs font-semibold text-white hover:from-indigo-400 hover:to-violet-400 disabled:opacity-60"
        >
          Send reply
        </button>
        <p className="mt-1 text-[10px] text-slate-400">Conversation #{conversationId}</p>
      </div>
    </aside>
  );
}

function NewChatModal({
  initialType,
  currentUserId,
  onClose,
  onCreate,
}: {
  initialType: "direct" | "group";
  currentUserId: number | null;
  onClose: () => void;
  onCreate: (id: number) => void;
}) {
  const [chatType, setChatType] = useState<"direct" | "group">(initialType);
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const { data } = useSWR<{ users: ChatUser[] }>(
    `/api/chat/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    dashboardFetcher
  );
  const users = (data?.users ?? []).filter((u) => u.id !== currentUserId);

  const toggleUser = (id: number) => {
    if (chatType === "direct") {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const createConversation = async () => {
    if (selectedIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const payload = await apiFetchJson<{ conversation_id: number }>("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: chatType,
          member_ids: selectedIds,
          name: chatType === "group" ? groupName.trim() || null : null,
        }),
      });
      onCreate(payload.conversation_id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#35405a] bg-[#0e1529] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#35405a] px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">New conversation</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[#1a233a]">
            <X className="h-4 w-4 text-slate-300" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChatType("direct")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${chatType === "direct" ? "bg-indigo-600 text-white" : "bg-[#121a30] text-slate-300"}`}
            >
              Direct
            </button>
            <button
              type="button"
              onClick={() => setChatType("group")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${chatType === "group" ? "bg-indigo-600 text-white" : "bg-[#121a30] text-slate-300"}`}
            >
              Group
            </button>
          </div>
          {chatType === "group" ? (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20"
            />
          ) : null}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users"
              className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-8 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>
          <div className="chat-scrollbar max-h-52 overflow-y-auto rounded-md border border-[#35405a]">
            {users.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${checked ? "bg-indigo-500/15" : "hover:bg-[#141f35]"}`}
                >
                  <div className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(user.id)}`}>
                    {initials(user.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">{user.full_name}</p>
                    <p className="truncate text-[10px] text-slate-400">{user.email}</p>
                  </div>
                  {checked ? <span className="text-xs font-semibold text-indigo-600">Selected</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#35405a] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-[#35405a] px-3 py-1.5 text-xs text-slate-300">
            Cancel
          </button>
          <button
            type="button"
            onClick={createConversation}
            disabled={selectedIds.length === 0 || creating}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Creating…" : chatType === "direct" ? "Start chat" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickCalendarModal({
  onClose,
  onScheduled,
  currentUserId,
  conversations,
}: {
  onClose: () => void;
  onScheduled: (conversationId: number) => void;
  currentUserId: number | null;
  conversations: Conversation[];
}) {
  const [conversationId, setConversationId] = useState<number | "">(
    conversations[0]?.id ?? ""
  );
  const [title, setTitle] = useState("Scheduled chat call");
  const [duration, setDuration] = useState(30);
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(Date.now() + 10 * 60_000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#35405a] bg-[#0e1529] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#35405a] px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">Schedule call</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[#1a233a]">
            <X className="h-4 w-4 text-slate-300" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <select
            value={conversationId}
            onChange={(e) => setConversationId(Number(e.target.value))}
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          >
            {conversations
              .filter((c) => (Array.isArray(c.members) ? c.members : []).some((m) => m.user_id !== currentUserId))
              .map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {convLabel(conv, currentUserId)}
                </option>
              ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Call title"
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          />
          <DateTimePicker value={startAt} onChange={setStartAt} variant="dark" />
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#35405a] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-[#35405a] px-3 py-1.5 text-xs text-slate-300">
            Cancel
          </button>
          <button
            type="button"
            disabled={!conversationId || saving}
            onClick={async () => {
              if (!conversationId) return;
              setSaving(true);
              try {
                await apiFetchJson(`/api/chat/conversations/${conversationId}/calendar`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: title.trim() || "Scheduled chat call",
                    start_at: new Date(startAt).toISOString(),
                    duration_minutes: duration,
                  }),
                });
                onScheduled(Number(conversationId));
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TempChatModal({
  onClose,
  onDone,
  conversations,
  selectedConversationId,
  onToast,
}: {
  onClose: () => void;
  onDone: (conversationId: number) => void;
  conversations: Conversation[];
  selectedConversationId: number | null;
  onToast: (message: string, tone?: ToastTone) => void;
}) {
  const [conversationId, setConversationId] = useState<number | "">(selectedConversationId ?? conversations[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [expiryHours, setExpiryHours] = useState(4);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#35405a] bg-[#0e1529] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#35405a] px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">Temporary external chat</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[#1a233a]">
            <X className="h-4 w-4 text-slate-300" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <select
            value={conversationId}
            onChange={(e) => setConversationId(Number(e.target.value))}
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          >
            {conversations.map((conv) => (
              <option key={conv.id} value={conv.id}>
                {conv.name?.trim() || `Conversation #${conv.id}`}
              </option>
            ))}
          </select>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest name"
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          />
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="Guest email"
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          />
          <select
            value={expiryHours}
            onChange={(e) => setExpiryHours(Number(e.target.value))}
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          >
            <option value={1}>1 hour</option>
            <option value={4}>4 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
            <option value={48}>48 hours</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#35405a] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-[#35405a] px-3 py-1.5 text-xs text-slate-300">
            Cancel
          </button>
          <button
            type="button"
            disabled={!conversationId || !guestName.trim() || !guestEmail.trim() || saving}
            onClick={async () => {
              if (!conversationId) return;
              setSaving(true);
              try {
                const res = await apiFetchJson<{
                  user_message?: string;
                  invite_link?: string;
                  email_send_status?: "sent" | "failed";
                  hint?: string;
                }>(`/api/chat/conversations/${conversationId}/external-invites`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    external_name: guestName.trim(),
                    external_email: guestEmail.trim(),
                    expiry_hours: expiryHours,
                  }),
                });
                onToast(
                  res.user_message || "Temporary external chat invite sent.",
                  res.email_send_status === "failed" ? "error" : "success",
                );
                if (res.email_send_status === "failed" && res.hint) {
                  onToast(res.hint, "error");
                }
                onDone(Number(conversationId));
              } catch (error) {
                onToast(error instanceof ApiError ? error.message : "Failed to send temporary chat invite.", "error");
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Sending…" : "Send temp chat link"}
          </button>
        </div>
      </div>
    </div>
  );
}

