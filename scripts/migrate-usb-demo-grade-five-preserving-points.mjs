import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readDemoGradeSnapshot, buildGradeFiveMigration, verifyGradeFiveMigration } from "./migrate-usb-demo-grade-five.mjs";

const guards = [
  ["questions", "protect_point_question_content_before_update"],
  ["comments", "protect_point_comment_content_before_update"],
  ["point_logs", "enforce_question_write_contract_before_write"],
  ["point_logs", "enforce_comment_write_contract_before_write"],
];
const md5 = (value) => createHash("md5").update(value).digest("hex");

export async function readPointPreservingSnapshot(db) {
  const snapshot = await readDemoGradeSnapshot(db);
  const ids = snapshot.users.map(({id})=>id);
  snapshot.pointLogs = await db.pointLog.findMany({where:{studentId:{in:ids}},orderBy:{id:"asc"},select:{
    id:true,studentId:true,gameId:true,points:true,status:true,sessionId:true,bonusType:true,
    relatedQuestionId:true,relatedCommentId:true,activityDedupeKey:true,createdAt:true,
  }});
  snapshot.awardClaims = (await db.activityAwardClaim.findMany({where:{studentId:{in:ids}},orderBy:{pointLogId:"asc"}}))
    .map((claim)=>({id:claim.pointLogId,...claim}));
  return snapshot;
}

export async function preparePointPreservingPlan(db, snapshot) {
  const plan = { ...buildGradeFiveMigration(snapshot), pointLogs: [], awardClaims: [] };
  const inputs = ["questions","comments"].flatMap((kind)=>plan[kind].map(({id,data})=>({kind,id,content:data.content})));
  const normalized = await db.$queryRaw`
    SELECT item->>'kind' AS kind, item->>'id' AS id,
      public.normalize_activity_content(item->>'content') AS content
    FROM jsonb_array_elements(${JSON.stringify(inputs)}::jsonb) AS item
  `;
  const normalizedById = new Map(normalized.map((row)=>[`${row.kind}:${row.id}`,row.content]));
  for(const kind of ["questions","comments"]) for(const change of plan[kind]) {
    const old = snapshot[kind].find(({id})=>id===change.id);
    const content=normalizedById.get(`${kind}:${change.id}`);
    if(!content) throw new Error("정규화된 시연 문장이 비어 있습니다.");
    change.data.normalizedContent=content;
    change.data.dedupeKey=old.authorId==="usb-demo-teacher"?null:md5(content);
  }
  for(const kind of ["questions","comments"]) {
    const keys=new Set();
    for(const change of plan[kind]) {
      const old=snapshot[kind].find(({id})=>id===change.id);
      const key=[kind==="questions"?old.sessionId:old.questionId,old.authorId,change.data.dedupeKey].join(":");
      if(change.data.dedupeKey&&keys.has(key)) throw new Error("같은 학생의 동일 대상 문장이 중복되어 전환을 중단했습니다.");
      keys.add(key);
    }
  }
  const questionById=new Map(plan.questions.map((change)=>[change.id,change]));
  const commentById=new Map(plan.comments.map((change)=>[change.id,change]));
  for(const log of snapshot.pointLogs) {
    let scopeId;
    let content;
    if(log.bonusType==="QUESTION_WRITE"&&questionById.has(log.relatedQuestionId)) {
      scopeId=snapshot.questions.find(({id})=>id===log.relatedQuestionId).sessionId;
      content=questionById.get(log.relatedQuestionId).data.normalizedContent;
    } else if(log.bonusType==="COMMENT_WRITE"&&commentById.has(log.relatedCommentId)) {
      scopeId=snapshot.comments.find(({id})=>id===log.relatedCommentId).questionId;
      content=commentById.get(log.relatedCommentId).data.normalizedContent;
    } else continue;
    const claim=snapshot.awardClaims.find((claim)=>claim.pointLogId===log.id);
    if(!scopeId||!claim||claim.studentId!==log.studentId||claim.bonusType!==log.bonusType||claim.scopeId!==scopeId||claim.activityDedupeKey!==log.activityDedupeKey) throw new Error("기존 포인트와 중복 지급 방지 기록이 일치하지 않습니다.");
    const activityDedupeKey=md5(`${scopeId}\x1f${content}`);
    plan.pointLogs.push({id:log.id,data:{activityDedupeKey}});
    plan.awardClaims.push({id:log.id,data:{activityDedupeKey}});
  }
  return plan;
}

async function readGuards(db) {
  return db.$queryRaw`
    SELECT t.tgname AS name, t.tgenabled::text AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname IN (
      'protect_point_question_content_before_update', 'protect_point_comment_content_before_update',
      'enforce_question_write_contract_before_write', 'enforce_comment_write_contract_before_write'
    ) ORDER BY t.tgname
  `;
}

