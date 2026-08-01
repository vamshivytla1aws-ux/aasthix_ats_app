import { Queue } from "bullmq";
import { getBullConnection } from "@/lib/queue/connection";

export const AI_INTERVIEW_QUEUE_NAME="ai-interview-processing";
let queue:Queue|null=null;

export function getAiInterviewQueue(){
  const connection=getBullConnection();
  if(!connection) return null;
  if(!queue) queue=new Queue(AI_INTERVIEW_QUEUE_NAME,{connection,defaultJobOptions:{attempts:3,backoff:{type:"exponential",delay:3000},removeOnComplete:{count:200},removeOnFail:{count:200}}});
  return queue;
}

export async function enqueueAiInterview(interviewId:number){
  const target=getAiInterviewQueue();
  if(!target) return false;
  await target.add("process",{interviewId},{jobId:`ai-interview-${interviewId}`});
  return true;
}
