import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { GRADE_FIVE_LESSONS, buildGradeFiveDesign } from './demo-grade-five-content.mjs';
import { readDemoVarietySnapshot } from './enrich-usb-demo-learning.mjs';
import { canonical } from './demo-learning-variety.mjs';

export function buildGuideUpdates(designs, sessions) {
  if (designs.length !== 8 || sessions.length !== 8) throw new Error('더미 수업과 설계가 각각 8개여야 합니다.');
  const updates = designs.map(row => {
    const key = Object.keys(GRADE_FIVE_LESSONS).find(key => GRADE_FIVE_LESSONS[key].coreIdea === row.coreIdea);
    if (!key) throw new Error('기준과 다른 수업 내용이 있어 중단합니다.');
    const fresh = buildGradeFiveDesign({ key, unitDesignId: row.id });
    for (const field of ['coreSentences', 'essentialQuestions', 'selectedKeywords']) {
      if (canonical(row[field]) !== canonical(fresh[field])) throw new Error('교사가 수정한 수업 내용은 자동 변경하지 않습니다.');
    }
    const inquiryQuestions = row.inquiryQuestions.map(question => {
      const match = fresh.inquiryQuestions.find(item => item.content === question.content && item.type === question.type);
      if (!match) throw new Error('탐구질문 원문이 기준과 다릅니다.');
      return { ...question, studentGuide: match.studentGuide };
    });
    return { id: row.id, data: { inquiryQuestions, learningGuides: fresh.learningGuides } };
  });
  const sessionUpdates = sessions.map(row => {
    const design = updates.find(item => item.id === row.unitDesignId);
    if (!design) throw new Error('수업의 설계 연결을 확인할 수 없습니다.');
    return { id: row.id, data: { sharedQuestions: row.sharedQuestions.map(question => {
      if (question.source === 'student') return question;
      const match = design.data.inquiryQuestions.find(item => item.content === question.content && item.type === question.type);
      return match ? { ...question, studentGuide: match.studentGuide } : question;
    }) } };
  });
  return { designs: updates, sessions: sessionUpdates };
}

function verify(before, after, designsBefore, designsAfter, plan) {
  const expected = { ...before, sessions: before.sessions.map(row => ({ ...row, ...plan.sessions.find(item => item.id === row.id)?.data })) };
  if (canonical(expected) !== canonical(after)) throw new Error('질문, 댓글, 날짜 또는 포인트가 변경됐습니다.');
  const expectedDesigns = designsBefore.map(row => ({ ...row, ...plan.designs.find(item => item.id === row.id)?.data }));
  const withoutUpdated = rows => rows.map(({ updatedAt: _updatedAt, ...row }) => row);
  if (canonical(withoutUpdated(expectedDesigns)) !== canonical(withoutUpdated(designsAfter))) throw new Error('설계의 허용하지 않은 내용이 변경됐습니다.');
}
class RehearsalRollback extends Error {}
export async function refreshDemoStudentGuides(db, { apply = false, rehearse = false, backupPath } = {}) {
  const teacher = await db.user.findUnique({ where: { id: 'usb-demo-teacher' }, select: { role: true, isDemo: true, school: true } });
  if (teacher?.role !== 'TEACHER' || !teacher.isDemo || teacher.school !== '질문초등학교') throw new Error('교사 더미 계정을 확인할 수 없습니다.');
  const loadDesigns = tx => tx.unitDesign.findMany({ where: { teacherId: 'usb-demo-teacher' }, orderBy: { id: 'asc' } });
  const before = await readDemoVarietySnapshot(db);
  const designsBefore = await loadDesigns(db);
  const plan = buildGuideUpdates(designsBefore, before.sessions);
  if (apply || rehearse) {
    if (!backupPath) throw new Error('비공개 백업 경로가 필요합니다.');
    writeFileSync(backupPath, JSON.stringify({ before, designsBefore, plan }), { flag: 'wx', mode: 0o600 });
    try {
      await db.$transaction(async tx => {
        if (canonical(before) !== canonical(await readDemoVarietySnapshot(tx)) || canonical(designsBefore) !== canonical(await loadDesigns(tx))) throw new Error('작업 중 변경된 자료가 있어 중단합니다.');
        for (const row of plan.designs) await tx.unitDesign.update({ where: { id: row.id }, data: row.data });
        for (const row of plan.sessions) await tx.questionSession.update({ where: { id: row.id }, data: row.data });
        verify(before, await readDemoVarietySnapshot(tx), designsBefore, await loadDesigns(tx), plan);
        if (!apply) throw new RehearsalRollback();
      }, { isolationLevel: 'Serializable', timeout: 45000 });
    } catch (error) { if (!(error instanceof RehearsalRollback)) throw error; }
    if (apply) verify(before, await readDemoVarietySnapshot(db), designsBefore, await loadDesigns(db), plan);
    else if (canonical(before) !== canonical(await readDemoVarietySnapshot(db)) || canonical(designsBefore) !== canonical(await loadDesigns(db))) throw new Error('원본 복원 확인에 실패했습니다.');
  }
  return { 상태: apply ? '적용 완료' : rehearse ? '적용 후 원본 복원 검증 완료' : '미리보기', 수업수: plan.sessions.length, 설계수: plan.designs.length, 기존질문댓글포인트보존: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  try { console.log(JSON.stringify(await refreshDemoStudentGuides(db, { apply: process.argv.includes('--apply'), rehearse: process.argv.includes('--rehearse'), backupPath: process.argv.find(arg => arg.startsWith('--backup='))?.slice(9) }))); }
  finally { await db.$disconnect(); }
}
