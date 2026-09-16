import { DEMO_QUESTION_VARIANTS, demoTextKey, takeDemoQuestion, takeDemoComment } from './demo-question-variety.mjs';
import { buildDemoModerationQuestions, DEMO_MODERATION_PREFIX } from './demo-moderation-content.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { readFeatureSnapshot } from './enrich-demo-feature-learning.mjs';
import { canonical, VARIETY_STUDENT_IDS } from './demo-learning-variety.mjs';
import { GRADE_FIVE_LESSONS, buildGradeFiveDesign } from './demo-grade-five-content.mjs';

export const SCIENCE_SESSION_IDS = ['usb-demo-session-past-math', 'usb-demo-session-explore-math', 'usb-demo-feature-v1-session-average'];
const teacherId = 'usb-demo-teacher';
const replacements = JSON.parse(readFileSync(new URL('./demo-science-replacements.json', import.meta.url), 'utf8'));
const replacementMap = new Map(replacements);
const pattern = new RegExp(replacements.map(([text]) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
const mathText = /수학|평균|평행사변형|삼각형|사다리꼴|제곱센티미터|밑변|다각형|독서량|권수/;
const md5 = text => createHash('md5').update(text).digest('hex');
const guards = [
  ['questions', 'protect_point_question_content_before_update'],
  ['comments', 'protect_point_comment_content_before_update'],
  ['point_logs', 'enforce_question_write_contract_before_write'],
  ['point_logs', 'enforce_comment_write_contract_before_write'],
];
export function scienceValue(value) {
  if (typeof value === 'string') return value.replace(pattern, match => replacementMap.get(match));
  if (Array.isArray(value)) return value.map(scienceValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scienceValue(item)]));
  return value;
}

export async function readScienceSnapshot(db) {
  const before = await readFeatureSnapshot(db);
  before.notifications = await db.appNotification.findMany({ where: { senderId: teacherId, sessionId: { in: SCIENCE_SESSION_IDS } }, orderBy: { id: 'asc' } });
  return before;
}

