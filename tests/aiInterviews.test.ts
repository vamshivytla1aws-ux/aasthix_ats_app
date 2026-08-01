import { describe,expect,it } from "vitest";
import { createSecureInterviewToken,hashInterviewToken } from "@/lib/aiInterviews/token";
import { canTransition,INTEGRITY_EVENT_TYPES } from "@/lib/aiInterviews/types";
import { generatedQuestionsSchema } from "@/lib/aiInterviews/schemas";

describe("AI interview security and lifecycle",()=>{
 it("creates unguessable tokens and stable hashes",()=>{const first=createSecureInterviewToken();const second=createSecureInterviewToken();expect(first).not.toBe(second);expect(first.length).toBeGreaterThanOrEqual(40);expect(hashInterviewToken(first)).toHaveLength(64);expect(hashInterviewToken(first)).toBe(hashInterviewToken(first));});
 it("allows only configured status transitions",()=>{expect(canTransition("DRAFT","READY")).toBe(true);expect(canTransition("READY","IN_PROGRESS")).toBe(true);expect(canTransition("COMPLETED","IN_PROGRESS")).toBe(false);expect(canTransition("CANCELLED","READY")).toBe(false);});
 it("accepts supported integrity and snapshot events only",()=>{expect(INTEGRITY_EVENT_TYPES.has("TAB_HIDDEN")).toBe(true);expect(INTEGRITY_EVENT_TYPES.has("SNAPSHOT_CAPTURED")).toBe(true);expect(INTEGRITY_EVENT_TYPES.has("SNAPSHOT_FAILED")).toBe(true);expect(INTEGRITY_EVENT_TYPES.has("BACKGROUND_APP_DETECTED")).toBe(false);});
 it("accepts the server-recorded system check event",()=>{expect(INTEGRITY_EVENT_TYPES.has("SYSTEM_CHECK_PASSED")).toBe(true);});
 it("validates structured generated questions",()=>{const value=generatedQuestionsSchema.parse({questions:[{question:"Explain a production incident you resolved.",skill:"Operations",difficulty:"INTERMEDIATE",expectedPoints:["Root cause","Resolution"],scoringRubric:[{criterion:"Technical accuracy",weight:100}],maxScore:10}]});expect(value.questions).toHaveLength(1);expect(()=>generatedQuestionsSchema.parse({questions:[{question:"x",skill:"",difficulty:"HARD",expectedPoints:[],scoringRubric:[],maxScore:0}]})).toThrow();});
});
