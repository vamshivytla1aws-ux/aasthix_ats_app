"use client";

import React from "react";
import type { Density } from "@/lib/useDensity";

export default function DensityToggle({
  density,
  onChange,
}: {
  density: Density;
  onChange: (next: Density) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
      {(["comfortable", "compact", "ultra"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={[
            "rounded-lg px-2.5 py-1 text-xs font-medium transition",
            density === mode ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-gray-50",
          ].join(" ")}
        >
          {mode[0].toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );
}