export function buildSciencePlan(before) {
  const teacher = before.teachers?.[0];
  if (before.teachers?.length !== 1 || teacher.id !== teacherId || !teacher.isDemo || teacher.role !== 'TEACHER' || teacher.name !== '김탐구' || teacher.school !== '질문초등학교') throw new Error('시연 교사 신원이 일치하지 않습니다.');
  if (before.users.length !== VARIETY_STUDENT_IDS.length || new Set(before.users.map(u => u.id)).size !== VARIETY_STUDENT_IDS.length || before.users.some(u => !VARIETY_STUDENT_IDS.includes(u.id) || !u.isDemo || u.role !== 'STUDENT' || u.school !== teacher.school || u.grade !== '5' || u.className !== '1') || before.users.find(u => u.id === VARIETY_STUDENT_IDS[0])?.name !== '김질문') throw new Error('5학년 시연 학생 범위가 일치하지 않습니다.');
  if (before.classes.length !== 1 || before.classes[0].teacherId !== teacherId || before.classes[0].grade !== '5' || before.classes[0].className !== '1') throw new Error('시연 담당 학급이 일치하지 않습니다.');
  const sessions = before.sessions.filter(s => SCIENCE_SESSION_IDS.includes(s.id));
  if (sessions.length !== 3 || sessions.some(s => s.teacherId !== teacherId || s.targetGrade !== '5' || s.targetClassName !== '1' || !['수학', '과학'].includes(s.subject))) throw new Error('전환 대상 수업이 일치하지 않습니다.');
  const isDone = sessions.every(s => s.subject === '과학');
  if (!isDone && sessions.some(s => s.subject !== '수학')) throw new Error('부분 전환 상태를 먼저 확인해야 합니다.');
  const questions = before.questions.filter(q => SCIENCE_SESSION_IDS.includes(q.sessionId));
  if (questions.some(q => q.authorId !== teacherId && !VARIETY_STUDENT_IDS.includes(q.authorId))) throw new Error('시연 밖의 질문 작성자가 포함되어 있습니다.');
  const questionIds = new Set(questions.map(q => q.id));
  const comments = before.comments.filter(c => questionIds.has(c.questionId));
  if (comments.some(c => c.authorId !== teacherId && !VARIETY_STUDENT_IDS.includes(c.authorId))) throw new Error('시연 밖의 댓글 작성자가 포함되어 있습니다.');
  const designIds = new Set(sessions.map(s => s.unitDesignId));
  const designs = before.designs.filter(d => designIds.has(d.id));
  if (designIds.has(null) || designs.length !== 3 || designs.some(d => d.teacherId !== teacherId || d.grade !== '5')) throw new Error('시연 탐구설계 연결이 일치하지 않습니다.');
  const updates = Object.fromEntries(['sessions', 'designs', 'questions', 'comments', 'growth', 'reviews', 'bank', 'notifications', 'analyses', 'pointLogs', 'claims', 'runs', 'activities'].map(k => [k, []]));
  const add = (kind, row, fields) => {
    const data = {};
    for (const field of fields) {
      const next = scienceValue(row[field]);
      if (canonical(next) !== canonical(row[field])) data[field] = next;
    }
    if (Object.keys(data).length) updates[kind].push({ id: row.id ?? row.questionId, data });
    if (fields.some(field => mathText.test(JSON.stringify(data[field] ?? row[field])))) throw new Error(`${kind}의 미변환 학습 문장을 확인해야 합니다: ${row.id ?? row.questionId}`);
  };
  for (const s of sessions) add('sessions', s, ['subject', 'topic', 'sharedQuestions']);
  for (const d of designs) {
    if (!isDone) {
      const { key:_key, id:_id, ...content } = buildGradeFiveDesign({ key:d.id.includes('explore')?'exploreMath':'pastMath', unitDesignId:d.id });
      updates.designs.push({ id:d.id, data:{ ...content, curriculumAreaId:null } });
    }
  }
  for (const q of questions) add('questions', q, ['content', 'context']);
  for (const c of comments) add('comments', c, ['content']);
  for (const g of before.growth.filter(g => questionIds.has(g.questionId))) {
    add('growth', g, ['originalContent', 'revisedContent', 'changeNote', 'reflection']);
    const change = updates.growth.find(c => c.id === g.questionId);
    if (change) change.data.revision = g.revision + 1;
  }
  for (const r of before.reviews.filter(r => questionIds.has(r.questionId))) add('reviews', r, ['reason']);
  for (const b of before.bank.filter(b => [2, 3, 8, 10].some(i => b.id === `usb-demo-feature-v1-practice-item-${i}`))) add('bank', b, ['content', 'explanation', 'source', 'hint', 'example', 'title', 'passage']);
  for (const n of before.notifications ?? []) add('notifications', n, ['title', 'message', 'metadata']);
  const analyses = before.analyses.filter(a => SCIENCE_SESSION_IDS.includes(a.sessionId));
  if (analyses.some(a => !['class', 'student'].includes(a.scope) || (a.scope === 'student' && !VARIETY_STUDENT_IDS.includes(a.studentId)))) throw new Error('분석 대상이 시연 범위 밖입니다.');
  if (!isDone && updates.questions.length !== questions.length) throw new Error('전환되지 않은 질문이 있어 전체 변경을 중단했습니다.');
  const plan = { updates, creates: { questions: [] }, analysisIds: isDone ? [] : analyses.map(a => a.id) };
  diversifyDemoLearning(before, plan);
  for (const run of before.runs) add('runs', run, ['state']);
  for (const activity of before.activities) add('activities', activity, ['payload']);
  const target = before.sessions.find(s => s.id === 'usb-demo-session-explore-math');
  if (!target || target.teacherId !== teacherId || target.targetGrade !== '5') throw new Error('검토 시연 수업이 올바르지 않습니다.');
  const examples = before.questions.filter(q => q.id.startsWith(DEMO_MODERATION_PREFIX));
  if (examples.length && examples.length !== 5) throw new Error('검토 시연 질문의 일부만 있어 확인이 필요합니다.');
  if (!examples.length) plan.creates.questions = buildDemoModerationQuestions({ sessionId: target.id, context: scienceValue(target.topic), studentIds: VARIETY_STUDENT_IDS, createdAt: new Date(`${target.date}T11:30:00+09:00`) });
  const affected = new Set([
    ...updates.questions.map(c => before.questions.find(q => q.id === c.id).sessionId),
    ...updates.comments.map(c => before.questions.find(q => q.id === before.comments.find(row => row.id === c.id).questionId).sessionId),
    ...plan.creates.questions.map(q => q.sessionId),
  ]);
  plan.analysisIds = before.analyses.filter(a => affected.has(a.sessionId)).map(a => a.id);
  return plan;
}