async function writePlan(tx, plan) {
  const studentIds=plan.users.filter(({id})=>id!=="usb-demo-teacher").map(({id})=>id);
  const studentCount=await tx.$executeRaw`
    UPDATE public.users SET grade='5',updated_at=now()
    WHERE is_demo=true AND role='STUDENT' AND id IN (SELECT jsonb_array_elements_text(${JSON.stringify(studentIds)}::jsonb))
  `;
  if(studentCount!==studentIds.length) throw new Error("학생 학년 변경 범위가 일치하지 않습니다.");
  await tx.user.update({where:{id:"usb-demo-teacher"},data:{name:"김탐구"}});
  for(const [key,model] of [["teacherClasses","teacherClass"],["sessions","questionSession"],["designs","unitDesign"],["analyses","sessionAnalysis"],["notifications","appNotification"]]) {
    for(const change of plan[key]) await tx[model].update({where:{id:change.id},data:change.data});
  }
  const questions=plan.questions.map(({id,data})=>({id,...data}));
  const questionCount=await tx.$executeRaw`
    UPDATE public.questions q SET content=p.content,normalized_content=p."normalizedContent",
      context=p.context,closure=p.closure,cognitive=p.cognitive,inquiry_type=p."inquiryType",updated_at=now()
    FROM jsonb_to_recordset(${JSON.stringify(questions)}::jsonb)
      AS p(id text,content text,"normalizedContent" text,context text,closure text,cognitive text,"inquiryType" text)
    WHERE q.id=p.id AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=q.author_id AND u.is_demo=true)
  `;
  if(questionCount!==questions.length) throw new Error("질문 변경 범위가 일치하지 않습니다.");
  const comments=plan.comments.map(({id,data})=>({id,...data}));
  const commentCount=await tx.$executeRaw`
    UPDATE public.comments c SET content=p.content,normalized_content=p."normalizedContent"
    FROM jsonb_to_recordset(${JSON.stringify(comments)}::jsonb) AS p(id text,content text,"normalizedContent" text)
    WHERE c.id=p.id AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=c.author_id AND u.is_demo=true)
  `;
  if(commentCount!==comments.length) throw new Error("답변 변경 범위가 일치하지 않습니다.");
  const hashes=plan.pointLogs.map(({id,data})=>({id,key:data.activityDedupeKey}));
  const logCount=await tx.$executeRaw`
    UPDATE public.point_logs l SET activity_dedupe_key=p.key
    FROM jsonb_to_recordset(${JSON.stringify(hashes)}::jsonb) AS p(id text,key text)
    WHERE l.id=p.id AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=l.student_id AND u.is_demo=true)
  `;
  const claimCount=await tx.$executeRaw`
    UPDATE public.activity_award_claims a SET activity_dedupe_key=p.key
    FROM jsonb_to_recordset(${JSON.stringify(hashes)}::jsonb) AS p(id text,key text)
    WHERE a.point_log_id=p.id AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.student_id AND u.is_demo=true)
  `;
  if(logCount!==hashes.length||claimCount!==hashes.length) throw new Error("포인트 중복 방지 기록의 변경 범위가 일치하지 않습니다.");
}

class RehearsalRollback extends Error {}
export async function runPointPreservingMigration(db,{apply=false,backupPath}={}) {
  const before=await readPointPreservingSnapshot(db);
  const plan=await preparePointPreservingPlan(db,before);
  const guardState=await readGuards(db);
  if(guardState.length!==guards.length||guardState.some((guard)=>guard.enabled!=="O")) throw new Error("포인트 보호 규칙이 예상 상태가 아닙니다.");
  if(!backupPath) throw new Error("비공개 백업 경로가 필요합니다.");
  writeFileSync(backupPath,JSON.stringify({createdAt:new Date().toISOString(),before,plan,guardState},null,2),{flag:"wx",mode:0o600});
  const started=Date.now();
  try {
    await db.$transaction(async(tx)=>{
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
      // 일반 요청은 이 짧은 트랜잭션이 끝날 때까지 대기하며 보호 규칙이 해제된 상태를 보지 못한다.
      // 스키마·외래키·중복 검사·정규화 규칙은 바꾸지 않는다. 기존 보호 규칙 네 개를 커밋 전에 원상 복구한다.
      await tx.$executeRawUnsafe('LOCK TABLE public.questions, public.comments, public.point_logs, public.activity_award_claims IN ACCESS EXCLUSIVE MODE');
      if(JSON.stringify(await readPointPreservingSnapshot(tx))!==JSON.stringify(before)) throw new Error("원본 자료가 변경되어 전환을 중단했습니다.");
      for(const [table,name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" DISABLE TRIGGER "${name}"`);
      await writePlan(tx,plan);
      for(const [table,name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" ENABLE TRIGGER "${name}"`);
      verifyGradeFiveMigration(before,await readPointPreservingSnapshot(tx),plan);
      if(JSON.stringify(await readGuards(tx))!==JSON.stringify(guardState)) throw new Error("포인트 보호 규칙이 복원되지 않아 변경을 취소했습니다.");
      if(!apply) throw new RehearsalRollback();
    },{timeout:45000,isolationLevel:"Serializable"});
  } catch(error) {if(!(error instanceof RehearsalRollback)) throw error;}
  const after=await readPointPreservingSnapshot(db);
  if(apply) verifyGradeFiveMigration(before,after,plan);
  else if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error("검증 후 원본 복원에 실패했습니다.");
  if(JSON.stringify(await readGuards(db))!==JSON.stringify(guardState)) throw new Error("최종 포인트 보호 규칙을 확인해야 합니다.");
  return {mode:apply?"적용 완료":"전체 전환 후 원본 복원 검증 완료",elapsedMs:Date.now()-started,
    grade:apply?"5학년 1반":"기존 학년 유지",students:405,sessions:plan.sessions.length,designs:plan.designs.length,
    questions:plan.questions.length,comments:plan.comments.length,pointContracts:plan.pointLogs.length,
    pointsPreserved:true,relationsPreserved:true,protectionRulesRestored:true};
}

async function main(){
 nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("connection_limit","1");
 const db=new PrismaClient({datasources:{db:{url:url.href}}});
 try{console.log(JSON.stringify(await runPointPreservingMigration(db,{apply:process.argv.includes("--apply"),backupPath:process.argv.find((arg)=>arg.startsWith("--backup="))?.slice(9)}),null,2));}
 finally{await db.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch((error)=>{console.error(error.message.split("\n").filter(Boolean).at(-1));process.exitCode=1;});
