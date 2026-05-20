"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[chat-route-error]", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      ts: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Chat is temporarily unavailable</h2>
        <p className="mt-2 text-sm text-slate-600">
          Please reload chat. If this keeps happening, share this diagnostic ID with support:
        </p>
        <p className="mt-1 font-mono text-xs text-slate-500">{error?.digest || Date.now()}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Reload chat
          </button>
          <Link href="/dashboard" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

