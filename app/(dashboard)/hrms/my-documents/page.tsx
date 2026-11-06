"use client";

import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type Document = { id: number; file_name: string; category: string; uploaded_at: string; user_id: number };
export default function MyDocumentsPage() {
  const { data: me } = useSWR<{ user: { id: number }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const { data, error } = useSWR<{ documents: Document[] }>(me?.permissions["documents.view_self"] ? `/api/hrms/documents?employeeId=${me.user.id}` : null, dashboardFetcher);
  return <AccessGate permissionKey="documents.view_self"><ModulePageFrame title="My Documents" subtitle="View and download the documents HR has added to your record.">
    <div className="space-y-3">
      {error ? <p role="alert">Unable to load your documents. Please try again.</p> : !data ? <p>Loading documents…</p> : data.documents.filter(doc => doc.user_id === me?.user.id).map(doc => <div key={doc.id} className={UI.card + " p-4 flex flex-wrap items-center justify-between gap-3"}>
        <div><h2 className="font-semibold">{doc.file_name}</h2><p className="text-sm capitalize text-[var(--ats-text-muted)]">{doc.category.replaceAll("_", " ")}</p></div>
        <a className={UI.secondaryButton} href={`/api/hrms/documents/${doc.id}`}>Download</a>
      </div>)}
      {data && !data.documents.some(doc => doc.user_id === me?.user.id) && <p className={UI.card + " p-5"}>No documents added yet. Contact HR if a document is missing.</p>}
    </div>
  </ModulePageFrame></AccessGate>;
}
