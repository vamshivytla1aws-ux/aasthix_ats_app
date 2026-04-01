"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { Density } from "@/lib/useDensity";
import {
  PRODUCT_ROADMAP_ITEMS,
  PRODUCT_ROADMAP_STAGES,
  PRODUCT_ROADMAP_STAGE_HINTS,
  type ProductRoadmapItem,
  type ProductRoadmapStage,
  epicStyle,
} from "@/lib/productRoadmapSeed";

const STORAGE_KEY = "ats_product_roadmap_v1";

/** Keep in sync with PipelineBoard.tsx stageStyles */
const stageStyles: Record<
  ProductRoadmapStage,
  { headerBg: string; badgeBg: string; badgeText: string }
> = {
  Applied: {
    headerBg: "bg-slate-100",
    badgeBg: "bg-slate-200/70",
    badgeText: "text-slate-900",
  },
  Screening: {
    headerBg: "bg-amber-100",
    badgeBg: "bg-amber-200/70",
    badgeText: "text-amber-900",
  },
  Interview: {
    headerBg: "bg-blue-100",
    badgeBg: "bg-blue-200/70",
    badgeText: "text-blue-900",
  },
  Selected: {
    headerBg: "bg-emerald-100",
    badgeBg: "bg-emerald-200/70",
    badgeText: "text-emerald-900",
  },
  Rejected: {
    headerBg: "bg-rose-100",
    badgeBg: "bg-rose-200/70",
    badgeText: "text-rose-900",
  },
};

function isStage(value: string): value is ProductRoadmapStage {
  return (PRODUCT_ROADMAP_STAGES as readonly string[]).includes(value);
}

type HydratedItem = ProductRoadmapItem & { stage: ProductRoadmapStage };

function loadStageOverrides(): Record<string, ProductRoadmapStage> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { stages?: Record<string, string> };
    const stages = parsed?.stages;
    if (!stages || typeof stages !== "object") return {};
    const out: Record<string, ProductRoadmapStage> = {};
    for (const [id, s] of Object.entries(stages)) {
      if (typeof s === "string" && isStage(s)) out[id] = s;
    }
    return out;
  } catch {
    return {};
  }
}

function saveStageOverrides(map: Record<string, ProductRoadmapStage>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stages: map }));
  } catch {
    // ignore quota / private mode
  }
}

function hydrateItems(overrides: Record<string, ProductRoadmapStage>): HydratedItem[] {
  return PRODUCT_ROADMAP_ITEMS.map((item) => ({
    ...item,
    stage: overrides[item.id] ?? item.defaultStage,
  }));
}

