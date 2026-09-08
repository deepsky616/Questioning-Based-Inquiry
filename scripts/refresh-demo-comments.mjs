import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readDemoVarietySnapshot } from "./enrich-usb-demo-learning.mjs";
import { canonical, VARIETY_STUDENT_IDS } from "./demo-learning-variety.mjs";
import { GRADE_FIVE_LESSONS, gradeFiveComment } from "./demo-grade-five-content.mjs";
import { GRADE_FIVE_COMMENT_VARIANTS } from "./demo-grade-five-comments.mjs";

const md5 = text => createHash("md5").update(text).digest("hex");
const guards = [["comments", "protect_point_comment_content_before_update"], ["point_logs", "enforce_comment_write_contract_before_write"]];
export function buildDemoCommentRevisionPlan(before) {
  if (before.users.length !== VARIETY_STUDENT_IDS.length || before.users.some(user => !VARIETY_STUDENT_IDS.includes(user.id) || !user.isDemo || user.role !== "STUDENT" || user.school !== "질문초등학교" || user.grade !== "5" || user.className !== "1")) throw new Error("5학년 1반 시연 학생 범위가 일치하지 않습니다.");
  const byQuestion = new Map(before.questions.map(question => [question.id, question]));
  const bySession = new Map(before.sessions.map(session => [session.id, session]));
  const occurrences = new Map();
  const changes = [];
  for (const comment of [...before.comments].sort((a, b) => a.authorId.localeCompare(b.authorId) || a.id.localeCompare(b.id))) {
    if (!/^usb-demo-(comment-|variety-v1-comment-)/.test(comment.id) || !VARIETY_STUDENT_IDS.includes(comment.authorId)) continue;
    const question = byQuestion.get(comment.questionId);
    if (bySession.get(question?.sessionId)?.teacherId !== "usb-demo-teacher") continue;
    const entry = Object.entries(GRADE_FIVE_LESSONS).find(([, lesson]) => lesson.topic === question.context);
    const index = entry?.[1].questions.findIndex(item => question.content.includes(item.content));
    const variants = entry && GRADE_FIVE_COMMENT_VARIANTS[entry[0]]?.[index];
    if (!variants) continue;
    // 시연 계정에서 사용자가 직접 수정한 문장은 보존한다.
    if (![gradeFiveComment(question, 0), gradeFiveComment(question, 1), ...variants].includes(comment.content)) continue;
    const key = `${entry[0]}:${index}`;
    const next = occurrences.get(key) ?? 0;
    if (next >= variants.length) throw new Error("같은 질문에 배치할 서로 다른 댓글 문장이 부족합니다.");
    occurrences.set(key, next + 1);
    if (comment.content !== variants[next]) changes.push({ id: comment.id, authorId: comment.authorId, questionId: comment.questionId, content: variants[next] });
  }
  return changes;
}

