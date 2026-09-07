import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
import {PrismaClient} from '@prisma/client';
import {VARIETY_STUDENT_IDS,buildDemoVarietyPlan,canonical} from './demo-learning-variety.mjs';

export async function readDemoVarietySnapshot(db){
  const ids=VARIETY_STUDENT_IDS;
  const sessions=await db.questionSession.findMany({where:{teacherId:'usb-demo-teacher'},orderBy:{id:'asc'}});
  const sessionIds=sessions.map(s=>s.id);
  const [users,runs,activities,pointLogs,practices,questions,comments,likes,analyses,claims]=await Promise.all([
    db.user.findMany({where:{id:{in:ids}},select:{id:true,name:true,school:true,grade:true,className:true,role:true,isDemo:true,totalPoints:true},orderBy:{id:'asc'}}),
    db.gameRun.findMany({where:{ownerId:{in:ids}},orderBy:{id:'asc'}}),
    db.gameActivity.findMany({where:{actorId:{in:ids}},orderBy:{id:'asc'}}),
    db.pointLog.findMany({where:{studentId:{in:ids}},orderBy:{id:'asc'}}),
    db.practiceAttempt.findMany({where:{studentId:{in:ids}},orderBy:{id:'asc'}}),
    db.question.findMany({where:{sessionId:{in:sessionIds}},orderBy:{id:'asc'}}),
    db.comment.findMany({where:{question:{sessionId:{in:sessionIds}}},orderBy:{id:'asc'}}),
    db.questionLike.findMany({where:{question:{sessionId:{in:sessionIds}}},orderBy:{id:'asc'}}),
    db.sessionAnalysis.findMany({where:{sessionId:{in:sessionIds}},orderBy:{id:'asc'}}),
    db.activityAwardClaim.findMany({where:{studentId:{in:ids}},orderBy:{pointLogId:'asc'}}),
  ]);
  return {users,sessions,runs,activities,pointLogs,practices,questions,comments,likes,analyses,claims:claims.map(c=>({id:c.pointLogId,...c}))};
}

export async function prepareDemoVarietyPlan(db,before,anchor){
  const plan=buildDemoVarietyPlan(before,anchor);
  const inputs=['questions','comments'].flatMap(kind=>plan.creates[kind].map(row=>({kind,id:row.id,content:row.content})));
  const normalized=await db.$queryRaw`SELECT item->>'id' AS id,public.normalize_activity_content(item->>'content') AS content FROM jsonb_array_elements(${JSON.stringify(inputs)}::jsonb) AS item`;
  const byId=new Map(normalized.map(row=>[row.id,row.content]));
  for(const kind of ['questions','comments']){
    const existing=new Set(before[kind].map(row=>`${row.authorId}:${row.sessionId??row.questionId}:${row.normalizedContent}`));
    for(const row of plan.creates[kind]){
      row.normalizedContent=byId.get(row.id);
      if(!row.normalizedContent)throw new Error('정규화한 학습 내용이 비어 있습니다.');
      row.dedupeKey=createHash('md5').update(row.normalizedContent).digest('hex');
      const key=`${row.authorId}:${row.sessionId??row.questionId}:${row.normalizedContent}`;
      if(existing.has(key))throw new Error('같은 학생의 학습 내용이 중복됩니다.');
      existing.add(key);
    }
  }
  return plan;
}

export function verifyDemoVariety(before,after,plan){
  for(const [kind,oldRows] of Object.entries(before)){
    const creates=plan.creates[kind]??[];const updates=new Map((plan.updates[kind]??[]).map(change=>[change.id,change.data]));
    if(after[kind].length!==oldRows.length+creates.length)throw new Error(`${kind} 기록 수가 예상과 다릅니다.`);
    const byId=new Map(after[kind].map(row=>[row.id,row]));
    for(const old of oldRows){
      const expected={...old,...updates.get(old.id)};const actual={...byId.get(old.id)};
      delete expected.updatedAt;delete actual.updatedAt;
      if(canonical(expected)!==canonical(actual))throw new Error(`${kind}의 기존 기록이 허용 범위 밖에서 변경됐습니다.`);
    }
    for(const created of creates){
      const actual=byId.get(created.id);
      if(!actual||Object.entries(created).some(([key,value])=>canonical(actual[key])!==canonical(value)))throw new Error(`${kind}의 추가 기록이 계획과 다릅니다.`);
    }
  }
  for(const user of after.users){
    const sum=after.pointLogs.filter(l=>l.studentId===user.id&&l.status==='APPROVED').reduce((n,l)=>n+l.points,0);
    if(sum!==user.totalPoints)throw new Error('학생 포인트가 실제 지급 합계와 일치하지 않습니다.');
  }
}
const models={runs:'gameRun',activities:'gameActivity',pointLogs:'pointLog',practices:'practiceAttempt',questions:'question',comments:'comment',likes:'questionLike',users:'user',analyses:'sessionAnalysis'};
class RehearsalRollback extends Error {}
export async function enrichDemoLearning(db,{apply=false,rehearse=false,backupPath,anchor=new Date()}={}){
  const before=await readDemoVarietySnapshot(db);
  const plan=await prepareDemoVarietyPlan(db,before,anchor);
  if(apply||rehearse){
    if(!backupPath)throw new Error('자료 적용과 검증에는 비공개 백업 경로가 필요합니다.');
    writeFileSync(backupPath,JSON.stringify({createdAt:new Date(),anchor,before,plan},null,2),{flag:'wx',mode:0o600});
    try{
      await db.$transaction(async tx=>{
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$queryRaw`SELECT id FROM public.users WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(VARIETY_STUDENT_IDS)}::jsonb)) ORDER BY id FOR UPDATE`;
        if(canonical(await readDemoVarietySnapshot(tx))!==canonical(before))throw new Error('작업 중 자료가 변경되어 적용하지 않았습니다.');
        for(const kind of ['runs','activities','practices','questions','comments','likes','pointLogs']){
          if(!plan.creates[kind].length)continue;
          const result=await tx[models[kind]].createMany({data:plan.creates[kind]});
          if(result.count!==plan.creates[kind].length)throw new Error('추가 기록 수가 일치하지 않습니다.');
        }
        for(const kind of ['users','analyses'])for(const change of plan.updates[kind])await tx[models[kind]].update({where:{id:change.id},data:change.data});
        verifyDemoVariety(before,await readDemoVarietySnapshot(tx),plan);
        if(!apply)throw new RehearsalRollback();
      },{timeout:45000,isolationLevel:'Serializable'});
    }catch(error){if(!(error instanceof RehearsalRollback))throw error;}
    const after=await readDemoVarietySnapshot(db);
    if(apply)verifyDemoVariety(before,after,plan);
    else if(canonical(before)!==canonical(after))throw new Error('검증 후 원본 복원에 실패했습니다.');
  }
  return {mode:apply?'적용 완료':rehearse?'전체 적용 후 원본 복원 검증 완료':'미리보기',added:Object.fromEntries(Object.entries(plan.creates).map(([kind,rows])=>[kind,rows.length])),studentPoints:plan.updates.users.map((row,i)=>({name:before.users[i].name,before:before.users[i].totalPoints,after:row.data.totalPoints})),originalRecordsPreserved:true};
}
async function main(){
 nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');
 const db=new PrismaClient({datasources:{db:{url:url.href}}});
 try{console.log(JSON.stringify(await enrichDemoLearning(db,{apply:process.argv.includes('--apply'),rehearse:process.argv.includes('--rehearse'),backupPath:process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9)}),null,2));}finally{await db.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message.split('\n').filter(Boolean).at(-1));process.exitCode=1;});
