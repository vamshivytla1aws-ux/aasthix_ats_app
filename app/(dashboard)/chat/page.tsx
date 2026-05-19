"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";
import EmojiPicker from "@/components/chat/EmojiPicker";
import GifPicker from "@/components/chat/GifPicker";
import Toast, { type ToastTone } from "@/components/Toast";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquare,
  MonitorUp,
  Paperclip,
  Pin,
  Plus,
  Phone,
  Search,
  Send,
  Smile,
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
  joined_participants?: Array<{ user_id: number; full_name: string }>;
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
  if (conv.name) return conv.name;
  if (conv.type === "direct") {
    const other = conv.members.find((m) => m.user_id !== currentUserId);
    return other?.full_name ?? "Direct message";
  }
  return conv.members.map((m) => m.full_name.split(" ")[0]).join(", ");
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

function playTone(kind: "message" | "ring", durationMs = 180) {
  if (typeof window === "undefined") return;
  const Ctx = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = kind === "ring" ? "sine" : "triangle";
  osc.frequency.value = kind === "ring" ? 720 : 920;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(kind === "ring" ? 0.08 : 0.04, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
}

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [queryConversationId, setQueryConversationId] = useState<number | null>(null);
  const [queryRoomId, setQueryRoomId] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatType, setNewChatType] = useState<"direct" | "group">("direct");
  const [showComposeMenu, setShowComposeMenu] = useState(false);
  const [showQuickCalendar, setShowQuickCalendar] = useState(false);
  const [showTempChatModal, setShowTempChatModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [desktopFullscreenFit, setDesktopFullscreenFit] = useState(false);

  useEffect(() => {
    apiFetchJson<{ user: { id?: number } }>("/api/auth/me")
      .then((d) => setCurrentUserId(d.user?.id ?? null))
      .catch(() => {});
  }, []);

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
    { refreshInterval: 6000 }
  );

  const conversations = useMemo(() => convData?.conversations ?? [], [convData]);
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
    if (!q) return conversations;
    return conversations.filter((conv) => convLabel(conv, currentUserId).toLowerCase().includes(q));
  }, [conversations, sidebarSearch, currentUserId]);

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

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

  return (
    <AccessGate permissionKey="chat.view">
      <div className={["font-['Sora','Manrope','Inter','Segoe_UI',sans-serif] flex overflow-hidden bg-[#0a0f1f]", desktopFullscreenFit ? "h-[calc(100vh-2px)] rounded-none border-0 shadow-none" : "h-[calc(100vh-7rem)] rounded-2xl border border-[#2c3342] shadow-[0_20px_60px_rgba(2,6,23,0.55)]"].join(" ")}>
        <aside
          className={[
            "w-80 shrink-0 border-r border-slate-700 bg-[#1f2430] text-slate-100",
            activeConversation ? "hidden md:flex md:flex-col" : "flex flex-col",
          ].join(" ")}
        >
          <div className="border-b border-slate-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-300" />
              <h2 className="text-sm font-semibold tracking-wide text-slate-100">Messages</h2>
              {unreadTotal > 0 ? (
                <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white">{unreadTotal}</span>
              ) : null}
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setShowComposeMenu((v) => !v)}
                  className="rounded-md bg-indigo-500 p-1.5 text-white hover:bg-indigo-400"
                  title="Create"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {showComposeMenu ? (
                  <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[#364157] bg-[#0f1629] p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setNewChatType("direct");
                        setShowNewChat(true);
                        setShowComposeMenu(false);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-[#1a233a]"
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
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-[#1a233a]"
                    >
                      Group
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposeMenu(false);
                        setShowQuickCalendar(true);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-[#1a233a]"
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposeMenu(false);
                        setShowTempChatModal(true);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-[#1a233a]"
                    >
                      Temp chat
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search conversations"
                className="w-full rounded-lg border border-slate-700 bg-[#151922] py-2 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
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
              <div className="px-4 py-8 text-center text-xs text-slate-400">No conversations found</div>
            ) : null}
            {filteredConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                statusKind={statusMap.get(conv.id) || "none"}
                isActive={conv.id === activeConvId}
                currentUserId={currentUserId}
                onClick={() => setActiveConvId(conv.id)}
              />
            ))}
          </div>
        </aside>

        <main
          className={[
            "min-w-0 flex-1 bg-[radial-gradient(circle_at_20%_0%,#10193a_0%,#0b1126_35%,#080d1d_100%)]",
            activeConversation ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          {activeConversation ? (
            <ChatWorkspace
              conversation={activeConversation}
              currentUserId={currentUserId}
              initialRoomId={queryRoomId}
              onBack={() => setActiveConvId(null)}
              onMutateConversations={() => void mutateConvs()}
              onToast={(message, tone = "success") => setToast({ message, tone })}
            />
          ) : (
            <div className="flex w-full items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-indigo-500" />
                <p className="mt-3 text-base font-semibold text-slate-100">Start a conversation</p>
                <p className="text-sm text-slate-400">Pick a chat from the left or create a new one.</p>
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
    </AccessGate>
  );
}

function ConversationRow({
  conv,
  statusKind,
  isActive,
  currentUserId,
  onClick,
}: {
  conv: Conversation;
  statusKind: ConversationLiveStatus["status_kind"];
  isActive: boolean;
  currentUserId: number | null;
  onClick: () => void;
}) {
  const label = convLabel(conv, currentUserId);
  const unread = conv.unread_count ?? 0;
  const last = conv.last_message;
  const badge = statusLabel(statusKind);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full border-l-2 px-4 py-2.5 text-left transition duration-200 ease-out",
        isActive ? "border-indigo-400 bg-[#2a3142]" : "border-transparent hover:bg-[#262c3c]",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(conv.id)}`}>
          {conv.type === "group" ? <Users className="h-3.5 w-3.5" /> : initials(label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${unread > 0 ? "font-semibold text-white" : "font-medium text-slate-200"}`}>{label}</span>
            {last ? <span className="text-[10px] text-slate-400">{formatTime(last.created_at)}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-xs text-slate-400">
              {last ? (last.is_system ? last.content : `${last.sender_name.split(" ")[0]}: ${last.content}`) : "No messages yet"}
            </span>
            {badge ? (
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusClasses(statusKind)}`}>
                {badge}
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="shrink-0 animate-pulse rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatWorkspace({
  conversation,
  currentUserId,
  initialRoomId,
  onBack,
  onMutateConversations,
  onToast,
}: {
  conversation: Conversation;
  currentUserId: number | null;
  initialRoomId: number | null;
  onBack: () => void;
  onMutateConversations: () => void;
  onToast: (message: string, tone?: ToastTone) => void;
}) {
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
  const [callState, setCallState] = useState<"idle" | "ringing_outgoing" | "ringing_incoming" | "connected">("idle");
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [ringDismissedRoomId, setRingDismissedRoomId] = useState<number | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSeenMessageIdRef = useRef<number>(0);
  const ringIntervalRef = useRef<number | null>(null);
  const unansweredTimeoutRef = useRef<number | null>(null);
  const resizeComposer = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const scrollHeight = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 56), 220)}px`;
  }, []);

  const messageRefreshInterval = threadParent ? 2500 : 3000;
  const { data: messageData, mutate: mutateMessages } = useSWR<{ messages: Message[] }>(
    `/api/chat/conversations/${conversation.id}/messages?limit=100`,
    dashboardFetcher,
    { refreshInterval: messageRefreshInterval }
  );
  const messages = useMemo(() => messageData?.messages ?? [], [messageData]);

  useEffect(() => {
    const stream = new EventSource(`/api/chat/realtime?conversation_id=${conversation.id}`);
    const onEvent = () => {
      void mutateMessages();
      onMutateConversations();
    };
    stream.addEventListener("message.created", onEvent);
    stream.addEventListener("message.updated", onEvent);
    stream.addEventListener("message.deleted", onEvent);
    stream.addEventListener("thread.reply", onEvent);
    stream.addEventListener("error", () => {});
    return () => {
      stream.removeEventListener("message.created", onEvent);
      stream.removeEventListener("message.updated", onEvent);
      stream.removeEventListener("message.deleted", onEvent);
      stream.removeEventListener("thread.reply", onEvent);
      stream.close();
    };
  }, [conversation.id, mutateMessages, onMutateConversations]);

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
  }>(drawerView === "notify" ? "/api/chat/preferences" : null, dashboardFetcher);
  const { data: presenceData, mutate: mutatePresence } = useSWR<{ manual_presence: "available" | "busy" }>(
    "/api/chat/presence",
    dashboardFetcher,
    { refreshInterval: 15_000 }
  );
  const { data: calendarData, mutate: mutateCalendar } = useSWR<{ events: ChatCalendarEvent[] }>(
    `/api/chat/conversations/${conversation.id}/calendar?limit=40`,
    dashboardFetcher,
    { refreshInterval: 20_000 }
  );

  useEffect(() => {
    if (conversation.unread_count > 0) {
      apiFetchJson(`/api/chat/conversations/${conversation.id}/read`, { method: "PATCH" })
        .then(() => onMutateConversations())
        .catch(() => {});
    }
  }, [conversation.id, conversation.unread_count, onMutateConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    textareaRef.current?.focus();
    resizeComposer();
  }, [conversation.id, resizeComposer]);

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
      playTone("message", 120);
    }
    lastSeenMessageIdRef.current = latestId;
  }, [messages, prefData, conversation.id, currentUserId]);

  const resetComposer = () => {
    setShowEmoji(false);
    setShowGif(false);
  };

  const appendUploadItem = (item: UploadItemState) => setUploadQueue((prev) => [...prev, item]);
  const patchUploadItem = (id: string, patch: Partial<UploadItemState>) =>
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeUploadItem = (id: string) => setUploadQueue((prev) => prev.filter((item) => item.id !== id));

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
      try {
        await apiFetchJson(`/api/chat/conversations/${conversation.id}/messages`, {
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
          }),
        });
        setMessageInput("");
        setUploadQueue([]);
        resetComposer();
        void mutateMessages();
        onMutateConversations();
      } catch (error) {
        const msg = error instanceof ApiError ? error.message : "Failed to send message";
        onToast(msg, "error");
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    },
    [sending, conversation.id, mutateMessages, onMutateConversations, onToast]
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
      await apiFetchJson(`/api/chat/conversations/${conversation.id}/threads/${threadParent.id}/messages`, {
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
      void mutateThread();
      void mutateMessages();
      onMutateConversations();
    },
    [threadParent, conversation.id, mutateThread, mutateMessages, onMutateConversations]
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
    const now = nowTick;
    const events = calendarData?.events ?? [];
    const ranked = events
      .filter((event) => {
        const joinUrl = event.join_url || event.meet_link;
        if (!joinUrl) return false;
        const start = new Date(event.start_at).getTime() - 5 * 60_000;
        const end = new Date(event.end_at).getTime();
        const isWindowActive = now >= start && now <= end;
        if (event.status === "active") return true;
        return isWindowActive;
      })
      .sort((a, b) => {
        const score = (event: ChatCalendarEvent) => (event.status === "active" ? 0 : 1);
        const byStatus = score(a) - score(b);
        if (byStatus !== 0) return byStatus;
        return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
      });
    return ranked[0] ?? null;
  }, [calendarData, nowTick]);

  const activeCallDuration = useMemo(() => {
    if (!activeCall) return "00:00";
    const secs = Math.max(0, Math.floor((nowTick - new Date(activeCall.start_at).getTime()) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [activeCall, nowTick]);

  useEffect(() => {
    if (!initialRoomId || !activeCall) return;
    if (activeCall.id !== initialRoomId) return;
    if (activeRoomId === initialRoomId) return;
    let cancelled = false;
    (async () => {
      try {
        await apiFetchJson(`/api/chat/calls/${initialRoomId}/join`, { method: "POST" });
        if (cancelled) return;
        setActiveRoomId(initialRoomId);
        setCallState("connected");
      } catch {
        // ignore here; regular join actions still available
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialRoomId, activeCall, activeRoomId]);

  useEffect(() => {
    if (!activeCall) {
      setCallState("idle");
      setActiveRoomId(null);
      if (ringIntervalRef.current) {
        window.clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      return;
    }
    const roomId = activeCall.id;
    if (ringDismissedRoomId === roomId) return;
    const isHost = Number(activeCall.created_by_user_id || 0) === Number(currentUserId || 0);
    const joinedUserIds = activeCall.joined_user_ids ?? [];
    const meJoined = joinedUserIds.includes(Number(currentUserId || 0));
    if (activeCall.status === "active") {
      if (meJoined || activeRoomId === roomId) {
        setCallState("connected");
      } else {
        setCallState("ringing_incoming");
      }
    } else if (activeCall.status === "scheduled" && isHost) {
      setCallState("ringing_outgoing");
    }
    if (prefData?.user?.desktop_sound && (callState === "ringing_incoming" || callState === "ringing_outgoing")) {
      if (!ringIntervalRef.current) {
        playTone("ring", 240);
        ringIntervalRef.current = window.setInterval(() => playTone("ring", 240), 1200);
      }
    } else if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    return () => {
      if (ringIntervalRef.current && callState === "connected") {
        window.clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
    };
  }, [
    activeCall,
    activeRoomId,
    callState,
    currentUserId,
    prefData?.user?.desktop_sound,
    ringDismissedRoomId,
  ]);

  useEffect(() => {
    if (unansweredTimeoutRef.current) {
      window.clearTimeout(unansweredTimeoutRef.current);
      unansweredTimeoutRef.current = null;
    }
    if (!activeCall) return;
    const isHost = Number(activeCall.created_by_user_id || 0) === Number(currentUserId || 0);
    const joined = Number(activeCall.joined_count || 0);
    if (!isHost || callState !== "connected" || joined > 1) return;
    unansweredTimeoutRef.current = window.setTimeout(async () => {
      try {
        await apiFetchJson(`/api/chat/conversations/${conversation.id}/calls?event_id=${activeCall.id}`, {
          method: "DELETE",
        });
        setCallState("idle");
        setActiveRoomId(null);
        setRingDismissedRoomId(activeCall.id);
        onToast("No one joined. Call ended automatically.", "info");
        void mutateCalendar();
        void mutateMessages();
        onMutateConversations();
      } catch {
        // no-op
      }
    }, 35_000);
    return () => {
      if (unansweredTimeoutRef.current) {
        window.clearTimeout(unansweredTimeoutRef.current);
        unansweredTimeoutRef.current = null;
      }
    };
  }, [activeCall, callState, currentUserId, conversation.id, mutateCalendar, mutateMessages, onMutateConversations, onToast]);

  const launchCall = useCallback(
    async (mode: "call" | "screenshare") => {
      try {
        if (activeCall) {
          await apiFetchJson(`/api/chat/calls/${activeCall.id}/join`, { method: "POST" });
          setActiveRoomId(activeCall.id);
          setCallState("connected");
          onToast("Joined active call.", "success");
          void mutateCalendar();
          return;
        }
        setCallLoading(mode);
        const data = await apiFetchJson<{ join_link: string | null; user_message?: string }>(
          `/api/chat/conversations/${conversation.id}/calls`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, duration_minutes: 30 }),
          }
        );
        const currentEvents = (await mutateCalendar())?.events ?? [];
        const latest = [...currentEvents]
          .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
          .find((e) => (e.join_url || e.meet_link) && (e.status === "active" || e.status === "scheduled"));
        if (latest?.id) {
          await apiFetchJson(`/api/chat/calls/${latest.id}/join`, { method: "POST" });
          setActiveRoomId(latest.id);
          setCallState("connected");
        }
        onToast(data.user_message || (mode === "screenshare" ? "Screen share started." : "Call started."), "success");
        void mutateCalendar();
        void mutateMessages();
        onMutateConversations();
        setDrawerView("calendar");
      } catch (error) {
        const msg = error instanceof ApiError ? error.message : "Unable to start call.";
        onToast(msg, "error");
      } finally {
        setCallLoading(null);
      }
    },
    [activeCall, conversation.id, mutateCalendar, mutateMessages, onMutateConversations, onToast]
  );

  const endActiveCall = useCallback(
    async (eventId: number) => {
      try {
        await apiFetchJson(`/api/chat/calls/${eventId}/leave`, { method: "POST" }).catch(() => {});
        await apiFetchJson(`/api/chat/conversations/${conversation.id}/calls?event_id=${eventId}`, {
          method: "DELETE",
        });
        setCallState("idle");
        setActiveRoomId(null);
        setRingDismissedRoomId(eventId);
        onToast("Call ended.", "success");
        void mutateCalendar();
        void mutateMessages();
        onMutateConversations();
      } catch (error) {
        const msg = error instanceof ApiError ? error.message : "Unable to end call.";
        onToast(msg, "error");
      }
    },
    [conversation.id, mutateCalendar, mutateMessages, onMutateConversations, onToast]
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
        <header className="border-b border-[#2b3346] bg-[#10172b]/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="rounded p-1 hover:bg-slate-100 md:hidden">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(conversation.id)}`}>
              {conversation.type === "group" ? <Users className="h-3.5 w-3.5" /> : initials(convLabel(conversation, currentUserId))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold tracking-tight text-slate-100">{convLabel(conversation, currentUserId)}</p>
              <p className="text-[11px] text-slate-400">
                {conversation.type === "group" ? `${conversation.members.length} members` : "Direct message"}
              </p>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button
                type="button"
                onClick={async () => launchCall("call")}
                disabled={callLoading !== null}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
              >
                <Phone className="mr-1 inline h-3.5 w-3.5" />
                {callLoading === "call" ? "Starting…" : "Call"}
              </button>
              <button
                type="button"
                onClick={async () => launchCall("screenshare")}
                disabled={callLoading !== null}
                className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-60"
              >
                <MonitorUp className="mr-1 inline h-3.5 w-3.5" />
                {callLoading === "screenshare" ? "Starting…" : "Share"}
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "calendar" ? null : "calendar"))}
                className={["rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition", drawerView === "calendar" ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-[#364157] bg-[#0f1629] text-slate-300 hover:bg-[#1a233a]"].join(" ")}
              >
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "details" ? null : "details"))}
                className={["rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition", drawerView === "details" ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-[#364157] bg-[#0f1629] text-slate-300 hover:bg-[#1a233a]"].join(" ")}
              >
                <Info className="mr-1 inline h-3.5 w-3.5" />
                Details
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "pins" ? null : "pins"))}
                className={["rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition", drawerView === "pins" ? "border-violet-400 bg-violet-500/20 text-violet-200" : "border-[#364157] bg-[#0f1629] text-slate-300 hover:bg-[#1a233a]"].join(" ")}
              >
                <Pin className="mr-1 inline h-3.5 w-3.5" />
                Pins
              </button>
              <button
                type="button"
                onClick={() => setDrawerView((v) => (v === "notify" ? null : "notify"))}
                className={["rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition", drawerView === "notify" ? "border-cyan-400 bg-cyan-500/20 text-cyan-200" : "border-[#364157] bg-[#0f1629] text-slate-300 hover:bg-[#1a233a]"].join(" ")}
              >
                <Bell className="mr-1 inline h-3.5 w-3.5" />
                Notify
              </button>
              <select
                value={presenceData?.manual_presence || "available"}
                onChange={async (e) => {
                  await setManualPresence(e.target.value === "busy" ? "busy" : "available");
                }}
                className="rounded-lg border border-[#364157] bg-[#0f1629] px-2 py-1.5 text-[11px] font-semibold text-slate-200"
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
                className="w-full rounded-xl border border-[#364157] bg-[#0c1324] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:bg-[#0f1629] focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value as "all" | "conversation")}
              className="rounded-xl border border-[#364157] bg-[#0c1324] px-3 py-2 text-xs text-slate-200"
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

        <div className="chat-scrollbar flex-1 overflow-y-auto bg-[linear-gradient(180deg,#0d1428_0%,#0a1020_100%)] px-5 py-4">
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
              {conversation.members.length} participant{conversation.members.length === 1 ? "" : "s"}
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

        <div className="border-t border-[#2b3346] bg-[#10172b]/95 px-4 py-3 backdrop-blur">
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

          <div className="mb-2 flex items-center gap-1">
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
              className="max-h-[220px] min-h-[56px] flex-1 resize-none overflow-y-auto rounded-2xl border border-[#3a4660] bg-[#0a1121] px-4 py-3 text-sm leading-6 text-slate-100 shadow-[inset_0_1px_2px_rgba(2,6,23,0.45)] outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
            />
            <button
              type="button"
              onClick={async () => sendComposer()}
              disabled={!canSend}
              className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-2.5 text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        />
      ) : null}

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-indigo-900/20 backdrop-blur-[1px]">
          <div className="rounded-xl border border-indigo-400/70 bg-[#0a1121]/95 px-5 py-3 text-sm font-medium text-indigo-200 shadow">
            Drop files here to upload
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <div className="pointer-events-none absolute bottom-24 right-6 z-40">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 shadow-[0_10px_30px_rgba(16,185,129,0.25)] backdrop-blur">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold text-emerald-100">
              Call is active • {activeCallDuration} • {Number(activeCall.joined_count || 0)} participant{Number(activeCall.joined_count || 0) === 1 ? "" : "s"}
            </span>
            {callState === "ringing_incoming" ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetchJson(`/api/chat/calls/${activeCall.id}/join`, { method: "POST" });
                    setActiveRoomId(activeCall.id);
                    setCallState("connected");
                    void mutateCalendar();
                    onToast("Call accepted.", "success");
                  }}
                  className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRingDismissedRoomId(activeCall.id);
                    setCallState("idle");
                    onToast("Call declined.", "success");
                  }}
                  className="rounded-full border border-rose-400/50 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
                >
                  Decline
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await apiFetchJson(`/api/chat/calls/${activeCall.id}/join`, { method: "POST" });
                  setActiveRoomId(activeCall.id);
                  setCallState("connected");
                  void mutateCalendar();
                  onToast("Joined call.", "success");
                }}
                className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
              >
                Join now
              </button>
            )}
            <button
              type="button"
              onClick={async () => launchCall(activeCall.session_mode === "screenshare" ? "call" : "screenshare")}
              className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
            >
              {activeCall.session_mode === "screenshare" ? "Switch to call" : "Present"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (activeRoomId === activeCall.id || callState === "connected") {
                  await endActiveCall(activeCall.id);
                  return;
                }
                setRingDismissedRoomId(activeCall.id);
                setCallState("idle");
              }}
              className="rounded-full border border-rose-400/50 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
            >
              {activeRoomId === activeCall.id || callState === "connected" ? "End call" : "Dismiss"}
            </button>
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
      className={`group flex gap-2 transition-all duration-200 ease-out ${isMe ? "justify-end" : ""}`}
    >
      {!isMe ? (
        <div className="w-8 shrink-0">
          {showSender ? (
            <div className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(message.sender_id)}`}>
              {initials(message.sender_name)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`max-w-[76%] ${isMe ? "items-end" : "items-start"}`}>
        {showSender && !isMe ? <p className="mb-0.5 text-[11px] font-semibold text-slate-300">{message.sender_name}</p> : null}
        {message.attachment_url && isImageAttachment(message) ? (
          <a href={message.attachment_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={message.attachment_url} alt={message.attachment_name || "Attachment"} className="max-h-72 rounded-xl object-contain" />
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
          <div
            className={`mt-1 rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm ${
              isMe
                ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_rgba(79,70,229,0.35)]"
                : "border border-[#33405d] bg-[#121a30] text-slate-100 shadow-[0_6px_16px_rgba(2,6,23,0.35)]"
            }`}
          >
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
                {message.edited_at ? <span className={`ml-1 text-[10px] ${isMe ? "text-indigo-100" : "text-slate-400"}`}>(edited)</span> : null}
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
        <div className={`mt-0.5 flex items-center gap-2 text-[10px] text-slate-400 ${isMe ? "justify-end" : ""}`}>
          <span>{formatTime(message.created_at)}</span>
          <button type="button" onClick={() => addReaction("👍")} className="opacity-0 transition group-hover:opacity-100 hover:text-indigo-600">
            👍
          </button>
          <button type="button" onClick={onOpenThread} className="opacity-0 transition group-hover:opacity-100 hover:text-indigo-600">
            Reply thread{message.thread_reply_count ? ` (${message.thread_reply_count})` : ""}
          </button>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="opacity-0 transition group-hover:opacity-100 hover:text-indigo-600">
            •••
          </button>
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
      const startIso = new Date(scheduleStart).toISOString();
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
          await navigator.clipboard.writeText(payload.invite_link);
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
    <aside className="w-[340px] shrink-0 border-l border-[#2e3a56] bg-[#0d1428]/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#2e3a56] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">{view}</p>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-300 hover:bg-[#1a233a]">
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
                <input
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  className="w-full rounded-lg border border-[#3a4660] bg-[#0b1223] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-indigo-400"
                />
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
    <aside className="w-[400px] shrink-0 border-l border-[#2e3a56] bg-[#121a30] text-slate-100 shadow-[-12px_0_30px_rgba(2,6,23,0.35)]">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Thread</p>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[#1a233a]">
          <X className="h-4 w-4 text-slate-100" />
        </button>
      </div>
      <div className="chat-scrollbar h-[calc(100%-112px)] overflow-y-auto bg-[#0f162a] px-3 py-3">
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
      <div className="border-t border-[#2f3953] bg-[#121a30] p-3">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reply in thread"
          className="w-full resize-none rounded-xl border border-slate-600 bg-[#131828] px-3 py-2.5 text-xs text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300/30"
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
              .filter((c) => c.members.some((m) => m.user_id !== currentUserId))
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
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded-md border border-[#35405a] bg-[#0a1121] px-3 py-2 text-xs text-slate-100"
          />
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

