"use client";

import { useEffect, useState } from "react";

export type Density = "comfortable" | "compact" | "ultra";

export function useDensity(storageKey: string, initial: Density = "compact") {
  const [density, setDensity] = useState<Density>(initial);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "comfortable" || saved === "compact" || saved === "ultra") {
        setDensity(saved);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  function updateDensity(next: Density) {
    setDensity(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
  }

  return { density, setDensity: updateDensity };
}

