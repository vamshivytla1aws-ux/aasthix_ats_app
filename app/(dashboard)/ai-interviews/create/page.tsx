import AccessGate from "@/components/AccessGate";
import AiInterviewCreate from "@/components/ai-interviews/AiInterviewCreate";
export default function CreateAiInterviewPage(){return <AccessGate permissionKey="ai_interviews.create"><AiInterviewCreate/></AccessGate>;}
