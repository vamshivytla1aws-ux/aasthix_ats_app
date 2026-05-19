"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ExternalMessage = {
  id: number;
  content: string;
  created_at: string;
  sender_name: string;
  is_system: boolean;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ExternalChatPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [conversationName, setConversationName] = useState<string>("External Chat");
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const endpoint = useMemo(() => `/api/chat/external/${token}`, [token]);
  const messagesEndpoint = useMemo(() => `/api/chat/external/${token}/messages?limit=100`, [token]);

  const refreshMessages = useCallback(async () => {
    const res = await fetch(messagesEndpoint, { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload?.error || "Failed to load messages.");
    }
    setMessages(payload.messages || []);
    if (payload.external_name) setName(String(payload.external_name));
  }, [messagesEndpoint]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(endpoint, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Invalid invite.");
        if (!mounted) return;
        setName(String(payload.invite?.external_name || "Guest"));
        setConversationName(String(payload.invite?.conversation_name || "External Chat"));
        await refreshMessages();
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Unable to open chat.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const t = setInterval(() => {
      refreshMessages().catch((e) => setError(e instanceof Error ? e.message : "Refresh failed."));
    }, 4000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [endpoint, messagesEndpoint, refreshMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    try {
      setSending(true);
      const res = await fetch(`/api/chat/external/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to send.");
      setInput("");
      await refreshMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">Opening chat…</div>;
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-slate-200">
        <div>
          <p className="text-lg font-semibold">External chat unavailable</p>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <p className="text-sm uppercase tracking-wide text-indigo-300">External • {name}</p>
        <p className="text-lg font-semibold">{conversationName}</p>
      </header>
      <main className="chat-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
              <p className="text-xs text-slate-400">
                {m.sender_name} • {formatTime(m.created_at)}
              </p>
              <p className="mt-1 text-sm">{m.content}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm outline-none focus:border-indigo-400"
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                await sendMessage();
              }
            }}
          />
          <button
            type="button"
            onClick={async () => sendMessage()}
            disabled={sending}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