// 운영 시연 자료의 내용만 갱신한다. 성장 메모와 교사 검토가 연결된 질문을 우선 보존한다.
export function diversifyDemoLearning(before, plan) {
  const after = previewScienceSnapshot(before, plan);
  if (after.sessions.some(s => s.teacherId !== teacherId || s.targetGrade !== '5') || after.questions.some(q => q.authorId !== teacherId && !VARIETY_STUDENT_IDS.includes(q.authorId)) || after.comments.some(c => c.authorId !== teacherId && !VARIETY_STUDENT_IDS.includes(c.authorId))) throw new Error('다양화할 자료에 시연 학급 밖의 작성자가 있습니다.');
  const put = (kind, id, data) => {
    const old = plan.updates[kind].find(c => c.id === id);
    if (old) Object.assign(old.data, data); else plan.updates[kind].push({ id, data });
  };
  const protectedIds = new Set([...after.growth.map(g => g.questionId), ...after.reviews.map(r => r.questionId)]);
  const students = after.questions.filter(q => q.source === 'STUDENT' && !q.flagged);
  const used = new Set();
  const changed = new Set();
  const identify = q => {
    const entry = Object.entries(GRADE_FIVE_LESSONS).find(([, l]) => l.topic === q.context);
    if (!entry) return null;
    const [key, lesson] = entry;
    const index = lesson.questions.findIndex(base => q.content.includes(base.content));
    const variantIndex = DEMO_QUESTION_VARIANTS[key].findIndex(group => group.some(item => item.content === q.content));
    return index < 0 && variantIndex < 0 ? null : { key, lesson, index: index < 0 ? variantIndex : index };
  };
  // 직접 작성한 문장과 성장 기록을 먼저 확보해 자동 생성 문장이 덮어쓰지 않게 한다.
  students.sort((a,b) => Number(protectedIds.has(b.id) || !identify(b)) - Number(protectedIds.has(a.id) || !identify(a)) || Number(b.authorId === VARIETY_STUDENT_IDS[0]) - Number(a.authorId === VARIETY_STUDENT_IDS[0]) || a.id.localeCompare(b.id));
  for (const q of students) {
    const known = identify(q);
    if (!known) { if (used.has(demoTextKey(q.content))) throw new Error('직접 작성한 시연 문장의 중복은 개별 검토가 필요합니다.'); used.add(demoTextKey(q.content)); continue; }
    const { key, lesson, index } = known;
    const base = lesson.questions[index];
    const prefixed = q.content !== base.content && q.content.includes(base.content);
    if (!used.has(demoTextKey(q.content)) && (!prefixed || protectedIds.has(q.id))) { used.add(demoTextKey(q.content)); continue; }
    if (after.reviews.some(r => r.questionId === q.id)) throw new Error('교사 검토가 연결된 질문의 중복은 개별 검토가 필요합니다.');
    const next = takeDemoQuestion(key, lesson, index, used);
    if (next.content !== q.content) {
      put('questions', q.id, { content: next.content }); q.content = next.content; changed.add(q.id);
      const growth = after.growth.find(g => g.questionId === q.id);
      if (growth) put('growth', q.id, { revisedContent:next.content, changeNote:'막연하게 묻던 질문에 비교할 조건과 관찰할 현상을 넣었어요.', reflection:growth.reflection ? next.answer : '', revision:growth.revision+1 });
    }
  }
  const usedComments = new Set();
  // 질문이 유지되는 댓글부터 확보한다. 변경된 질문의 댓글은 그 질문에 연결된 답변으로 교체한다.
  const comments = [...after.comments].sort((a,b) => Number(changed.has(a.questionId))-Number(changed.has(b.questionId)) || a.id.localeCompare(b.id));
  for (const c of comments) {
    const q = after.questions.find(q => q.id === c.questionId);
    if (!changed.has(q.id) && !usedComments.has(demoTextKey(c.content))) { usedComments.add(demoTextKey(c.content)); continue; }
    const entry = identify(q);
    if (!entry) throw new Error('수정할 답변의 학습 주제를 찾지 못했습니다.');
    const content = takeDemoComment(entry.key, entry.lesson, q, usedComments);
    if (content !== c.content) put('comments', c.id, { content });
  }
}

