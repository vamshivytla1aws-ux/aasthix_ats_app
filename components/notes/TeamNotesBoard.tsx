"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Pin, Trash2 } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import {
  BOARD_COLUMNS,
  STICKY_COLORS,
  type BoardColumn,
  type StickyNoteColor,
} from "@/lib/pipelineStickyNotes/validation";
import { TEAM_NOTES_API_PATH } from "@/lib/teamNotes";

const COLUMN_LABELS: Record<BoardColumn, string> = {
  follow_up: "Follow-up",
  team_sync: "Team sync",
  done: "Done",
};

const COLOR_DOT: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-200 border-amber-400",
  blue: "bg-sky-300 border-sky-500",
  green: "bg-emerald-300 border-emerald-500",
  pink: "bg-rose-300 border-rose-500",
};

export type TeamNoteDto = {
  id: number;
  author_user_id: number;
  author_name: string;
  content: string;
  color: StickyNoteColor;
  board_column: BoardColumn;
  is_pinned: boolean;
  visibility: "team" | "private";
  updated_at: string;
};

type NotesResponse = { notes: TeamNoteDto[] };

function TeamNoteCard({
  note,
  canManage,
  onUpdated,
  onDeleted,
}: {
  note: TeamNoteDto;
  canManage: boolean;
  onUpdated: (n: TeamNoteDto) => void;
  onDeleted: (id: number) => void;
}) {
  const [content, setContent] = useState(note.content);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(note.content);
  }, [note.content]);

  const flushSave = useCallback(
    async (next: string) => {
      if (!canManage) return;
      setSaving(true);
      try {
        const data = await apiFetchJson<{ note: TeamNoteDto }>(`${TEAM_NOTES_API_PATH}/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: next }),
        });
        if (data.note) onUpdated(data.note);
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    },
    [canManage, note.id, onUpdated]
  );

  function scheduleSave(next: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(next), 450);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function patch(p: Record<string, unknown>) {
    if (!canManage) return;
    try {
      const data = await apiFetchJson<{ note: TeamNoteDto }>(`${TEAM_NOTES_API_PATH}/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (data.note) onUpdated(data.note);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Update failed";
      alert(msg);
    }
  }

  async function handleDelete() {
    if (!canManage) return;
    if (!window.confirm("Delete this note?")) return;
    try {
      await apiFetchJson(`${TEAM_NOTES_API_PATH}/${note.id}`, { method: "DELETE" });
      onDeleted(note.id);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Delete failed";
      alert(msg);
    }
  }

  return (
    <div
      className={[
        "rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-900/80",
        note.is_pinned ? "ring-2 ring-indigo-300/60 dark:ring-indigo-600/50" : "",
      ].join(" ")}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{note.author_name}</span>
        <select
          className="ml-auto max-w-[140px] rounded-lg border border-slate-200 bg-white py-0.5 pl-1.5 pr-6 text-[11px] dark:border-slate-600 dark:bg-slate-800"
          disabled={!canManage}
          aria-label="Move to column"
          value={note.board_column}
          onChange={(e) => {
            const v = e.target.value as BoardColumn;
            if (v !== note.board_column) void patch({ board_column: v });
          }}
        >
          {BOARD_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {COLUMN_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="mb-2 min-h-[72px] w-full resize-y rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
        disabled={!canManage}
        value={content}
        placeholder="Write a follow-up…"
        onChange={(e) => {
          const v = e.target.value;
          setContent(v);
          scheduleSave(v);
        }}
        onBlur={() => void flushSave(content)}
      />
      <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-700">
        <div className="flex gap-0.5">
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!canManage}
              aria-label={`Color ${c}`}
              className={[
                "h-5 w-5 rounded-full border-2",
                COLOR_DOT[c],
                note.color === c ? "ring-2 ring-indigo-500" : "opacity-80 hover:opacity-100",
              ].join(" ")}
              onClick={() => {
                if (canManage && c !== note.color) void patch({ color: c });
              }}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={!canManage}
          aria-label={note.is_pinned ? "Unpin" : "Pin"}
          className="ml-auto rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => void patch({ is_pinned: !note.is_pinned })}
        >
          <Pin className={`h-4 w-4 ${note.is_pinned ? "text-indigo-600" : ""}`} />
        </button>
        <button
          type="button"
          disabled={!canManage}
          aria-label="Delete"
          className="rounded p-1 text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-rose-950/40"
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {saving ? <span className="text-[10px] text-slate-400">Saving…</span> : null}
      </div>
    </div>
  );
}

export default function TeamNotesBoard({ canManage }: { canManage: boolean }) {
  const { data, error, mutate } = useSWR<NotesResponse>(TEAM_NOTES_API_PATH, dashboardFetcher, {
    revalidateOnFocus: true,
  });

  const notes = useMemo(() => data?.notes ?? [], [data?.notes]);

  const byColumn = useMemo(() => {
    const m: Record<BoardColumn, TeamNoteDto[]> = {
      follow_up: [],
      team_sync: [],
      done: [],
    };
    for (const n of notes) {
      const col = BOARD_COLUMNS.includes(n.board_column as BoardColumn) ? (n.board_column as BoardColumn) : "follow_up";
      m[col].push(n);
    }
    return m;
  }, [notes]);

  const handleUpdated = useCallback(
    (n: TeamNoteDto) => {
      void mutate(
        (prev) => {
          if (!prev) return prev;
          return { notes: prev.notes.map((x) => (x.id === n.id ? n : x)) };
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const handleDeleted = useCallback(
    (id: number) => {
      void mutate(
        (prev) => {
          if (!prev) return prev;
          return { notes: prev.notes.filter((x) => x.id !== id) };
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  async function addNote(column: BoardColumn) {
    if (!canManage) return;
    try {
      await apiFetchJson(TEAM_NOTES_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_column: column }),
      });
      await mutate();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not add note";
      alert(msg);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
        {(error as Error)?.message || "Could not load notes"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {BOARD_COLUMNS.map((col) => (
        <section
          key={col}
          className="flex min-h-[280px] flex-col rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40"
          aria-labelledby={`lane-${col}`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id={`lane-${col}`} className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {COLUMN_LABELS[col]}
            </h2>
            <button
              type="button"
              disabled={!canManage}
              onClick={() => void addNote(col)}
              className={UI.secondaryButton + " py-1.5 text-xs"}
            >
              Add note
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {byColumn[col].length === 0 ? (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500">No notes yet</p>
            ) : (
              byColumn[col].map((note) => (
                <TeamNoteCard
                  key={note.id}
                  note={note}
                  canManage={canManage}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
