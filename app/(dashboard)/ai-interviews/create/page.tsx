import { Suspense } from "react";
import AccessGate from "@/components/AccessGate";
import AiInterviewCreate from "@/components/ai-interviews/AiInterviewCreate";

export default function CreateAiInterviewPage() {
  return (
    <AccessGate permissionKey="ai_interviews.create">
      <Suspense fallback={<div className="p-6 text-slate-500">Loading AI interview creator...</div>}>
        <AiInterviewCreate />
      </Suspense>
    </AccessGate>
  );
}
