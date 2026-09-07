import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  STUDENT_NAMES, buildDemoRankingStudents, buildDemoLearningActivityPlans,
  buildDemoClassInquiryQuestions, DEMO_SESSION_BLUEPRINTS, DEMO_UNIT_DESIGN_BLUEPRINTS,
} from "./seed-usb-demo.mjs";
import { gradeFiveComment, gradeFiveAnalysis } from "./demo-grade-five-content.mjs";

const teacherId = "usb-demo-teacher";
const studentIds = STUDENT_NAMES.map((_, index) => `usb-demo-student-${String(index + 1).padStart(2, "0")}`);
const expectedStudents = [
  ...studentIds.map((id, index) => ({ id, school: "질문초등학교", className: "1", studentNumber: String(index + 1) })),
  ...buildDemoRankingStudents(),
];
const userIds = [teacherId, ...expectedStudents.map(({ id }) => id)];
const sessionIds = DEMO_SESSION_BLUEPRINTS.map(({ id }) => id);

export async function readDemoGradeSnapshot(db) {
  const [users, teacherClasses, sessions, designs, questions, comments, likes, analyses, notifications, pointLogs] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id:true, name:true, school:true, grade:true, className:true, studentNumber:true, role:true, isDemo:true, totalPoints:true }, orderBy: { id: "asc" } }),
    db.teacherClass.findMany({ where: { teacherId }, orderBy: { id: "asc" } }),
    db.questionSession.findMany({ where: { teacherId }, orderBy: { id: "asc" } }),
    db.unitDesign.findMany({ where: { teacherId }, orderBy: { id: "asc" } }),
    db.question.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: { id: "asc" } }),
    db.comment.findMany({ where: { question: { sessionId: { in: sessionIds } } }, orderBy: { id: "asc" } }),
    db.questionLike.findMany({ where: { question: { sessionId: { in: sessionIds } } }, orderBy: { id: "asc" } }),
    db.sessionAnalysis.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: { id: "asc" } }),
    db.appNotification.findMany({ where: { id: "usb-demo-notification-today", senderId: teacherId, recipientId: studentIds[0] }, orderBy: { id: "asc" } }),
    db.pointLog.findMany({ where: { studentId: { in: userIds } }, select: { id:true, studentId:true, points:true, sessionId:true, bonusType:true }, orderBy: { id: "asc" } }),
  ]);
  return { users, teacherClasses, sessions, designs, questions, comments, likes, analyses, notifications, pointLogs };
}

function requireSameIds(actual, expected, label) {
  const sorted = (values) => values.map(({ id }) => id).sort();
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected))) throw new Error(`${label} 목록이 예상과 달라 변경하지 않았습니다.`);
}