export function previewScienceSnapshot(before, plan) {
  return Object.fromEntries(Object.entries(before).map(([kind, rows]) => {
    const changes = new Map((plan.updates[kind] ?? []).map(c => [c.id, c.data]));
    return [kind, [...rows.map(row => ({ ...row, ...changes.get(row.id ?? row.questionId) })), ...(plan.creates?.[kind] ?? [])]];
  }));
}
export function scienceAnalysisDigest(before, plan) {
  const after = previewScienceSnapshot(before, plan);
  const data = Object.fromEntries(['users', 'sessions', 'questions', 'comments', 'likes', 'analyses'].map(k => [k, after[k]]));
  return createHash('sha256').update(canonical(data)).digest('hex');
}
export function attachScienceAnalyses(before, plan, manifest) {
  if (manifest.sourceDigest !== scienceAnalysisDigest(before, plan) || canonical(Object.keys(manifest.results).sort()) !== canonical([...plan.analysisIds].sort())) throw new Error('분석 생성에 사용한 자료가 현재 변경안과 다릅니다.');
  for (const id of plan.analysisIds) {
    const result = manifest.results[id];
    if (!result.summary?.trim() || !result.analysisModel || !Number.isFinite(Date.parse(result.analyzedAt)) || (SCIENCE_SESSION_IDS.includes(before.analyses.find(a => a.id === id).sessionId) && mathText.test(JSON.stringify(result)))) throw new Error('과학 분석 결과가 완전하지 않습니다.');
    plan.updates.analyses.push({ id, data: { result, locale: 'ko' } });
  }
}

