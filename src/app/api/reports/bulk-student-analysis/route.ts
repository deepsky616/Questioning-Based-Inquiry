import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AiKeyMissingError } from "@/lib/ai";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";
import { requireTeacherSession } from "@/lib/session-helpers";
import {
  isClassInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";
import { sessionTargetsStudent } from "@/lib/session-targeting";

// 한 번의 요청에서 실행할 최대 AI 분석 수(서버리스 타임아웃 회피). 클라이언트가 cursor로 반복 호출한다.
const ANALYSES_PER_CALL = 3;

const bodySchema = z.object({
  grade: z.string().min(1),
  className: z.string().min(1),
  sessionIds: z.array(z.string().min(1)).min(1),
  cursor: z.number().int().nonnegative().default(0),
});

/**
 * 교사용 일괄 학생 분석: 선택한 기간의 세션들 × 반 전체 학생을 나눠서 분석한다.
 * - 참여한 (학생, 세션) 쌍만 대상으로 하고, 이미 분석된 쌍은 건너뛴다.
 * - 한 번에 ANALYSES_PER_CALL건만 처리하고 cursor를 돌려준다(클라이언트가 done까지 반복 호출).
 * POST body: { grade, className, sessionIds: string[], cursor: number }
 */
export async function POST(req: NextRequest) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  const userId = authResult.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  const { grade, className, sessionIds: sessionIdsRaw, cursor } = parsed.data;

  const limited = checkRateLimit(`bulk-analysis:${userId}`, 120);
  if (limited) return limited;

  const teacherScope = await loadTeacherStudentScope(userId);
  if (!teacherScope || !isClassInTeacherScope(teacherScope, grade, className)) {
    return NextResponse.json({ error: "담당 학급이 아닙니다" }, { status: 403 });
  }

  // 학급 학생(출석번호순 → 결정적 순서)
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      school: teacherScope.school,
      grade,
      className,
    },
    select: { id: true },
    orderBy: [{ studentNumber: "asc" }, { id: "asc" }],
  });
  const studentIds = students.map((s) => s.id);

  // 교사 소유 세션만(주어진 순서 유지)
  const ownedSessions = await prisma.questionSession.findMany({
    where: { id: { in: sessionIdsRaw }, teacherId: userId },
    select: {
      id: true,
      targetType: true,
      targetGrade: true,
      targetClassName: true,
      targetStudentId: true,
      targetStudentIds: true,
    },
  });
  const ownedSet = new Set(ownedSessions.map((s) => s.id));
  const ownedById = new Map(ownedSessions.map((item) => [item.id, item]));
  const sessionIds = sessionIdsRaw.filter((id) => ownedSet.has(id));

  if (studentIds.length === 0 || sessionIds.length === 0) {
    return NextResponse.json({ total: 0, nextCursor: 0, done: true, analyzedThisCall: 0 });
  }

  // 참여한 (학생, 세션) 쌍 집합 — 질문 작성/댓글 작성/좋아요 중 하나라도 있으면 참여
  const [qPairs, cPairs, lPairs] = await Promise.all([
    prisma.question.findMany({
      where: { sessionId: { in: sessionIds }, authorId: { in: studentIds } },
      select: { sessionId: true, authorId: true }, distinct: ["sessionId", "authorId"],
    }),
    prisma.comment.findMany({
      where: { authorId: { in: studentIds }, question: { sessionId: { in: sessionIds } } },
      select: { authorId: true, question: { select: { sessionId: true } } },
    }),
    prisma.questionLike.findMany({
      where: { userId: { in: studentIds }, question: { sessionId: { in: sessionIds } } },
      select: { userId: true, question: { select: { sessionId: true } } },
    }),
  ]);
  const participated = new Set<string>();
  for (const p of qPairs) participated.add(`${p.sessionId}|${p.authorId}`);
  for (const c of cPairs) if (c.question) participated.add(`${c.question.sessionId}|${c.authorId}`);
  for (const l of lPairs) if (l.question) participated.add(`${l.question.sessionId}|${l.userId}`);

  // 결정적 순서의 작업 목록(학생 순 × 세션 순) — 참여한 쌍만
  const pairs: { sessionId: string; studentId: string }[] = [];
  for (const sid of studentIds) {
    for (const sessId of sessionIds) {
      const targetSession = ownedById.get(sessId);
      if (
        targetSession &&
        sessionTargetsStudent(targetSession, { id: sid, grade, className }) &&
        participated.has(`${sessId}|${sid}`)
      ) {
        pairs.push({ sessionId: sessId, studentId: sid });
      }
    }
  }
  const total = pairs.length;

  // 이미 분석된 쌍(건너뛰기)
  const existing = await prisma.sessionAnalysis.findMany({
    where: { scope: "student", sessionId: { in: sessionIds }, studentId: { in: studentIds } },
    select: { sessionId: true, studentId: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.sessionId}|${e.studentId}`));

  let i = cursor;
  let analyzed = 0;
  try {
    while (i < total && analyzed < ANALYSES_PER_CALL) {
      const pair = pairs[i];
      i++;
      if (existingSet.has(`${pair.sessionId}|${pair.studentId}`)) continue; // 이미 분석됨 → 건너뛰기
      const res = await runStudentSessionAnalysis({ studentId: pair.studentId, sessionId: pair.sessionId, req });
      if (res) analyzed++;
    }
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
    }
    logger.error("bulk student analysis error:", error);
    // 한 건 실패는 다음 항목으로 넘어가도록 cursor를 진행시킨 채 반환
    return NextResponse.json({ total, nextCursor: i, done: i >= total, analyzedThisCall: analyzed, error: "일부 분석 실패" });
  }

  return NextResponse.json({ total, nextCursor: i, done: i >= total, analyzedThisCall: analyzed });
}
