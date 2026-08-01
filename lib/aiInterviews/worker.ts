import "dotenv/config";
import { Worker } from "bullmq";
import { getBullConnection } from "@/lib/queue/connection";
import { AI_INTERVIEW_QUEUE_NAME } from "@/lib/aiInterviews/queue";
import { processAiInterview } from "@/lib/aiInterviews/processor";

const connection=getBullConnection();
if(!connection){ console.error("[ai-interview-worker] REDIS_URL is unavailable"); process.exit(1); }
const worker=new Worker(AI_INTERVIEW_QUEUE_NAME,async(job)=>processAiInterview(Number(job.data.interviewId)),{connection,concurrency:2});
worker.on("completed",job=>console.log(JSON.stringify({scope:"ai-interview-worker",event:"completed",jobId:job.id})));
worker.on("failed",(job,error)=>console.error(JSON.stringify({scope:"ai-interview-worker",event:"failed",jobId:job?.id,error:error.message})));
console.log(JSON.stringify({scope:"ai-interview-worker",event:"listening",queue:AI_INTERVIEW_QUEUE_NAME}));
