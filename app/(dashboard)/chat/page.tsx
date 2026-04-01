"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import {
  MessageSquare, Plus, Search, Send, Users, User, Hash,
  ChevronLeft, UserPlus, LogOut, X, Smile, Paperclip, Image as ImageIcon,
  FileText, Download, File,
} from "lucide-react";
import EmojiPicker from "@/components/chat/EmojiPicker";
import GifPicker from "@/components/chat/GifPicker";
import AccessGate from "@/components/AccessGate";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Member = { user_id: number; full_name: string; email: string };
type LastMessage = {
  id: number; content: string; sender_id: number;
  is_system: boolean; created_at: string; sender_name: string;
};
type Conversation = {
  id: number; name: string | null; type: "direct" | "group";
  created_by: number; created_at: string; updated_at: string;
  last_read_at: string; unread_count: number;
  last_message: LastMessage | null; members: Member[];
};
type Message = {
  id: number; conversation_id: number; sender_id: number;
  content: string; is_system: boolean; created_at: string;
  sender_name: string; sender_email: string;
  attachment_type: "file" | "image" | "gif" | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
};
type ChatUser = { id: number; full_name: string; email: string; role: string };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

const AVATAR_COLORS = [
  "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    apiFetchJson<{ user: { id?: number }; }>("/api/auth/me")
      .then((d) => setCurrentUserId(d.user?.id ?? null))
      .catch(() => {});
  }, []);

  const { data: convData, mutate: mutateConvs } = useSWR<{ conversations: Conversation[] }>(
    "/api/chat/conversations",
    dashboardFetcher,
    { refreshInterval: 5000 }
  );
  const conversations = useMemo(() => convData?.conversations ?? [], [convData]);

  const filtered = useMemo(() => {
    if (!sidebarSearch.trim()) return conversations;
    const lc = sidebarSearch.toLowerCase();
    return conversations.filter((c) => convLabel(c, currentUserId).toLowerCase().includes(lc));
  }, [conversations, sidebarSearch, currentUserId]);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const handleNewConv = useCallback((id: number) => {
    setShowNewChat(false);
    setActiveConvId(id);
    void mutateConvs();
  }, [mutateConvs]);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <AccessGate permissionKey="chat.view">
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Sidebar */}
      <div className={[
        "flex w-80 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80",
        activeConvId != null ? "hidden md:flex" : "flex",
      ].join(" ")}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <MessageSquare className="h-5 w-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Chat</h2>
          {totalUnread > 0 && (
            <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {totalUnread}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            className="ml-auto rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-700"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              {conversations.length === 0 ? "No conversations yet" : "No matches"}
            </div>
          )}
          {filtered.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConvId}
              currentUserId={currentUserId}
              onClick={() => setActiveConvId(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className={[
        "flex flex-1 flex-col",
        activeConvId == null ? "hidden md:flex" : "flex",
      ].join(" ")}>
        {activeConvId != null && activeConv ? (
          <ChatThread
            conv={activeConv}
            currentUserId={currentUserId}
            onBack={() => setActiveConvId(null)}
            onMutateConvs={() => void mutateConvs()}
          />
        ) : (
          <EmptyState onNewChat={() => setShowNewChat(true)} />
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          currentUserId={currentUserId}
          onClose={() => setShowNewChat(false)}
          onCreate={handleNewConv}
        />
      )}
    </div>
    </AccessGate>
  );
}

/* ================================================================== */
/*  Conversation label helper                                          */
/* ================================================================== */

function convLabel(conv: Conversation, currentUserId: number | null): string {
  if (conv.name) return conv.name;
  if (conv.type === "direct" && conv.members) {
    const other = conv.members.find((m) => m.user_id !== currentUserId);
    return other?.full_name ?? "Direct message";
  }
  if (conv.members) return conv.members.map((m) => m.full_name.split(" ")[0]).join(", ");
  return "Conversation";
}

/* ================================================================== */
/*  Conversation Row                                                   */
/* ================================================================== */

