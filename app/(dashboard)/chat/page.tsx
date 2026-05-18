"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import EmojiPicker from "@/components/chat/EmojiPicker";
import GifPicker from "@/components/chat/GifPicker";
import Toast, { type ToastTone } from "@/components/Toast";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import {
  ChevronLeft,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Plus,
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
  thread_reply_count?: number;
  thread_last_reply_at?: string | null;
};
type ChatUser = { id: number; full_name: string; email: string; role: string };
type SearchResult = {
  id: number;
  conversation_id: number;
  content: string;
  created_at: string;
  sender_name: string;
  conversation_name: string | null;
};
type UploadItemState = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "failed" | "ready";
  error?: string;
  uploaded?: { type: "file" | "image"; url: string; name: string; size: number };
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

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  useEffect(() => {
    apiFetchJson<{ user: { id?: number } }>("/api/auth/me")
      .then((d) => setCurrentUserId(d.user?.id ?? null))
      .catch(() => {});
  }, []);

  const { data: convData, mutate: mutateConvs } = useSWR<{ conversations: Conversation[] }>(
    "/api/chat/conversations",
    dashboardFetcher,
    { refreshInterval: 6000 }
  );

  const conversations = useMemo(() => convData?.conversations ?? [], [convData]);
  const filteredConversations = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => convLabel(conv, currentUserId).toLowerCase().includes(q));
  }, [conversations, sidebarSearch, currentUserId]);

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

  const unreadTotal = useMemo(() => conversations.reduce((sum, conv) => sum + (conv.unread_count ?? 0), 0), [conversations]);

  return (
    <AccessGate permissionKey="chat.view">
      <div className="font-['Inter','Segoe_UI',sans-serif] flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <aside
          className={[
            "w-80 shrink-0 border-r border-slate-200 bg-slate-50/80",
            activeConversation ? "hidden md:flex md:flex-col" : "flex flex-col",
          ].join(" ")}
        >
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
              {unreadTotal > 0 ? (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">{unreadTotal}</span>
              ) : null}
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="ml-auto rounded-md bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search conversations"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">No conversations found</div>
            ) : null}
            {filteredConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeConvId}
                currentUserId={currentUserId}
                onClick={() => setActiveConvId(conv.id)}
              />
            ))}
          </div>
        </aside>

        <main className={["min-w-0 flex-1", activeConversation ? "flex" : "hidden md:flex"].join(" ")}>
          {activeConversation ? (
            <ChatWorkspace
              conversation={activeConversation}
              currentUserId={currentUserId}
              onBack={() => setActiveConvId(null)}
              onMutateConversations={() => void mutateConvs()}
              onToast={(message, tone = "success") => setToast({ message, tone })}
            />
          ) : (
            <div className="flex w-full items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-indigo-400" />
                <p className="mt-3 text-sm font-medium text-slate-800">Start a conversation</p>
                <p className="text-xs text-slate-500">Pick a chat from the left or create a new one.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {showNewChat ? (
        <NewChatModal
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
    </AccessGate>
  );
}

function ConversationRow({
  conv,
  isActive,
  currentUserId,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  currentUserId: number | null;
  onClick: () => void;
}) {
  const label = convLabel(conv, currentUserId);
  const unread = conv.unread_count ?? 0;
  const last = conv.last_message;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full border-l-2 px-4 py-2.5 text-left transition",
        isActive ? "border-indigo-600 bg-indigo-50/80" : "border-transparent hover:bg-slate-100/80",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(conv.id)}`}>
          {conv.type === "group" ? <Users className="h-3.5 w-3.5" /> : initials(label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${unread > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{label}</span>
            {last ? <span className="text-[10px] text-slate-400">{formatTime(last.created_at)}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-xs text-slate-500">
              {last ? (last.is_system ? last.content : `${last.sender_name.split(" ")[0]}: ${last.content}`) : "No messages yet"}
            </span>
            {unread > 0 ? (
              <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>
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
  onBack,
  onMutateConversations,
  onToast,
}: {
  conversation: Conversation;
  currentUserId: number | null;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messageRefreshInterval = threadParent ? 2500 : 3000;
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
  }, [conversation.id]);

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
      if (!trimmed && !attachment) return;
      setSending(true);
      try {
        await apiFetchJson(`/api/chat/conversations/${conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
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
      if (!trimmed && !attachment) return;
      await apiFetchJson(`/api/chat/conversations/${conversation.id}/threads/${threadParent.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
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
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="rounded p-1 hover:bg-slate-100 md:hidden">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(conversation.id)}`}>
              {conversation.type === "group" ? <Users className="h-3.5 w-3.5" /> : initials(convLabel(conversation, currentUserId))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{convLabel(conversation, currentUserId)}</p>
              <p className="text-[11px] text-slate-500">
                {conversation.type === "group" ? `${conversation.members.length} members` : "Direct message"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search in chat"
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
              />
            </div>
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value as "all" | "conversation")}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="conversation">This chat</option>
              <option value="all">All chats</option>
            </select>
          </div>
          {searchQ.trim().length >= 2 && searchData ? (
            <div className="mt-2 max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5">
              {(searchData.results ?? []).slice(0, 8).map((row) => (
                <button
                  key={`${row.conversation_id}-${row.id}`}
                  type="button"
                  onClick={() => {
                    if (row.conversation_id !== conversation.id) return;
                    const el = document.getElementById(`message-${row.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="w-full rounded px-2 py-1 text-left hover:bg-slate-100"
                >
                  <p className="truncate text-[11px] font-medium text-slate-700">{row.sender_name}</p>
                  <p className="truncate text-[11px] text-slate-500">{row.content}</p>
                </button>
              ))}
              {searchData.results?.length === 0 ? <p className="px-2 py-1 text-xs text-slate-500">No matches</p> : null}
            </div>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {grouped.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">No messages yet. Start the conversation.</div>
          ) : null}
          <div className="space-y-1">
            {grouped.map((item, idx) =>
              item.type === "divider" ? (
                <div key={`day-${idx}`} className="my-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              ) : (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  isMe={item.message.sender_id === currentUserId}
                  showSender={item.showSender}
                  onOpenThread={() => setThreadParent(item.message)}
                />
              )
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          {uploadQueue.length > 0 ? (
            <div className="mb-2 space-y-1">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">{item.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatFileSize(item.size)} •{" "}
                      {item.status === "uploading" ? "Uploading…" : item.status === "ready" ? "Ready" : item.error || "Failed"}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeUploadItem(item.id)} className="rounded p-1 text-slate-500 hover:bg-slate-200">
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
                className="rounded p-2 text-slate-500 hover:bg-slate-100"
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
                className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
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
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded p-2 text-slate-500 hover:bg-slate-100">
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
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  await sendComposer();
                }
              }}
              placeholder="Type a message"
              className="max-h-40 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-5 text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={async () => sendComposer()}
              disabled={sending}
              className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Enter to send • Shift+Enter for new line • Drag files to upload</p>
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

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-indigo-500/10 backdrop-blur-[1px]">
          <div className="rounded-xl border border-indigo-300 bg-white/95 px-5 py-3 text-sm font-medium text-indigo-700 shadow">
            Drop files here to upload
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  isMe,
  showSender,
  onOpenThread,
}: {
  message: Message;
  isMe: boolean;
  showSender: boolean;
  onOpenThread: () => void;
}) {
  return (
    <div id={`message-${message.id}`} className={`group flex gap-2 ${isMe ? "justify-end" : ""}`}>
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
        {showSender && !isMe ? <p className="mb-0.5 text-[11px] font-semibold text-slate-600">{message.sender_name}</p> : null}
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
            className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 ${
              isMe ? "border-indigo-400/30 bg-indigo-600/10" : "border-slate-200 bg-slate-50"
            }`}
          >
            <FileBadge name={message.attachment_name || ""} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800">{message.attachment_name || "Attachment"}</p>
              <p className="text-[10px] text-slate-500">{formatFileSize(message.attachment_size)}</p>
            </div>
            <Download className="ml-auto h-3.5 w-3.5 text-slate-500" />
          </a>
        ) : null}
        {message.content ? (
          <div className={`mt-1 rounded-xl px-3 py-2 text-sm leading-5 ${isMe ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>
            {message.content}
          </div>
        ) : null}
        <div className={`mt-0.5 flex items-center gap-2 text-[10px] text-slate-500 ${isMe ? "justify-end" : ""}`}>
          <span>{formatTime(message.created_at)}</span>
          <button type="button" onClick={onOpenThread} className="opacity-0 transition group-hover:opacity-100 hover:text-indigo-600">
            Reply thread{message.thread_reply_count ? ` (${message.thread_reply_count})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileBadge({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return <FileText className="h-4 w-4 text-rose-500" />;
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return <ImageIcon className="h-4 w-4 text-indigo-500" />;
  return <File className="h-4 w-4 text-slate-500" />;
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
    <aside className="w-[360px] shrink-0 border-l border-slate-200 bg-slate-50/60">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Thread</p>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-200">
          <X className="h-4 w-4 text-slate-600" />
        </button>
      </div>
      <div className="h-[calc(100%-112px)] overflow-y-auto px-3 py-2">
        <MessageBubble message={parent} isMe={parent.sender_id === currentUserId} showSender onOpenThread={() => {}} />
        <div className="my-3 h-px bg-slate-200" />
        <div className="space-y-2">
          {replies.map((reply) => (
            <MessageBubble key={reply.id} message={reply} isMe={reply.sender_id === currentUserId} showSender onOpenThread={() => {}} />
          ))}
          {replies.length === 0 ? <p className="text-xs text-slate-500">No replies yet.</p> : null}
        </div>
      </div>
      <div className="border-t border-slate-200 p-3">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reply in thread"
          className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
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
          className="mt-2 w-full rounded-md bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Send reply
        </button>
        <p className="mt-1 text-[10px] text-slate-500">Conversation #{conversationId}</p>
      </div>
    </aside>
  );
}

function NewChatModal({
  currentUserId,
  onClose,
  onCreate,
}: {
  currentUserId: number | null;
  onClose: () => void;
  onCreate: (id: number) => void;
}) {
  const [chatType, setChatType] = useState<"direct" | "group">("direct");
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">New conversation</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChatType("direct")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${chatType === "direct" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Direct
            </button>
            <button
              type="button"
              onClick={() => setChatType("group")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${chatType === "group" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Group
            </button>
          </div>
          {chatType === "group" ? (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
            />
          ) : null}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users"
              className="w-full rounded-md border border-slate-200 px-8 py-2 text-xs outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
            />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200">
            {users.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <div className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(user.id)}`}>
                    {initials(user.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{user.full_name}</p>
                    <p className="truncate text-[10px] text-slate-500">{user.email}</p>
                  </div>
                  {checked ? <span className="text-xs font-semibold text-indigo-600">Selected</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
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