export default function ProductRoadmapBoard({ density = "compact" }: { density?: Density }) {
  const [items, setItems] = useState<HydratedItem[]>(() =>
    hydrateItems(typeof window !== "undefined" ? loadStageOverrides() : {})
  );

  useEffect(() => {
    setItems(hydrateItems(loadStageOverrides()));
  }, []);

  const boardMinWidth = density === "comfortable" ? "min-w-[1200px]" : density === "compact" ? "min-w-[1100px]" : "min-w-[980px]";
  const columnPad = density === "comfortable" ? "p-4" : density === "compact" ? "p-3" : "p-2.5";
  const cardPad = density === "comfortable" ? "p-3.5" : density === "compact" ? "p-3" : "p-2.5";
  const columnGap = density === "comfortable" ? "gap-4" : density === "compact" ? "gap-3" : "gap-2.5";
  const cardGap = density === "comfortable" ? "space-y-3" : density === "compact" ? "space-y-2.5" : "space-y-2";
  const cardTitleClass =
    density === "ultra" ? "text-xs font-semibold text-slate-900" : "text-sm font-semibold text-slate-900";
  const cardSubClass = density === "ultra" ? "text-[11px] text-slate-600 leading-snug" : "text-xs text-slate-600 leading-snug";

  const grouped = useMemo(() => {
    const map: Record<ProductRoadmapStage, HydratedItem[]> = {
      Applied: [],
      Screening: [],
      Interview: [],
      Selected: [],
      Rejected: [],
    };
    for (const row of items) {
      map[row.stage].push(row);
    }
    return map;
  }, [items]);

  const persistStages = useCallback((next: HydratedItem[]) => {
    const stages: Record<string, ProductRoadmapStage> = {};
    for (const x of next) stages[x.id] = x.stage;
    saveStageOverrides(stages);
  }, []);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      const fromStage = source.droppableId;
      const toStage = destination.droppableId;
      if (!isStage(fromStage) || !isStage(toStage)) return;

      setItems((prev) => {
        const buckets: Record<ProductRoadmapStage, HydratedItem[]> = {
          Applied: [],
          Screening: [],
          Interview: [],
          Selected: [],
          Rejected: [],
        };
        for (const it of prev) {
          buckets[it.stage].push(it);
        }

        const fromArr = buckets[fromStage];
        if (fromArr[source.index]?.id !== draggableId) return prev;

        const [moved] = fromArr.splice(source.index, 1);
        if (!moved) return prev;

        const updated: HydratedItem = { ...moved, stage: toStage };
        buckets[toStage].splice(destination.index, 0, updated);

        const next: HydratedItem[] = [];
        for (const s of PRODUCT_ROADMAP_STAGES) {
          next.push(...buckets[s]);
        }

        persistStages(next);
        return next;
      });
    },
    [persistStages]
  );

  function resetToDefaults() {
    if (!confirm("Reset all initiative cards to their default columns? This only affects this browser.")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setItems(hydrateItems({}));
  }

  return (
    <div className="space-y-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className={["grid grid-cols-1 md:grid-cols-3 items-stretch", boardMinWidth, columnGap].join(" ")}>
            {PRODUCT_ROADMAP_STAGES.map((stage) => (
              <div
                key={stage}
                className={[
                  "rounded-2xl border border-slate-200 bg-white h-full flex flex-col",
                  columnPad,
                  stage === "Applied"
                    ? "md:col-start-1 md:row-start-1"
                    : stage === "Screening"
                      ? "md:col-start-2 md:row-start-1"
                      : stage === "Interview"
                        ? "md:col-start-3 md:row-start-1"
                        : stage === "Selected"
                          ? "md:col-start-1 md:row-start-2"
                          : "md:col-start-2 md:row-start-2",
                ].join(" ")}
              >
                <div className={["sticky top-0 z-10 rounded-xl p-3", stageStyles[stage].headerBg].join(" ")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{stage}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-slate-600/90">
                        {PRODUCT_ROADMAP_STAGE_HINTS[stage]}
                      </div>
                    </div>
                    <div
                      className={[
                        "text-xs font-semibold px-2 py-1 rounded-full shrink-0",
                        stageStyles[stage].badgeBg,
                        stageStyles[stage].badgeText,
                      ].join(" ")}
                    >
                      {grouped[stage].length}
                    </div>
                  </div>
                </div>

                <Droppable droppableId={stage} ignoreContainerClipping>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={[
                        "mt-3 min-h-[180px] max-h-[58vh] flex-1 overflow-y-auto overscroll-y-contain pr-1 touch-pan-y",
                        cardGap,
                      ].join(" ")}
                    >
                      {grouped[stage].map((row, index) => {
                        const es = epicStyle(row.epic);
                        return (
                          <Draggable draggableId={row.id} index={index} key={row.id}>
                            {(draggableProvided, draggableSnapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                className={[
                                  "bg-white shadow-sm rounded-xl border transition-all duration-200 hover:shadow-md",
                                  es.border,
                                  cardPad,
                                  draggableSnapshot.isDragging ? "ring-2 ring-blue-500 shadow-lg" : "",
                                ].join(" ")}
                                style={draggableProvided.draggableProps.style}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span
                                      {...draggableProvided.dragHandleProps}
                                      className="mt-0.5 select-none cursor-grab text-slate-400 hover:text-slate-700"
                                      aria-label={`Drag ${row.title}`}
                                    >
                                      ⋮⋮
                                    </span>
                                    <div className="min-w-0">
                                      <div className={cardTitleClass}>{row.title}</div>
                                      <div className={`mt-1 ${cardSubClass}`}>{row.description}</div>
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                  <span
                                    className={["text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md", es.badgeBg, es.badgeText].join(
                                      " "
                                    )}
                                  >
                                    {row.epic}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="max-w-2xl">
          <span className="font-semibold text-slate-800">Same workflow as Pipeline:</span> drag cards across{" "}
          <span className="font-medium text-slate-700">Applied → Screening → Interview → Selected</span>; use{" "}
          <span className="font-medium text-rose-800">Rejected</span> for parked initiatives. Positions are saved in this browser only — no database
          changes.
        </p>
        <button
          type="button"
          onClick={resetToDefaults}
          className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
        >
          Reset columns
        </button>
      </div>
    </div>
  );
}
