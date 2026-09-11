import { describe, expect, it, vi } from 'vitest';
import { buildFeatureLearningPlan, verifyFeatureLearning, FEATURE_PREFIX, FEATURE_STUDENTS, FEATURE_BANK, dayKey } from '../../scripts/demo-feature-learning-content.mjs';
import { PRACTICE_DAILY_CAP, PRACTICE_POINTS } from '@/lib/practice-points';
import { prepareFeaturePlan } from '../../scripts/enrich-demo-feature-learning.mjs';
import { buildPracticeDiagnostic } from '@/lib/practice-diagnostics';
vi.mock('@/lib/db', () => ({ prisma: {} }));
import { practiceCustomItemSchema } from '@/lib/practice-custom';

const anchor = new Date('2026-09-11T00:00:00Z');
function snapshot() {
  const original = '같은 따뜻한 물을 담은 컵을 천으로 감싸면 식는 속도가 달라지는 까닭은 무엇일까요?';
  return {
    users: FEATURE_STUDENTS.map((id, i) => ({ id, name: i ? `학생${i + 1}` : '김질문', role: 'STUDENT', isDemo: true, school: '질문초등학교', grade: '5', className: '1', totalPoints: 0 })),
    teachers: [{ id: 'usb-demo-teacher', name: '김탐구', role: 'TEACHER', school: '질문초등학교', isDemo: true }],
    classes: [{ id: 'class', teacherId: 'usb-demo-teacher', grade: '5', className: '1' }],
    growth: [
      { questionId: 'old-one', originalContent: original, revisedContent: original, changeNote: '질문을 고쳤어요', reflection: '잘 알았어요', revision: 1 },
      { questionId: 'old-two', originalContent: '유물이 뭐니?', revisedContent: '유물을 무엇이라고 하니?', changeNote: '더 자세히 바꿨다.', reflection: '자세히 써야 한다.', revision: 3 },
    ],
    questions: [{ id: 'old-one', authorId: FEATURE_STUDENTS[0] }, { id: 'old-two', authorId: FEATURE_STUDENTS[0] }],
    pointLogs: [], sessions: [], designs: [], bank: [], practices: [], comments: [], likes: [], reviews: [], analyses: [], runs: [], activities: [], claims: [],
  };
}

