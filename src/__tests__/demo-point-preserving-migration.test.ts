import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({buildPlan:vi.fn()}));
vi.mock("../../scripts/migrate-usb-demo-grade-five.mjs",()=>({buildGradeFiveMigration:mocks.buildPlan,readDemoGradeSnapshot:vi.fn(),verifyGradeFiveMigration:vi.fn()}));
import { preparePointPreservingPlan } from "../../scripts/migrate-usb-demo-grade-five-preserving-points.mjs";
const md5=(value:string)=>createHash("md5").update(value).digest("hex");
const snapshot=()=>({
  questions:[{id:"question",authorId:"student",sessionId:"session"}],
  comments:[{id:"comment",authorId:"student",questionId:"question"}],
  pointLogs:[
    {id:"question-award",studentId:"student",bonusType:"QUESTION_WRITE",relatedQuestionId:"question",activityDedupeKey:"old-question",points:2},
    {id:"comment-award",studentId:"student",bonusType:"COMMENT_WRITE",relatedCommentId:"comment",activityDedupeKey:"old-comment",points:1},
    {id:"game-award",studentId:"student",bonusType:"GAME_FINISH",points:10},
  ],
  awardClaims:[
    {id:"question-award",pointLogId:"question-award",studentId:"student",bonusType:"QUESTION_WRITE",scopeId:"session",activityDedupeKey:"old-question"},
    {id:"comment-award",pointLogId:"comment-award",studentId:"student",bonusType:"COMMENT_WRITE",scopeId:"question",activityDedupeKey:"old-comment"},
  ],
});
const database=()=>({$queryRaw:vi.fn().mockResolvedValue([{kind:"questions",id:"question",content:"새질문"},{kind:"comments",id:"comment",content:"새답변"}])});
beforeEach(()=>{mocks.buildPlan.mockReset().mockImplementation(()=>({questions:[{id:"question",data:{content:"새 질문"}}],comments:[{id:"comment",data:{content:"새 답변"}}]}));});
describe("5학년 내용 전환의 포인트 계약 보존",()=>{
 it("같은 지급 기록과 대상에 새 정규화값을 연결하며 포인트를 수정하지 않는다",async()=>{
  const original=snapshot();const before=structuredClone(original);
  const plan=await preparePointPreservingPlan(database(),original);
  expect(plan.questions[0].data).toMatchObject({normalizedContent:"새질문",dedupeKey:md5("새질문")});
  expect(plan.pointLogs).toEqual([
    {id:"question-award",data:{activityDedupeKey:md5("session\x1f새질문")}},
    {id:"comment-award",data:{activityDedupeKey:md5("question\x1f새답변")}},
  ]);
  expect(plan.awardClaims).toEqual(plan.pointLogs);
  expect(original).toEqual(before);
  expect(plan.pointLogs.some((change:{id:string})=>change.id==="game-award")).toBe(false);
 });
 it("중복 지급 방지 기록과 기존 지급 기록이 다르면 거절한다",async()=>{
  const original=snapshot();original.awardClaims[0].activityDedupeKey="mismatch";
  await expect(preparePointPreservingPlan(database(),original)).rejects.toThrow("일치하지 않습니다");
 });
 it("서버 정규화 뒤 문장이 비어 있으면 거절한다",async()=>{
  const db=database();db.$queryRaw.mockResolvedValue([{kind:"questions",id:"question",content:""}]);
  await expect(preparePointPreservingPlan(db,snapshot())).rejects.toThrow("비어 있습니다");
 });
 it("같은 학생의 같은 수업 질문이 정규화 뒤 겹치면 데이터 변경 전에 거절한다",async()=>{
  mocks.buildPlan.mockReturnValue({questions:[{id:"question",data:{content:"새 질문"}},{id:"other-question",data:{content:"새질문!"}}],comments:[]});
  const original=snapshot();original.questions.push({id:"other-question",authorId:"student",sessionId:"session"});
  const db=database();db.$queryRaw.mockResolvedValue([{kind:"questions",id:"question",content:"새질문"},{kind:"questions",id:"other-question",content:"새질문"}]);
  await expect(preparePointPreservingPlan(db,original)).rejects.toThrow("중복");
 });
});
