"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";

type Props = {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
};

type GifResult = { url: string; preview: string; width: number; height: number; title: string };

const TRENDING_GIFS: GifResult[] = [
  { url: "https://media.giphy.com/media/l0MYt5jPR6QX5APnG/giphy.gif", preview: "https://media.giphy.com/media/l0MYt5jPR6QX5APnG/200w.gif", width: 200, height: 200, title: "Thumbs Up" },
  { url: "https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/giphy.gif", preview: "https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/200w.gif", width: 200, height: 150, title: "Celebration" },
  { url: "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", preview: "https://media.giphy.com/media/26u4cqiYI30juCOGY/200w.gif", width: 200, height: 150, title: "Clapping" },
  { url: "https://media.giphy.com/media/3oz8xIsloV320wXJf2/giphy.gif", preview: "https://media.giphy.com/media/3oz8xIsloV320wXJf2/200w.gif", width: 200, height: 150, title: "Mind Blown" },
  { url: "https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif", preview: "https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/200w.gif", width: 200, height: 150, title: "Thank You" },
  { url: "https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif", preview: "https://media.giphy.com/media/XreQmk7ETCak0/200w.gif", width: 200, height: 150, title: "LOL" },
  { url: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif", preview: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif", width: 200, height: 150, title: "Welcome" },
  { url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", preview: "https://media.giphy.com/media/g9582DNuQppxC/200w.gif", width: 200, height: 150, title: "Party" },
];

const REACTION_GIFS: Record<string, GifResult[]> = {
  "👍 Reactions": [
    { url: "https://media.giphy.com/media/l0MYt5jPR6QX5APnG/giphy.gif", preview: "https://media.giphy.com/media/l0MYt5jPR6QX5APnG/200w.gif", width: 200, height: 200, title: "Thumbs Up" },
    { url: "https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/giphy.gif", preview: "https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/200w.gif", width: 200, height: 150, title: "Nice" },
    { url: "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", preview: "https://media.giphy.com/media/26u4cqiYI30juCOGY/200w.gif", width: 200, height: 150, title: "Applause" },
  ],
  "😂 Funny": [
    { url: "https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif", preview: "https://media.giphy.com/media/XreQmk7ETCak0/200w.gif", width: 200, height: 150, title: "LOL" },
    { url: "https://media.giphy.com/media/3oz8xIsloV320wXJf2/giphy.gif", preview: "https://media.giphy.com/media/3oz8xIsloV320wXJf2/200w.gif", width: 200, height: 150, title: "Mind Blown" },
  ],
  "🎉 Celebrate": [
    { url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", preview: "https://media.giphy.com/media/g9582DNuQppxC/200w.gif", width: 200, height: 150, title: "Party" },
    { url: "https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif", preview: "https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/200w.gif", width: 200, height: 150, title: "Thank You" },
  ],
};

export default function GifPicker({ onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"trending" | "categories" | "url">("trending");

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleUrlSubmit = useCallback(() => {
    const u = gifUrl.trim();
    if (u && (u.endsWith(".gif") || u.endsWith(".webp") || u.includes("giphy.com") || u.includes("tenor.com") || u.includes("imgur.com"))) {
      onSelect(u);
    }
  }, [gifUrl, onSelect]);

  const filteredTrending = search.trim()
    ? TRENDING_GIFS.filter((g) => g.title.toLowerCase().includes(search.toLowerCase()))
    : TRENDING_GIFS;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
        {(["trending", "categories", "url"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              "rounded-md px-2.5 py-1 text-xs font-semibold transition",
              activeTab === tab
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            {tab === "trending" ? "🔥 Trending" : tab === "categories" ? "📁 Categories" : "🔗 URL"}
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

      {/* Search (for trending) */}
      {activeTab === "trending" && (
        <div className="px-2 py-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GIFs…"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-h-64 overflow-y-auto px-2 pb-2">
        {activeTab === "trending" && (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredTrending.map((gif, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(gif.url)}
                className="group relative overflow-hidden rounded-lg border border-slate-200 transition hover:border-indigo-400 dark:border-slate-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.preview} alt={gif.title} className="h-24 w-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1 opacity-0 transition group-hover:opacity-100">
                  <span className="text-[10px] font-medium text-white">{gif.title}</span>
                </div>
              </button>
            ))}
            {filteredTrending.length === 0 && (
              <div className="col-span-2 py-8 text-center text-xs text-slate-400">No GIFs found</div>
            )}
          </div>
        )}

        {activeTab === "categories" && (
          <div className="space-y-3">
            {Object.entries(REACTION_GIFS).map(([catName, gifs]) => (
              <div key={catName}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {catName}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {gifs.map((gif, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelect(gif.url)}
                      className="overflow-hidden rounded-lg border border-slate-200 transition hover:border-indigo-400 dark:border-slate-700"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gif.preview} alt={gif.title} className="h-16 w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "url" && (
          <div className="space-y-3 p-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste a GIF URL from Giphy, Tenor, or Imgur:
            </p>
            <input
              type="url"
              value={gifUrl}
              onChange={(e) => setGifUrl(e.target.value)}
              placeholder="https://media.giphy.com/media/.../giphy.gif"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onKeyDown={(e) => { if (e.key === "Enter") handleUrlSubmit(); }}
            />
            {gifUrl.trim() && (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gifUrl.trim()}
                  alt="GIF preview"
                  className="max-h-32 w-full object-contain bg-slate-50 dark:bg-slate-800"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!gifUrl.trim()}
              className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >
              Send GIF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