describe('최근 기능을 연결한 5학년 시연 자료', () => {
  it('교사 배포 질문과 학생 글의 중복 키를 실제 저장 규칙에 맞춘다', async () => {
    const db = { $queryRaw: async (_strings, json) => JSON.parse(json).map(row => ({ id: row.id, content: row.content })) };
    const { creates } = await prepareFeaturePlan(db, snapshot(), anchor);
    expect(creates.questions.filter(row => row.source === 'TEACHER_SHARED').every(row => row.dedupeKey === null)).toBe(true);
    expect(creates.questions.filter(row => row.source === 'STUDENT').every(row => /^[0-9a-f]{32}$/.test(row.dedupeKey))).toBe(true);
    expect(creates.comments.every(row => /^[0-9a-f]{32}$/.test(row.dedupeKey))).toBe(true);
  });
  it('교사·학급을 제한하고 이미 생성한 자료나 변경된 원본은 거절한다', () => {
    const before = snapshot();
    expect(() => buildFeatureLearningPlan({ ...before, teachers: [{ ...before.teachers[0], isDemo: false }] }, anchor)).toThrow('시연 교사');
    expect(() => buildFeatureLearningPlan({ ...before, users: before.users.map((row, i) => i === 1 ? { ...row, grade: '4' } : row) }, anchor)).toThrow('시연 학생');
    expect(() => buildFeatureLearningPlan({ ...before, bank: [{ id: FEATURE_PREFIX + 'existing' }] }, anchor)).toThrow('중복');
    expect(() => buildFeatureLearningPlan({ ...before, growth: before.growth.map((row, i) => i ? row : { ...row, reflection: '나중에 직접 쓴 기록' }) }, anchor)).toThrow('기존 성장 기록');
  });

  it('5학년 4교과와 간단 수업을 연결하고 배포 상태를 구분한다', () => {
    const { creates } = buildFeatureLearningPlan(snapshot(), anchor);
    expect(creates.sessions).toHaveLength(5);
    expect(new Set(creates.designs.map(row => row.subject))).toEqual(new Set(['국어', '수학', '과학', '사회']));
    for (const design of creates.designs) {
      expect(design.grade).toBe('5');
      expect(design.achievements.length).toBeGreaterThan(0);
      expect(design.achievements.every(row => row.code.startsWith('[6'))).toBe(true);
    }
    expect(creates.sessions.filter(row => row.sharedQuestions.length)).toHaveLength(3);
    expect(creates.sessions.filter(row => row.unitDesignId && !row.sharedQuestions.length)).toHaveLength(1);
    expect(creates.sessions.at(-1).date).toBe('2026-09-11');
    for (const question of creates.questions) {
      const session = creates.sessions.find(row => row.id === question.sessionId);
      expect(session).toBeTruthy();
      expect(dayKey(question.createdAt)).toBe(session.date);
      expect(question.content.length).toBeLessThanOrEqual(300);
      expect(question.createdAt.getTime()).toBeLessThan(anchor.getTime());
    }
  });

  it('질문 원문에 연결된 완료·작성중·메모 작성전 사례를 각각 제공한다', () => {
    const { creates, updates } = buildFeatureLearningPlan(snapshot(), anchor);
    const ownIds = creates.questions.filter(row => row.authorId === FEATURE_STUDENTS[0]).map(row => row.id);
    const own = creates.growth.filter(row => ownIds.includes(row.questionId));
    expect(ownIds).toHaveLength(8);
    expect(own.filter(row => row.changeNote && row.reflection)).toHaveLength(4);
    expect(own.filter(row => row.changeNote && !row.reflection)).toHaveLength(2);
    expect(own.filter(row => !row.changeNote && !row.reflection)).toHaveLength(1);
    for (const growth of creates.growth) {
      expect(growth.revisedContent).toBe(creates.questions.find(row => row.id === growth.questionId).content);
      expect(growth.changeNote.length).toBeLessThanOrEqual(300);
      expect(growth.reflection.length).toBeLessThanOrEqual(600);
    }
    expect(updates.growth).toHaveLength(2);
    expect(updates.growth.map(row => row.data.revision)).toEqual([2, 4]);
    expect(updates.growth.every(row => !('originalContent' in row.data) && !('revisedContent' in row.data))).toBe(true);
  });

  it('댓글이 서로 다르고 비공개 질문에는 댓글이나 좋아요를 붙이지 않는다', () => {
    const { creates } = buildFeatureLearningPlan(snapshot(), anchor);
    expect(new Set(creates.comments.map(row => row.content)).size).toBe(creates.comments.length);
    for (const interaction of [...creates.comments, ...creates.likes]) {
      const question = creates.questions.find(row => row.id === interaction.questionId);
      expect(question.isPublic).toBe(true);
      expect(interaction.userId ?? interaction.authorId).not.toBe(question.authorId);
    }
    expect(new Set(creates.growth.map(row => row.changeNote).filter(Boolean)).size).toBe(18);
  });

  it('문항 형식과 진단 연결이 유효하고 학생별 정답률과 활동량이 다르다', () => {
    FEATURE_BANK.forEach(item => expect(practiceCustomItemSchema.safeParse(item).success).toBe(true));
    const { creates } = buildFeatureLearningPlan(snapshot(), anchor);
    const lookup = new Map(creates.bank.map(row => [row.id, row]));
    const outcomes = FEATURE_STUDENTS.map(id => {
      const attempts = creates.practices.filter(row => row.studentId === id);
      const diagnostic = buildPracticeDiagnostic(attempts, lookup);
      // 질문 만들기는 저장된 목표 유형이 없으므로 기존 정책대로 유형별 진단에서는 제외한다.
      expect(diagnostic.unknownTypeAttempts).toBe(attempts.filter(row => row.mode === 'create').length);
      return `${attempts.length}:${diagnostic.overall.accuracy}`;
    });
    expect(new Set(outcomes).size).toBeGreaterThan(8);
    for (const attempt of creates.practices) expect(lookup.get(attempt.itemId).mode).toBe(attempt.mode);
  });

  it('계획 밖의 수정·누락과 포인트 불일치를 거절한다', () => {
    const before = snapshot();
    const plan = buildFeatureLearningPlan(before, anchor);
    const after = Object.fromEntries(Object.entries(before).map(([kind, rows]) => {
      const changes = new Map((plan.updates[kind] ?? []).map(row => [row.id, row.data]));
      return [kind, [...rows.map(row => ({ ...row, ...changes.get(row.id ?? row.questionId) })), ...(plan.creates[kind] ?? [])]];
    }));
    expect(() => verifyFeatureLearning(before, after, plan)).not.toThrow();
    expect(() => verifyFeatureLearning(before, { ...after, growth: after.growth.map((row, i) => i ? row : { ...row, originalContent: '원문 변경' }) }, plan)).toThrow('기존 자료');
    expect(() => verifyFeatureLearning(before, { ...after, questions: after.questions.slice(1) }, plan)).toThrow('자료 수');
    expect(() => verifyFeatureLearning(before, { ...after, users: after.users.map((row, i) => i ? row : { ...row, totalPoints: row.totalPoints + 1 }) }, plan)).toThrow();
  });

  it('연습 하루 상한과 기존 지급분을 반영하고 오답·중복에는 점수를 주지 않는다', () => {
    const before = snapshot();
    before.pointLogs.push({ id: 'existing', studentId: FEATURE_STUDENTS[0], gameId: 'PRACTICE', status: 'APPROVED', points: 14, createdAt: new Date('2026-09-07T00:00:00Z') });
    before.users[0].totalPoints = 14;
    const { creates } = buildFeatureLearningPlan(before, anchor);
    const totals = new Map();
    const duplicates = new Set();
    for (const log of [...before.pointLogs, ...creates.pointLogs]) {
      const day = `${log.studentId}:${dayKey(log.createdAt)}`;
      totals.set(day, (totals.get(day) ?? 0) + log.points);
    }
    for (const log of creates.pointLogs) {
      const attemptId = log.id.replace('practice-points-', 'practice-');
      const attempt = creates.practices.find(row => row.id === attemptId);
      expect(attempt.correct).toBe(true);
      expect(log.points).toBeLessThanOrEqual(attempt.mode === 'quiz' ? PRACTICE_POINTS.QUIZ_CORRECT : PRACTICE_POINTS.TARGET_ACHIEVED);
      const key = `${log.studentId}:${log.roomCode}`;
      expect(duplicates.has(key)).toBe(false);
      duplicates.add(key);
    }
    expect([...totals.values()].every(value => value <= PRACTICE_DAILY_CAP)).toBe(true);
  });

});
