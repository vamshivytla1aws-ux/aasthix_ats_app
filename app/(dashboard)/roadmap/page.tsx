"use client";

import React from "react";
import AccessGate from "@/components/AccessGate";
import ProductRoadmapBoard from "@/components/ProductRoadmapBoard";
import DensityToggle from "@/components/ui/DensityToggle";
import { useDensity } from "@/lib/useDensity";

export default function ProductRoadmapPage() {
  const { density, setDensity } = useDensity("ats:roadmap-density", "compact");

  return (
    <AccessGate permissionKey="pipeline.view">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700/90">Product</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Enterprise roadmap</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Initiative backlog aligned with your hiring workflow columns. Prioritize what to build next — mirrors the Pipeline board stages so
              planning feels familiar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DensityToggle density={density} onChange={setDensity} />
          </div>
        </div>

        <ProductRoadmapBoard density={density} />
      </div>
    </AccessGate>
  );
}