function ConversationRow({
  conv, isActive, currentUserId, onClick,
}: {
  conv: Conversation; isActive: boolean; currentUserId: number | null; onClick: () => void;
}) {
  const label = convLabel(conv, currentUserId);
  const lastMsg = conv.last_message;
  const unread = conv.unread_count ?? 0;
  const otherMember = conv.type === "direct"
    ? conv.members?.find((m) => m.user_id !== currentUserId) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-start gap-3 px-4 py-3 text-left transition",
        isActive
          ? "bg-indigo-50 border-l-2 border-indigo-600 dark:bg-indigo-950/30"
          : "hover:bg-slate-100 border-l-2 border-transparent dark:hover:bg-slate-800",
      ].join(" ")}
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${
        conv.type === "group" ? "bg-slate-500" : avatarColor(otherMember?.user_id ?? conv.id)
      }`}>
        {conv.type === "group"
          ? <Users className="h-4 w-4" />
          : initials(otherMember?.full_name ?? label)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${unread > 0 ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-800 dark:text-slate-200"}`}>
            {label}
          </span>
          {lastMsg && <span className="shrink-0 text-[10px] text-slate-400">{formatTime(lastMsg.created_at)}</span>}
        </div>
        {lastMsg && (
          <div className="flex items-center gap-2">
            <p className={`truncate text-xs ${unread > 0 ? "font-medium text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
              {lastMsg.is_system ? lastMsg.content : `${lastMsg.sender_name.split(" ")[0]}: ${lastMsg.content}`}
            </p>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/* ================================================================== */
/*  Chat Thread                                                        */
/* ================================================================== */

function ChatThread({
  conv, currentUserId, onBack, onMutateConvs,
}: {
  conv: Conversation; currentUserId: number | null; onBack: () => void; onMutateConvs: () => void;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: msgData, mutate: mutateMessages } = useSWR<{ messages: Message[]; has_more: boolean }>(
    `/api/chat/conversations/${conv.id}/messages?limit=100`,
    dashboardFetcher,
    { refreshInterval: 3000 }
  );
  const messages = msgData?.messages ?? [];

  useEffect(() => {
    if (conv.unread_count > 0) {
      apiFetchJson(`/api/chat/conversations/${conv.id}/read`, { method: "PATCH" })
        .then(() => onMutateConvs())
        .catch(() => {});
    }
  }, [conv.id, conv.unread_count, onMutateConvs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => { inputRef.current?.focus(); }, [conv.id]);

  const sendMessage = useCallback(async (
    text: string,
    attachment?: { type: string; url: string; name: string; size: number }
  ) => {
    if ((!text.trim() && !attachment) || sending) return;
    setSending(true);
    try {
      await apiFetchJson(`/api/chat/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          attachment_type: attachment?.type ?? null,
          attachment_url: attachment?.url ?? null,
          attachment_name: attachment?.name ?? null,
          attachment_size: attachment?.size ?? null,
        }),
      });
      void mutateMessages();
      onMutateConvs();
    } catch { /* ignore */ }
    finally { setSending(false); inputRef.current?.focus(); }
  }, [sending, conv.id, mutateMessages, onMutateConvs]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text);
  }, [input, sending, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  }, []);

  const handleGifSelect = useCallback(async (gifUrl: string) => {
    setShowGif(false);
    await sendMessage("", { type: "gif", url: gifUrl, name: "GIF", size: 0 });
  }, [sendMessage]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Upload failed");
        return;
      }
      const data = await res.json() as { url: string; name: string; size: number; type: string };
      await sendMessage(
        data.type === "image" ? "" : `📎 ${data.name}`,
        { type: data.type, url: data.url, name: data.name, size: data.size }
      );
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }, [sendMessage]);

  const label = convLabel(conv, currentUserId);
  const memberCount = conv.members?.length ?? 0;

  return (
    <>
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <button type="button" onClick={onBack} className="rounded-lg p-1 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800">
          <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        </button>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${
          conv.type === "group" ? "bg-slate-500" : avatarColor(conv.id)
        }`}>
          {conv.type === "group" ? <Users className="h-4 w-4" /> : initials(label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</div>
          <div className="text-xs text-slate-500">
            {conv.type === "group" ? `${memberCount} members` : "Direct message"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Info"
        >
          <Users className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No messages yet. Say hello! 👋
              </div>
            )}
            <MessageList messages={messages} currentUserId={currentUserId} />
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            {/* Toolbar row */}
            <div className="relative mb-2 flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); }}
                  className={[
                    "rounded-lg p-2 transition",
                    showEmoji
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300",
                  ].join(" ")}
                  title="Emoji"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {showEmoji && (
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClose={() => setShowEmoji(false)}
                  />
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowGif(!showGif); setShowEmoji(false); }}
                  className={[
                    "rounded-lg px-2 py-1.5 text-xs font-bold transition",
                    showGif
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300",
                  ].join(" ")}
                  title="GIF"
                >
                  GIF
                </button>
                {showGif && (
                  <GifPicker
                    onSelect={handleGifSelect}
                    onClose={() => setShowGif(false)}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                title="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
              />

              {uploading && (
                <span className="ml-2 flex items-center gap-1 text-xs text-indigo-600">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading…
                </span>
              )}
            </div>

            {/* Text input + send */}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send)"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                style={{ minHeight: 40, maxHeight: 120 }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || sending}
                className="rounded-xl bg-indigo-600 p-2.5 text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {showInfo && (
          <ConversationInfo
            conv={conv}
            currentUserId={currentUserId}
            onClose={() => setShowInfo(false)}
            onMutateConvs={onMutateConvs}
          />
        )}
      </div>
    </>
  );
}

/* ================================================================== */
/*  Message List                                                       */
/* ================================================================== */

function MessageList({ messages, currentUserId }: { messages: Message[]; currentUserId: number | null }) {
  let lastDate = "";
  let lastSenderId: number | null = null;

  return (
    <div className="space-y-1">
      {messages.map((msg) => {
        const msgDate = new Date(msg.created_at).toDateString();
        const showDateSep = msgDate !== lastDate;
        lastDate = msgDate;
        const isMe = msg.sender_id === currentUserId;
        const showSender = msg.sender_id !== lastSenderId || showDateSep;
        lastSenderId = msg.sender_id;

        return (
          <React.Fragment key={msg.id}>
            {showDateSep && <DateSeparator date={msg.created_at} />}
            {msg.is_system ? (
              <SystemMessage content={msg.content} />
            ) : (
              <MessageBubble msg={msg} isMe={isMe} showSender={showSender} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  let label: string;
  if (d.toDateString() === now.toDateString()) label = "Today";
  else {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  }
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
    </div>
  );
}

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="py-1 text-center text-xs italic text-slate-400 dark:text-slate-500">
      {content}
    </div>
  );
}

/* ================================================================== */
/*  Message Bubble — supports text, images, GIFs, files                */
/* ================================================================== */

function MessageBubble({ msg, isMe, showSender }: { msg: Message; isMe: boolean; showSender: boolean }) {
  const hasAttachment = msg.attachment_type && msg.attachment_url;
  const isImageAttachment = msg.attachment_type === "image" || msg.attachment_type === "gif";

  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""} ${showSender ? "mt-3" : "mt-0.5"}`}>
      {showSender ? (
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(msg.sender_id)}`}>
          {initials(msg.sender_name)}
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div className={`max-w-[75%] min-w-0 ${isMe ? "items-end" : "items-start"}`}>
        {showSender && !isMe && (
          <div className="mb-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {msg.sender_name}
          </div>
        )}

        {/* Image / GIF attachment */}
        {hasAttachment && isImageAttachment && (
          <div className={`mb-1 overflow-hidden rounded-2xl ${isMe ? "rounded-tr-md" : "rounded-tl-md"}`}>
            <a href={msg.attachment_url!} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={msg.attachment_url!}
                alt={msg.attachment_name || "Image"}
                className="max-h-64 max-w-full rounded-2xl object-contain"
                loading="lazy"
              />
            </a>
          </div>
        )}

        {/* File attachment */}
        {hasAttachment && msg.attachment_type === "file" && (
          <a
            href={msg.attachment_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "mb-1 flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
              isMe
                ? "border-indigo-500/30 bg-indigo-700/20 text-white hover:bg-indigo-700/30"
                : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
            ].join(" ")}
          >
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              isMe ? "bg-white/10" : "bg-indigo-50 dark:bg-indigo-950/40"
            }`}>
              <FileIcon name={msg.attachment_name || ""} isMe={isMe} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{msg.attachment_name || "File"}</div>
              <div className={`text-[10px] ${isMe ? "text-indigo-200" : "text-slate-500 dark:text-slate-400"}`}>
                {formatFileSize(msg.attachment_size)}
              </div>
            </div>
            <Download className="h-4 w-4 shrink-0 opacity-60" />
          </a>
        )}

        {/* Text content */}
        {msg.content && (
          <div className={[
            "rounded-2xl px-4 py-2 text-sm leading-relaxed",
            isMe
              ? "bg-indigo-600 text-white rounded-tr-md"
              : "bg-slate-100 text-slate-900 rounded-tl-md dark:bg-slate-800 dark:text-slate-100",
          ].join(" ")}>
            <RichText text={msg.content} isMe={isMe} />
          </div>
        )}

        <div className={`mt-0.5 text-[10px] text-slate-400 ${isMe ? "text-right" : ""}`}>
          {formatMessageTime(msg.created_at)}
        </div>
      </div>
    </div>
  );
}

