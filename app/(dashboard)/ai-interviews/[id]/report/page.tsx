import AccessGate from "@/components/AccessGate";
import AiInterviewReport from "@/components/ai-interviews/AiInterviewReport";
export default async function AiInterviewReportPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AccessGate permissionKey="ai_interviews.review"><AiInterviewReport id={Number(id)}/></AccessGate>;}
