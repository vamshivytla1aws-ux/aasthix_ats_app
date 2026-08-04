"use client";

import React from "react";
import AccessGate from "@/components/AccessGate";
import SelfServiceSalaryView from "@/components/hrms/SelfServiceSalaryView";

export default function SalaryPage() {
  return (
    <AccessGate permissionKey="dashboard.view">
      <SelfServiceSalaryView />
    </AccessGate>
  );
}