export function buildGradeFiveMigration(snapshot) {
  requireSameIds(snapshot.users, userIds.map((id) => ({id})), "시연 계정");
  const teacher = snapshot.users.find(({ id }) => id === teacherId);
  if (!teacher.isDemo || teacher.role !== "TEACHER" || teacher.school !== "질문초등학교") throw new Error("시연 교사 신원을 확인하지 못했습니다.");
  const byId = new Map(snapshot.users.map((user) => [user.id, user]));
  for (const profile of expectedStudents) {
    const user = byId.get(profile.id);
    if (!user.isDemo || user.role !== "STUDENT" || !["4", "5"].includes(user.grade) || ["school", "className", "studentNumber"].some((field) => user[field] !== profile[field])) throw new Error("시연 학생 신원을 확인하지 못했습니다.");
  }
  if (snapshot.teacherClasses.length !== 1 || snapshot.teacherClasses[0].teacherId !== teacherId || snapshot.teacherClasses[0].className !== "1" || !["4", "5"].includes(snapshot.teacherClasses[0].grade)) throw new Error("시연 담당 학급이 예상과 다릅니다.");
  requireSameIds(snapshot.sessions, DEMO_SESSION_BLUEPRINTS, "시연 수업");
  requireSameIds(snapshot.designs, DEMO_UNIT_DESIGN_BLUEPRINTS, "시연 탐구설계");
  const activity = buildDemoLearningActivityPlans(studentIds);
  const designById = new Map(DEMO_UNIT_DESIGN_BLUEPRINTS.map((design) => [design.id, design]));
  const questions = activity.questions.map((question) => ({...question}));
  const sessionUpdates = DEMO_SESSION_BLUEPRINTS.map((blueprint) => {
    const old = snapshot.sessions.find(({ id }) => id === blueprint.id);
    if (old.teacherId !== teacherId || old.unitDesignId !== blueprint.unitDesignId || old.targetType !== "CLASS" || old.targetClassName !== "1" || !["4", "5"].includes(old.targetGrade)) throw new Error("시연 수업 연결이 예상과 다릅니다.");
    const published = blueprint.studentExplore ? [] : buildDemoClassInquiryQuestions(designById.get(blueprint.unitDesignId), blueprint.id, activity.questions);
    if (old.sharedQuestions.length !== published.length) throw new Error("배포한 탐구질문 수가 달라 변경하지 않았습니다.");
    const sharedQuestions = published.map((question, index) => ({...question, publishedAt: old.sharedQuestions[index]?.publishedAt ?? old.createdAt.toISOString()}));
    for (const [index, question] of sharedQuestions.entries()) questions.push({
      id: `usb-demo-shared-question-${blueprint.key}-${String(index + 1).padStart(2,"0")}`,
      authorId: teacherId, sessionId: blueprint.id, content: question.content, context: blueprint.topic,
      closure: "open", cognitive: question.type, inquiryType: question.type,
    });
    return {id: old.id, data: {targetGrade: "5", topic: blueprint.topic, sharedQuestions}};
  });
  requireSameIds(snapshot.questions, questions, "시연 질문");
  requireSameIds(snapshot.comments, activity.comments, "시연 답변");
  requireSameIds(snapshot.analyses, activity.analyses, "시연 분석");
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const questionUpdates = snapshot.questions.map((old) => {
    const next = questionById.get(old.id);
    if (old.authorId !== next.authorId || old.sessionId !== next.sessionId) throw new Error("시연 질문의 작성자나 연결 수업이 예상과 다릅니다.");
    return {id: old.id, data: {content: next.content, normalizedContent: next.content, context: next.context, closure: next.closure, cognitive: next.cognitive, inquiryType: next.inquiryType}};
  });
  const commentUpdates = snapshot.comments.map((old, index) => {
    if (!studentIds.includes(old.authorId)) throw new Error("시연 답변의 작성자가 예상과 다릅니다.");
    const content = gradeFiveComment(questionById.get(old.questionId), index);
    return {id: old.id, data: {content, normalizedContent: content}};
  });
  return {
    users: snapshot.users.map((user) => ({id:user.id, data:user.id===teacherId ? {name:"김탐구"} : {grade:"5"}})),
    teacherClasses: [{id:snapshot.teacherClasses[0].id, data:{grade:"5"}}],
    sessions: sessionUpdates,
    designs: snapshot.designs.map((old) => {
      const next = designById.get(old.id);
      if (old.teacherId !== teacherId || !["4-1", "5-1"].includes(old.targetClassValue)) throw new Error("탐구설계의 담당 교사나 배포 학급이 예상과 다릅니다.");
      const {key: _key, id: _id, ...data} = next;
      return {id:old.id, data:{...data, curriculumAreaId:null, targetClassValue:"5-1"}};
    }),
    questions: questionUpdates,
    comments: commentUpdates,
    analyses: snapshot.analyses.map((old, index) => {
      if(old.studentId!==studentIds[0] || old.scope!=="student") throw new Error("시연 분석 대상이 예상과 다릅니다.");
      const session = DEMO_SESSION_BLUEPRINTS.find(({id})=>id===old.sessionId);
      const personalQuestions = snapshot.questions.filter((question)=>question.authorId===old.studentId && question.sessionId===old.sessionId);
      const primary = questionById.get(personalQuestions[0].id);
      const totalComments = snapshot.comments.filter((comment)=>comment.authorId===old.studentId && questionById.get(comment.questionId)?.sessionId===old.sessionId).length;
      const totalLikes = snapshot.likes.filter((like)=>like.userId===old.studentId && questionById.get(like.questionId)?.sessionId===old.sessionId).length;
      return {id:old.id, data:{locale:"ko", result:{...old.result, ...gradeFiveAnalysis(session.key,index,primary.content), totalQuestions:personalQuestions.length,totalComments,totalLikes}}};
    }),
    notifications: snapshot.notifications.map((old)=>({id:old.id,data:{title:"과학 질문수업을 살펴보세요",message:"5학년 열의 이동과 단열 수업에서 근거를 살펴보고 나만의 질문을 준비해 보세요."}})),
  };
}

export function verifyGradeFiveMigration(before, after, plan) {
  for (const key of Object.keys(before)) {
    requireSameIds(after[key],before[key],key);
    const byId = new Map(after[key].map((row)=>[row.id,row]));
    const updates = new Map((plan[key]??[]).map((row)=>[row.id,row.data]));
    for(const old of before[key]) {
      const current=byId.get(old.id);
      const expected={...old,...(updates.get(old.id)??{})};
      delete expected.updatedAt;
      const actual={...current};delete actual.updatedAt;
      if(JSON.stringify(expected)!==JSON.stringify(actual)) {
        // Prisma JSON objects may return keys in database order.
        const canonical=(value)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)&&!(item instanceof Date)?Object.fromEntries(Object.keys(item).sort().map((key)=>[key,item[key]])):item);
        if(canonical(expected)!==canonical(actual)) throw new Error(`${key}의 허용하지 않은 정보가 바뀌어 전체 변경을 취소했습니다.`);
      }
    }
  }
}

const models={users:"user",teacherClasses:"teacherClass",sessions:"questionSession",designs:"unitDesign",questions:"question",comments:"comment",analyses:"sessionAnalysis",notifications:"appNotification"};
async function main() {
  const apply=process.argv.includes("--apply");
  const backup=process.argv.find((arg)=>arg.startsWith("--backup="))?.slice(9);
  if(apply&&!backup) throw new Error("적용 시 기존 자료를 보관할 --backup=경로가 필요합니다.");
  nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=new PrismaClient();
  try {
    const before=await readDemoGradeSnapshot(db);
    const plan=buildGradeFiveMigration(before);
    if(apply) {
      writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),before,plan},null,2),{flag:"wx",mode:0o600});
      await db.$transaction(async(tx)=>{
        const fresh=await readDemoGradeSnapshot(tx);
        if(JSON.stringify(fresh)!==JSON.stringify(before)) throw new Error("자료가 변경되어 다시 확인해야 합니다.");
        for(const [key,changes] of Object.entries(plan)) for(const change of changes) await tx[models[key]].update({where:{id:change.id},data:change.data});
        verifyGradeFiveMigration(before,await readDemoGradeSnapshot(tx),plan);
      },{timeout:120000,isolationLevel:"Serializable"});
    }
    console.log(JSON.stringify({mode:apply?"적용 완료":"미리보기",grade:"5학년 1반",counts:Object.fromEntries(Object.entries(plan).map(([key,changes])=>[key,changes.length])),pointsAndRelationsPreserved:true},null,2));
  } finally {await db.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch((error)=>{
  console.error(error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) : "시연 변경 실패");process.exitCode=1;
});
