import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { readDemoVarietySnapshot } from './enrich-usb-demo-learning.mjs';
import { canonical } from './demo-learning-variety.mjs';
import { FEATURE_TEACHER, FEATURE_STUDENTS, buildFeatureLearningPlan, verifyFeatureLearning } from './demo-feature-learning-content.mjs';

export async function readFeatureSnapshot(db) {
  const snapshot = await readDemoVarietySnapshot(db);
  const ids = snapshot.sessions.map(row => row.id);
  const [teachers, classes, designs, bank, growth, reviews] = await Promise.all([
    db.user.findMany({ where: { id: FEATURE_TEACHER }, select: { id: true, name: true, role: true, school: true, isDemo: true, totalPoints: true, updatedAt: true } }),
    db.teacherClass.findMany({ where: { teacherId: FEATURE_TEACHER }, orderBy: { id: 'asc' } }),
    db.unitDesign.findMany({ where: { teacherId: FEATURE_TEACHER }, orderBy: { id: 'asc' } }),
    db.practiceCustomItem.findMany({ where: { teacherId: FEATURE_TEACHER }, orderBy: { id: 'asc' } }),
    db.questionGrowth.findMany({ where: { question: { sessionId: { in: ids } } }, orderBy: { questionId: 'asc' } }),
    db.questionClassificationReview.findMany({ where: { question: { sessionId: { in: ids } } }, orderBy: { id: 'asc' } }),
  ]);
  return { ...snapshot, teachers, classes, designs, bank, growth, reviews };
}

export async function prepareFeaturePlan(db, before, anchor) {
  const plan = buildFeatureLearningPlan(before, anchor);
  const contentRows = ['questions', 'comments'].flatMap(kind => plan.creates[kind].map(row => ({ id: row.id, content: row.content })));
  const normalized = await db.$queryRaw`SELECT item->>'id' AS id,public.normalize_activity_content(item->>'content') AS content FROM jsonb_array_elements(${JSON.stringify(contentRows)}::jsonb) AS item`;
  const byId = new Map(normalized.map(row => [row.id, row.content]));
  for (const kind of ['questions', 'comments']) {
    const keys = new Set(before[kind].map(row => `${row.authorId}:${row.sessionId ?? row.questionId}:${row.normalizedContent}`));
    for (const row of plan.creates[kind]) {
      row.normalizedContent = byId.get(row.id);
      if (!row.normalizedContent) throw new Error('정규화한 학습 내용이 비어 있습니다.');
      // 실제 저장 규칙은 학생 글에만 중복 키를 부여하고 교사 배포 질문은 비워 둔다.
      row.dedupeKey = row.authorId === FEATURE_TEACHER ? null : createHash('md5').update(row.normalizedContent).digest('hex');
      const key = `${row.authorId}:${row.sessionId ?? row.questionId}:${row.normalizedContent}`;
      if (keys.has(key)) throw new Error('같은 학생의 학습 내용이 중복됩니다.');
      keys.add(key);
    }
  }
  return plan;
}

const models = { designs: 'unitDesign', sessions: 'questionSession', questions: 'question', growth: 'questionGrowth', reviews: 'questionClassificationReview', comments: 'comment', likes: 'questionLike', bank: 'practiceCustomItem', practices: 'practiceAttempt', pointLogs: 'pointLog' };
class RehearsalRollback extends Error {}

export async function enrichDemoFeatures(db, { apply = false, rehearse = false, backupPath, anchor = new Date() } = {}) {
  if (apply && rehearse) throw new Error('적용과 복원 검증을 동시에 지정할 수 없습니다.');
  const before = await readFeatureSnapshot(db);
  const plan = await prepareFeaturePlan(db, before, anchor);
  if (apply || rehearse) {
    if (!backupPath || !isAbsolute(backupPath)) throw new Error('절대 경로의 비공개 백업 파일을 지정해야 합니다.');
    writeFileSync(backupPath, JSON.stringify({ createdAt: new Date(), before, plan }), { flag: 'wx', mode: 0o600 });
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
        await tx.$queryRaw`SELECT id FROM public.users WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify([FEATURE_TEACHER, ...FEATURE_STUDENTS])}::jsonb)) ORDER BY id FOR UPDATE`;
        if (canonical(await readFeatureSnapshot(tx)) !== canonical(before)) throw new Error('작업 중 시연 자료가 변경되어 적용하지 않았습니다.');
        for (const [kind, model] of Object.entries(models)) {
          const rows = plan.creates[kind];
          if (!rows.length) continue;
          const result = await tx[model].createMany({ data: rows });
          if (result.count !== rows.length) throw new Error('추가 자료 수가 계획과 일치하지 않습니다.');
        }
        for (const change of plan.updates.growth) {
          const old = before.growth.find(row => row.questionId === change.id);
          const result = await tx.questionGrowth.updateMany({ where: { questionId: change.id, revision: old.revision }, data: change.data });
          if (result.count !== 1) throw new Error('기존 성장 기록의 버전이 달라 적용하지 않았습니다.');
        }
        for (const change of plan.updates.users) await tx.user.update({ where: { id: change.id }, data: change.data });
        verifyFeatureLearning(before, await readFeatureSnapshot(tx), plan);
        if (rehearse) throw new RehearsalRollback();
      }, { isolationLevel: 'Serializable', timeout: 45000 });
    } catch (error) { if (!(error instanceof RehearsalRollback)) throw error; }
    const after = await readFeatureSnapshot(db);
    if (apply) verifyFeatureLearning(before, after, plan);
    else if (canonical(before) !== canonical(after)) throw new Error('검증 후 원본 복원에 실패했습니다.');
  }
  return {
    상태: apply ? '적용 완료' : rehearse ? '전체 적용 후 원본 복원 확인' : '변경 전 미리보기',
    추가: Object.fromEntries(Object.entries(plan.creates).map(([kind, rows]) => [kind, rows.length])),
    기존성장기록수정: plan.updates.growth.length,
    수업: plan.creates.sessions.map(row => ({ 날짜: row.date, 교과: row.subject, 주제: row.topic, 배포질문: row.sharedQuestions.length })),
    성장기록: { 완료: plan.creates.growth.filter(row => row.changeNote && row.reflection).length, 작성중: plan.creates.growth.filter(row => (row.changeNote || row.reflection) && !(row.changeNote && row.reflection)).length, 메모작성전: plan.creates.growth.filter(row => !row.changeNote && !row.reflection).length },
    추가연습포인트: plan.creates.pointLogs.reduce((sum, row) => sum + row.points, 0),
    기존질문댓글수업분석보존: true,
  };
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  try {
    const anchor = process.argv.find(arg => arg.startsWith('--anchor='))?.slice(9);
    console.log(JSON.stringify(await enrichDemoFeatures(db, {
      apply: process.argv.includes('--apply'), rehearse: process.argv.includes('--rehearse'),
      backupPath: process.argv.find(arg => arg.startsWith('--backup='))?.slice(9),
      ...(anchor ? { anchor: new Date(anchor) } : {}),
    }), null, 2));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  // 연결 문자열이나 실제 인증값이 포함될 수 있는 데이터베이스 오류 전문은 출력하지 않는다.
  console.error(error.name?.startsWith('Prisma') ? `시연 자료 처리 실패 (${error.code ?? error.name})` : error.message);
  process.exitCode = 1;
});