async function snapshot(db) {
  const before = await readDemoVarietySnapshot(db);
  before.growth = await db.questionGrowth.findMany({ where: { question: { sessionId: { in: before.sessions.map(s => s.id) } } }, orderBy: { questionId: "asc" } });
  return before;
}
async function readGuards(db) {
  return db.$queryRaw`SELECT t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname IN ('protect_point_comment_content_before_update','enforce_comment_write_contract_before_write') ORDER BY t.tgname`;
}
async function prepare(db, before) {
  const changes = buildDemoCommentRevisionPlan(before);
  const normalized = await db.$queryRaw`SELECT item->>'id' AS id, public.normalize_activity_content(item->>'content') AS content FROM jsonb_array_elements(${JSON.stringify(changes)}::jsonb) AS item`;
  const normalizedById = new Map(normalized.map(item => [item.id, item.content]));
  const comments = changes.map(change => {
    const normalizedContent = normalizedById.get(change.id);
    if (!normalizedContent) throw new Error("정규화한 댓글이 비어 있습니다.");
    return { ...change, normalizedContent, dedupeKey: md5(normalizedContent) };
  });
  const byId = new Map(comments.map(comment => [comment.id, comment]));
  const keys = new Set();
  for (const old of before.comments) {
    const row = byId.get(old.id) ?? old;
    const key = `${row.authorId}:${row.questionId}:${row.normalizedContent}`;
    if (keys.has(key)) throw new Error("같은 학생의 동일 질문 댓글이 중복됩니다.");
    keys.add(key);
  }
  const hashes = [];
  for (const log of before.pointLogs) {
    const comment = byId.get(log.relatedCommentId);
    if (log.bonusType !== "COMMENT_WRITE" || !comment) continue;
    const claim = before.claims.find(item => item.pointLogId === log.id);
    if (!claim || claim.studentId !== comment.authorId || log.studentId !== comment.authorId || claim.bonusType !== "COMMENT_WRITE" || claim.scopeId !== comment.questionId || claim.activityDedupeKey !== log.activityDedupeKey) throw new Error("기존 댓글 포인트 연결이 일치하지 않습니다.");
    hashes.push({ id: log.id, activityDedupeKey: md5(`${comment.questionId}\x1f${comment.normalizedContent}`) });
  }
  return { comments, hashes };
}
export function verifyDemoCommentRevision(before, after, plan) {
  const comments = new Map(plan.comments.map(row => [row.id, row]));
  const hashes = new Map(plan.hashes.map(row => [row.id, row.activityDedupeKey]));
  for (const [kind, rows] of Object.entries(before)) {
    const expected = rows.map(row => {
      if (kind === "comments" && comments.has(row.id)) {
        const change = comments.get(row.id);
        return { ...row, content: change.content, normalizedContent: change.normalizedContent, dedupeKey: change.dedupeKey };
      }
      if ((kind === "pointLogs" || kind === "claims") && hashes.has(row.id)) return { ...row, activityDedupeKey: hashes.get(row.id) };
      return row;
    });
    if (canonical(expected) !== canonical(after[kind])) throw new Error(`${kind} 자료가 허용한 변경 범위와 다릅니다.`);
  }
}
class RehearsalRollback extends Error {}
export async function refreshDemoComments(db, { apply = false, rehearse = false, backupPath } = {}) {
  const before = await snapshot(db);
  const plan = await prepare(db, before);
  const guardState = await readGuards(db);
  if (guardState.length !== guards.length || guardState.some(guard => guard.enabled !== "O")) throw new Error("댓글 포인트 보호 규칙이 예상 상태가 아닙니다.");
  if ((apply || rehearse) && plan.comments.length) {
    if (!backupPath) throw new Error("비공개 백업 경로가 필요합니다.");
    writeFileSync(backupPath, JSON.stringify({ before, plan, guardState }), { flag: "wx", mode: 0o600 });
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
        await tx.$executeRawUnsafe("LOCK TABLE public.comments, public.point_logs, public.activity_award_claims IN ACCESS EXCLUSIVE MODE");
        if (canonical(await snapshot(tx)) !== canonical(before)) throw new Error("작업 중 자료가 변경되어 적용하지 않았습니다.");
        // 기존 포인트에 연결된 시연 문장과 중복 지급 방지 해시만 함께 바꾸고, 커밋 전에 규칙을 복원한다.
        for (const [table, name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" DISABLE TRIGGER "${name}"`);
        const count = await tx.$executeRaw`UPDATE public.comments c SET content=p.content,normalized_content=p."normalizedContent" FROM jsonb_to_recordset(${JSON.stringify(plan.comments)}::jsonb) AS p(id text,content text,"normalizedContent" text,"authorId" text,"questionId" text) WHERE c.id=p.id AND c.author_id=p."authorId" AND c.question_id=p."questionId" AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=c.author_id AND u.is_demo=true AND u.role='STUDENT')`;
        if (count !== plan.comments.length) throw new Error("댓글 변경 개수가 일치하지 않습니다.");
        const logCount = await tx.$executeRaw`UPDATE public.point_logs l SET activity_dedupe_key=p."activityDedupeKey" FROM jsonb_to_recordset(${JSON.stringify(plan.hashes)}::jsonb) AS p(id text,"activityDedupeKey" text) WHERE l.id=p.id AND l.bonus_type='COMMENT_WRITE'`;
        const claimCount = await tx.$executeRaw`UPDATE public.activity_award_claims c SET activity_dedupe_key=p."activityDedupeKey" FROM jsonb_to_recordset(${JSON.stringify(plan.hashes)}::jsonb) AS p(id text,"activityDedupeKey" text) WHERE c.point_log_id=p.id AND c.bonus_type='COMMENT_WRITE'`;
        if (logCount !== plan.hashes.length || claimCount !== plan.hashes.length) throw new Error("댓글 포인트 연결 변경 개수가 일치하지 않습니다.");
        for (const [table, name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" ENABLE TRIGGER "${name}"`);
        verifyDemoCommentRevision(before, await snapshot(tx), plan);
        if (canonical(await readGuards(tx)) !== canonical(guardState)) throw new Error("보호 규칙 복원에 실패했습니다.");
        if (!apply) throw new RehearsalRollback();
      }, { timeout: 45000, isolationLevel: "Serializable" });
    } catch (error) { if (!(error instanceof RehearsalRollback)) throw error; }
    const after = await snapshot(db);
    if (apply) verifyDemoCommentRevision(before, after, plan);
    else if (canonical(before) !== canonical(after)) throw new Error("검증 후 원본 복원에 실패했습니다.");
    if (canonical(await readGuards(db)) !== canonical(guardState)) throw new Error("최종 보호 규칙 복원에 실패했습니다.");
  }
  return { 상태: apply ? "적용 완료" : rehearse ? "적용 후 원본 복원 검증 완료" : "변경 전 미리보기", 댓글: plan.comments.length, 서로다른문장: new Set(plan.comments.map(row => row.content)).size, 포인트연결: plan.hashes.length, 기존포인트와성장기록보존: true };
}
async function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set("connection_limit", "1");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  try { console.log(JSON.stringify(await refreshDemoComments(db, { apply: process.argv.includes("--apply"), rehearse: process.argv.includes("--rehearse"), backupPath: process.argv.find(arg => arg.startsWith("--backup="))?.slice(9) }))); }
  finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message.split("\n").filter(Boolean).at(-1)); process.exitCode = 1; });
