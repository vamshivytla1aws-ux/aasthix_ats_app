"use client";

import React, { useEffect, useState } from "react";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import TeamNotesBoard from "@/components/notes/TeamNotesBoard";
import { apiFetchJson } from "@/lib/apiClient";

export default function NotesPage() {
  const [canManage, setCanManage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const me = await apiFetchJson<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me");
        const role = (me.user?.role || "user").toLowerCase();
        const manageAllowed = role === "admin" || me.permissions?.["pipeline.manage"] !== false;
        if (!cancelled) setCanManage(manageAllowed);
      } catch {
        if (!cancelled) setCanManage(false);
      }
    }
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AccessGate permissionKey="pipeline.view">
      <ModulePageFrame
        title="Team notes"
        subtitle="Shared follow-ups for the recruiting team. Everyone with pipeline access can see all notes; add and edit requires pipeline.manage (or admin)."
        metrics={
          !canManage ? (
            <span className="text-amber-800 dark:text-amber-200">
              View-only — add or edit notes requires <code className="rounded bg-amber-100 px-1 text-[11px] dark:bg-amber-900/50">pipeline.manage</code>
            </span>
          ) : null
        }
      >
        <TeamNotesBoard canManage={canManage} />
      </ModulePageFrame>
    </AccessGate>
  );
}