export async function prepareSciencePlan(db, before, plan) {
  const inputs = ['questions', 'comments'].flatMap(kind => [...plan.updates[kind].filter(c => c.data.content).map(c => ({ kind, id: c.id, content: c.data.content })), ...(plan.creates?.[kind] ?? []).map(row => ({ kind, id: row.id, content: row.content }))]);
  if (!inputs.length) return plan;
  const normalized = await db.$queryRaw`SELECT item->>'kind' AS kind,item->>'id' AS id,public.normalize_activity_content(item->>'content') AS content FROM jsonb_array_elements(${JSON.stringify(inputs)}::jsonb) AS item`;
  const normalizedById = new Map(normalized.map(r => [`${r.kind}:${r.id}`, r.content]));
  for (const kind of ['questions', 'comments']) {
    for (const change of plan.updates[kind].filter(c => c.data.content)) {
      const row = before[kind].find(r => r.id === change.id);
      const content = normalizedById.get(`${kind}:${change.id}`);
      if (!content) throw new Error('정규화한 학습 내용이 비어 있습니다.');
      change.data.normalizedContent = content;
      change.data.dedupeKey = row.authorId === teacherId ? null : md5(content);
    }
    for (const row of plan.creates?.[kind] ?? []) {
      row.normalizedContent = normalizedById.get(`${kind}:${row.id}`);
      row.dedupeKey = md5(row.normalizedContent);
    }
    const keys = new Set();
    for (const row of previewScienceSnapshot(before, plan)[kind]) {
      if (!row.dedupeKey) continue;
      const key = `${row.authorId}:${row.sessionId ?? row.questionId}:${row.dedupeKey}`;
      if (keys.has(key)) throw new Error('전환 후 같은 학생의 내용이 중복됩니다.');
      keys.add(key);
    }
  }
  for (const log of before.pointLogs) {
    const kind = log.bonusType === 'QUESTION_WRITE' ? 'questions' : log.bonusType === 'COMMENT_WRITE' ? 'comments' : null;
    if (!kind) continue;
    const id = kind === 'questions' ? log.relatedQuestionId : log.relatedCommentId;
    const change = plan.updates[kind].find(c => c.id === id);
    if (!change) continue;
    const row = before[kind].find(r => r.id === id);
    const scopeId = row.sessionId ?? row.questionId;
    const claim = before.claims.find(c => c.pointLogId === log.id);
    if (!claim || log.studentId !== row.authorId || claim.studentId !== log.studentId || claim.bonusType !== log.bonusType || claim.scopeId !== scopeId || claim.activityDedupeKey !== log.activityDedupeKey) throw new Error('기존 포인트와 중복 방지 기록이 일치하지 않습니다.');
    const activityDedupeKey = md5(`${scopeId}\x1f${change.data.normalizedContent}`);
    plan.updates.pointLogs.push({ id: log.id, data: { activityDedupeKey } });
    plan.updates.claims.push({ id: log.id, data: { activityDedupeKey } });
  }
  return plan;
}

