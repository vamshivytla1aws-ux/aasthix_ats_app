"use client";

import React from "react";
import { SWRConfig } from "swr";
import { dashboardFetcher } from "@/lib/swrFetcher";

export default function DashboardSWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: dashboardFetcher,
        revalidateOnFocus: true,
        dedupingInterval: 3000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
