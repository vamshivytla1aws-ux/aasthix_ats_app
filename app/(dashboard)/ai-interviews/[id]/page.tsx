import AccessGate from "@/components/AccessGate";
import AiInterviewDetail from "@/components/ai-interviews/AiInterviewDetail";
export default async function AiInterviewDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AccessGate permissionKey="ai_interviews.view"><AiInterviewDetail id={Number(id)}/></AccessGate>;}
