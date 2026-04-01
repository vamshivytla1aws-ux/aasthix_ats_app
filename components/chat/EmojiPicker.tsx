"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { EMOJI_CATEGORIES } from "@/lib/chatEmojis";
import { Search, X } from "lucide-react";

type Props = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

const STORAGE_KEY = "ats-chat-recent-emojis";
const MAX_RECENT = 24;

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("recent");
  const [search, setSearch] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) setRecentEmojis(stored.slice(0, MAX_RECENT));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handlePick = useCallback((emoji: string) => {
    onSelect(emoji);
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [onSelect]);

  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

  const filtered = search.trim()
    ? allEmojis.filter((e) => e.includes(search.trim()))
    : null;

  const displayCategories = filtered
    ? [{ id: "search", label: "Search Results", icon: "🔍", emojis: [...new Set(filtered)] }]
    : EMOJI_CATEGORIES.map((c) =>
        c.id === "recent" ? { ...c, emojis: recentEmojis.length > 0 ? recentEmojis : c.emojis } : c
      );

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Category tabs */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
            title={cat.label}
            className={[
              "rounded-md px-1.5 py-1 text-base transition",
              activeCategory === cat.id && !search
                ? "bg-indigo-50 dark:bg-indigo-950/40"
                : "hover:bg-slate-100 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            {cat.icon}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Emoji grid */}
      <div className="max-h-52 overflow-y-auto px-2 pb-2">
        {displayCategories.map((cat) => {
          if (!search && cat.id !== activeCategory && cat.id !== "search") return null;
          if (cat.emojis.length === 0) return null;
          return (
            <div key={cat.id}>
              <div className="sticky top-0 z-10 bg-white py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                {cat.label}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji, i) => (
                  <button
                    key={`${cat.id}-${i}`}
                    type="button"
                    onClick={() => handlePick(emoji)}
                    className="rounded-md p-1.5 text-xl transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered && filtered.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-400">No emojis found</div>
        )}
      </div>
    </div>
  );
}