export function verifyScienceMigration(before, after, plan) {
  const expected = previewScienceSnapshot(before, plan);
  for (const [kind, rows] of Object.entries(expected)) {
    if (rows.length !== after[kind].length) throw new Error(`${kind} 기록 수가 달라졌습니다.`);
    const byId = new Map(after[kind].map(r => [r.id ?? r.questionId, r]));
    for (const row of rows) {
      const id = row.id ?? row.questionId;
      const wanted = { ...row }, actual = { ...byId.get(id) };
      if (plan.creates?.[kind]?.some(c => c.id === id)) {
        for (const key of Object.keys(actual)) if (!(key in wanted)) delete actual[key];
      }
      if (plan.updates[kind]?.some(c => c.id === id)) { delete wanted.updatedAt; delete actual.updatedAt; }
      if (canonical(wanted) !== canonical(actual)) throw new Error(`${kind} 자료가 허용 범위 밖에서 변경됐습니다.`);
    }
  }
  for (const u of after.users) {
    if (after.pointLogs.filter(l => l.studentId === u.id && l.status === 'APPROVED').reduce((n, l) => n + l.points, 0) !== u.totalPoints) throw new Error('학생 총점과 지급 합계가 다릅니다.');
  }
}
async function readGuards(db) {
  return db.$queryRaw`SELECT t.tgname AS name,t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname IN ('protect_point_question_content_before_update','protect_point_comment_content_before_update','enforce_question_write_contract_before_write','enforce_comment_write_contract_before_write') ORDER BY t.tgname`;
}
class RehearsalRollback extends Error {}
const models = { sessions:'questionSession', designs:'unitDesign', questions:'question', comments:'comment', growth:'questionGrowth', reviews:'questionClassificationReview', bank:'practiceCustomItem', notifications:'appNotification', analyses:'sessionAnalysis', pointLogs:'pointLog', claims:'activityAwardClaim', runs:'gameRun', activities:'gameActivity' };
export async function migrateDemoScience(db, { apply=false, rehearse=false, backupPath, analysisManifest } = {}) {
  const before = await readScienceSnapshot(db);
  const plan = buildSciencePlan(before);
  if (analysisManifest) attachScienceAnalyses(before, plan, analysisManifest);
  await prepareSciencePlan(db, before, plan);
  const counts = Object.fromEntries(Object.entries(plan.updates).map(([k, rows]) => [k, rows.length]));
  if ((apply || rehearse) && (Object.values(counts).some(Boolean) || plan.creates.questions.length)) {
    if (plan.analysisIds.length !== plan.updates.analyses.length) throw new Error('변경된 내용으로 생성한 실제 분석 결과가 필요합니다.');
    if (!backupPath || !isAbsolute(backupPath)) throw new Error('비공개 백업의 절대 경로가 필요합니다.');
    const guardState = await readGuards(db);
    if (guardState.length !== 4 || guardState.some(g => g.enabled !== 'O')) throw new Error('포인트 보호 규칙이 예상 상태가 아닙니다.');
    writeFileSync(backupPath, JSON.stringify({ before, plan, guardState, createdAt:new Date() }), { flag:'wx', mode:0o600 });
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
        // 이전 시연 내용 전환과 같은 유지보수 절차. 다른 쓰기는 잠금 해제 뒤 복원된 규칙 아래에서 실행된다.
        await tx.$executeRawUnsafe('LOCK TABLE public.questions, public.comments, public.point_logs, public.activity_award_claims IN ACCESS EXCLUSIVE MODE');
        if (canonical(await readScienceSnapshot(tx)) !== canonical(before)) throw new Error('작업 중 자료가 변경되어 적용하지 않았습니다.');
        for (const [table, name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" DISABLE TRIGGER "${name}"`);
        for (const [kind, changes] of Object.entries(plan.updates)) for (const change of changes) {
          const where = kind === 'growth' ? { questionId:change.id } : kind === 'claims' ? { pointLogId:change.id } : { id:change.id };
          await tx[models[kind]].update({ where, data:change.data });
        }
        if (plan.creates.questions.length) await tx.question.createMany({ data: plan.creates.questions });
        for (const [table, name] of guards) await tx.$executeRawUnsafe(`ALTER TABLE public."${table}" ENABLE TRIGGER "${name}"`);
        verifyScienceMigration(before, await readScienceSnapshot(tx), plan);
        if (canonical(await readGuards(tx)) !== canonical(guardState)) throw new Error('포인트 보호 규칙이 복원되지 않았습니다.');
        if (!apply) throw new RehearsalRollback();
      }, { timeout:45000, isolationLevel:'Serializable' });
    } catch (error) { if (!(error instanceof RehearsalRollback)) throw error; }
    const after = await readScienceSnapshot(db);
    if (apply) verifyScienceMigration(before, after, plan);
    else if (canonical(before) !== canonical(after)) throw new Error('모의 적용 후 원본 복원에 실패했습니다.');
    if (canonical(await readGuards(db)) !== canonical(guardState)) throw new Error('최종 보호 규칙 상태가 다릅니다.');
  }
  return { mode:apply?'적용 완료':rehearse?'모의 적용 및 원본 복원 완료':'미리보기', counts, moderationQuestions:plan.creates.questions.length, pendingAnalyses:plan.analysisIds.length-plan.updates.analyses.length, pointsAndRelationsPreserved:true };
}
async function main() {
  const value = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length+3);
  nextEnv.loadEnvConfig(value('env-root') ?? process.cwd(), false, { info(){}, error(){} });
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connection_limit','1');
  const db = new PrismaClient({ datasources:{ db:{ url:url.href } } });
  try { console.log(JSON.stringify(await migrateDemoScience(db, { apply:process.argv.includes('--apply'), rehearse:process.argv.includes('--rehearse'), backupPath:value('backup'), analysisManifest:value('analysis') ? JSON.parse(readFileSync(value('analysis'),'utf8')) : undefined }),null,2)); }
  finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message.split('\n').filter(Boolean).at(-1)); process.exitCode=1; });