function FileIcon({ name, isMe }: { name: string; isMe: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconColor = isMe ? "text-white/70" : "text-indigo-500 dark:text-indigo-400";

  if (["pdf"].includes(ext)) return <FileText className={`h-5 w-5 ${iconColor}`} />;
  if (["doc", "docx"].includes(ext)) return <FileText className={`h-5 w-5 ${iconColor}`} />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileText className={`h-5 w-5 ${iconColor}`} />;
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return <ImageIcon className={`h-5 w-5 ${iconColor}`} />;
  return <File className={`h-5 w-5 ${iconColor}`} />;
}

/* ================================================================== */
/*  Rich Text — renders URLs as links, detects inline images           */
/* ================================================================== */

const URL_REGEX = /(https?:\/\/[^\s<]+)/gi;

function RichText({ text, isMe }: { text: string; isMe: boolean }) {
  const parts = text.split(URL_REGEX);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          URL_REGEX.lastIndex = 0;
          if (isImageUrl(part)) {
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="block my-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={part} alt="" className="max-h-48 max-w-full rounded-lg" loading="lazy" />
              </a>
            );
          }
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${isMe ? "text-indigo-200 hover:text-white" : "text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"}`}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
}

/* ================================================================== */
/*  Conversation Info Panel                                            */
/* ================================================================== */

function ConversationInfo({
  conv, currentUserId, onClose, onMutateConvs,
}: {
  conv: Conversation; currentUserId: number | null; onClose: () => void; onMutateConvs: () => void;
}) {
  const [showAddMember, setShowAddMember] = useState(false);

  async function handleLeave() {
    if (!confirm("Leave this conversation?")) return;
    try {
      await apiFetchJson(`/api/chat/conversations/${conv.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onMutateConvs();
      onClose();
    } catch { /* ignore */ }
  }

  return (
    <div className="w-64 shrink-0 border-l border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Members</h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {conv.members?.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2">
            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${avatarColor(m.user_id)}`}>
              {initials(m.full_name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                {m.full_name}{m.user_id === currentUserId ? " (you)" : ""}
              </div>
              <div className="truncate text-[10px] text-slate-400">{m.email}</div>
            </div>
          </div>
        ))}
      </div>

      {conv.type === "group" && (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => setShowAddMember(!showAddMember)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add member
          </button>
          {showAddMember && (
            <AddMemberInline
              convId={conv.id}
              existingIds={conv.members?.map((m) => m.user_id) ?? []}
              onDone={() => { setShowAddMember(false); onMutateConvs(); }}
            />
          )}
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Leave group
          </button>
        </div>
      )}
    </div>
  );
}

function AddMemberInline({ convId, existingIds, onDone }: { convId: number; existingIds: number[]; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const { data } = useSWR<{ users: ChatUser[] }>(
    `/api/chat/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    dashboardFetcher
  );
  const users = (data?.users ?? []).filter((u) => !existingIds.includes(u.id));

  async function add(uid: number) {
    try {
      await apiFetchJson(`/api/chat/conversations/${convId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: [uid] }),
      });
      onDone();
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users…"
        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="mt-1 max-h-32 overflow-y-auto">
        {users.slice(0, 8).map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => void add(u.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <div className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold text-white ${avatarColor(u.id)}`}>
              {initials(u.full_name)}
            </div>
            <span className="truncate text-slate-700 dark:text-slate-300">{u.full_name}</span>
          </button>
        ))}
        {users.length === 0 && <div className="px-2 py-1 text-[10px] text-slate-400">No users found</div>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  New Chat Modal                                                     */
/* ================================================================== */

function NewChatModal({
  currentUserId, onClose, onCreate,
}: {
  currentUserId: number | null; onClose: () => void; onCreate: (id: number) => void;
}) {
  const [chatType, setChatType] = useState<"direct" | "group">("direct");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const { data } = useSWR<{ users: ChatUser[] }>(
    `/api/chat/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    dashboardFetcher
  );
  const users = data?.users ?? [];

  function toggleUser(id: number) {
    if (chatType === "direct") { setSelectedIds([id]); return; }
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleCreate() {
    if (selectedIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const res = await apiFetchJson<{ conversation_id: number }>("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: chatType,
          member_ids: selectedIds,
          name: chatType === "group" ? groupName.trim() || null : null,
        }),
      });
      onCreate(res.conversation_id);
    } catch { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">New Conversation</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setChatType("direct"); setSelectedIds([]); }}
              className={[
                "flex-1 rounded-xl py-2 text-xs font-semibold transition",
                chatType === "direct" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
              ].join(" ")}
            >
              <User className="inline h-3.5 w-3.5 mr-1" /> Direct Message
            </button>
            <button
              type="button"
              onClick={() => { setChatType("group"); setSelectedIds([]); }}
              className={[
                "flex-1 rounded-xl py-2 text-xs font-semibold transition",
                chatType === "group" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300",
              ].join(" ")}
            >
              <Users className="inline h-3.5 w-3.5 mr-1" /> Group Chat
            </button>
          </div>

          {chatType === "group" && (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className={UI.input + " text-xs"}
            />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or email…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedIds.map((id) => {
                const u = users.find((usr) => usr.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                    {u?.full_name ?? `User #${id}`}
                    <button type="button" onClick={() => setSelectedIds((p) => p.filter((x) => x !== id))} className="hover:text-indigo-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            {users.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">No users found</div>
            )}
            {users.map((u) => {
              const checked = selectedIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition",
                    checked ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${avatarColor(u.id)}`}>
                    {initials(u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{u.full_name}</div>
                    <div className="text-[10px] text-slate-400">{u.email}</div>
                  </div>
                  {checked && <div className="shrink-0 text-indigo-600 dark:text-indigo-400">✓</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button type="button" onClick={onClose} className={UI.secondaryButton + " py-2 text-xs"}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={selectedIds.length === 0 || creating}
            className={UI.primaryButton + " py-2 text-xs"}
          >
            {creating ? "Creating…" : chatType === "direct" ? "Start Chat" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Empty State                                                        */
/* ================================================================== */

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/30">
        <MessageSquare className="h-8 w-8 text-indigo-500" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Welcome to Chat</h3>
        <p className="mt-1 text-sm text-slate-500">
          Start a conversation with your team — direct messages or group chats.
        </p>
      </div>
      <button type="button" onClick={onNewChat} className={UI.primaryButton + " py-2 text-sm"}>
        <Plus className="h-4 w-4" /> New Conversation
      </button>
    </div>
  );
}
