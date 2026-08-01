import AccessGate from "@/components/AccessGate";
import AiInterviewList from "@/components/ai-interviews/AiInterviewList";

export default function AiInterviewsPage(){return <AccessGate permissionKey="ai_interviews.view"><AiInterviewList/></AccessGate>;}
