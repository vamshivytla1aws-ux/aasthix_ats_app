import CandidateAiInterviewRoom from "@/components/ai-interviews/CandidateAiInterviewRoom";
export default async function PublicAiInterviewPage({params}:{params:Promise<{secureToken:string}>}){const {secureToken}=await params;return <CandidateAiInterviewRoom secureToken={secureToken}/>;}
