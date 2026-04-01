"use client";

import React, { useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";

type NoteItem = {
  id: number;
  candidate_id: number;
  note: string;
  created_at: string;
};
type Density = "comfortable" | "compact" | "ultra";

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export default function NotesSection({
  candidateId,
  initialNotes,
  density = "ultra",
}: {
  candidateId: number;
  initialNotes: NoteItem[];
  density?: Density;
}) {
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote() {
    const note = text.trim();
    if (!note) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetchJson<NoteItem>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, note }),
      });
      setNotes((prev) => [created, ...prev]);
      setText("");
    } catch (err: any) {
      setError(err.message || "Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  const rootPad = density === "comfortable" ? "py-3" : density === "compact" ? "py-2" : "py-1";
  const titleClass = density === "ultra" ? "text-[10px]" : "text-xs";
  const inputMinHeight = density === "comfortable" ? "min-h-[88px]" : density === "compact" ? "min-h-[74px]" : "min-h-[64px]";
  const inputText = density === "comfortable" ? "text-sm" : "text-xs";
  const buttonText = density === "ultra" ? "text-[10px]" : "text-xs";
  const buttonPad = density === "comfortable" ? "px-3 py-1.5" : density === "compact" ? "px-2.5 py-1" : "px-2 py-0.5";
  const noteText = density === "comfortable" ? "text-sm" : "text-xs";
  const noteMeta = density === "ultra" ? "text-[10px]" : "text-xs";

  return (
    <div className={["border-b border-gray-200", rootPad].join(" ")}>
      <div className={["mb-0.5 font-medium text-gray-700", titleClass].join(" ")}>Notes</div>

      <div className="space-y-0.5">
        <textarea
          className={["w-full rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500", inputMinHeight, inputText].join(" ")}
          placeholder="Add note..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />
        <div className="flex items-center justify-between gap-3">
          {error ? <div className="text-xs text-red-600">{error}</div> : <span />}
          <button
            type="button"
            onClick={addNote}
            disabled={saving || text.trim().length === 0}
            className={["rounded bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-50", buttonPad, buttonText].join(" ")}
          >
            {saving ? "Saving..." : "Add Note"}
          </button>
        </div>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {notes.length === 0 ? (
          <div className="py-0.5 text-xs text-gray-500">
            No notes yet.
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className={["border-b border-gray-100 pb-1 text-gray-700 hover:bg-gray-50 transition", noteText].join(" ")}>
              <div className="whitespace-pre-wrap">{n.note}</div>
              <div className={["mt-0.5 text-gray-500", noteMeta].join(" ")}>{formatDateTime(n.created_at)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

