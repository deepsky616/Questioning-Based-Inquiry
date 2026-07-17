import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  MAX_ACTIVITY_BONUS_PER_STUDENT,
  TEACHER_ADJUSTED_BONUS,
  VALID_ACTIVITY_BONUS,
} from "@/lib/activity-bonus-policy";
import {
  isStudentInTeacherScope,
  lockAndLoadTeacherStudentScope,
  lockStudentRows,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";
import { lockPointUserTransactions } from "@/lib/point-user-transaction-lock";

const CAPPED_ACTIVITY_BONUS_TYPES = [
  ...VALID_ACTIVITY_BONUS.map((bonusType) => `AI_${bonusType}`),
  TEACHER_ADJUSTED_BONUS,
];
const QUESTION_SOURCE_BONUS_TYPES = new Set([
  "AI_TOPIC_FIT_QUESTION",
  "AI_DEEP_QUESTION",
  "AI_DUPLICATE_FLAGGED",
  "AI_LOW_EFFORT_FLAGGED",
  TEACHER_ADJUSTED_BONUS,
]);
const COMMENT_SOURCE_BONUS_TYPES = new Set([
  "AI_APT_ANSWER",
  "AI_INSIGHTFUL_ANSWER",
  "AI_DUPLICATE_FLAGGED",
  "AI_LOW_EFFORT_FLAGGED",
  TEACHER_ADJUSTED_BONUS,
]);

function studentSessionKey(studentId: string, sessionId: string | null): string {
  return JSON.stringify([studentId, sessionId]);
}

// PENDING 보너스 일괄 승인/거부/수정
// body: { ids: string[], decision: 'APPROVE' | 'REJECT', overridePoints?: number }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const decision = body.decision === "APPROVE" || body.decision === "REJECT" ? body.decision : null;
  const overridePoints = typeof body.overridePoints === "number" ? body.overridePoints : null;
  if (ids.length === 0 || !decision) {
    return NextResponse.json({ error: "ids와 decision 필요" }, { status: 400 });
  }
  // 수정 점수 범위 검증 — 음수(감점)와 상한 초과를 서버에서 차단한다
  if (
    overridePoints != null &&
    (!Number.isInteger(overridePoints) || overridePoints < 0 || overridePoints > MAX_ACTIVITY_BONUS_PER_STUDENT)
  ) {
    return NextResponse.json(
      { error: `수정 점수는 0~${MAX_ACTIVITY_BONUS_PER_STUDENT} 사이의 정수여야 합니다` },
      { status: 400 },
    );
  }

  // 교사 권한 검증: 자기 담당 세션의 보너스만
  const myLogs = await prisma.pointLog.findMany({
    where: {
      id: { in: ids },
      status: "PENDING",
      bonusType: { in: CAPPED_ACTIVITY_BONUS_TYPES },
    },
    include: {
      student: {
        select: {
          id: true,
          role: true,
          school: true,
          grade: true,
          className: true,
        },
      },
    },
  });

  const teacherScope = await loadTeacherStudentScope(teacherId);
  const sessionIds = Array.from(new Set(myLogs.map((l) => l.sessionId).filter((x): x is string => !!x)));
  const ownedSessions = await prisma.questionSession.findMany({
    where: { id: { in: sessionIds }, teacherId },
    select: { id: true },
  });
  const ownedSet = new Set(ownedSessions.map((s) => s.id));

  const allowed = teacherScope
    ? myLogs.filter(
        (log) =>
          isStudentInTeacherScope(teacherScope, log.student) &&
          Boolean(log.sessionId && ownedSet.has(log.sessionId)),
      )
    : [];
  if (allowed.length === 0) {
    return NextResponse.json({ error: "권한 있는 보너스가 없습니다" }, { status: 403 });
  }

  const relatedCommentIds = Array.from(new Set(
    allowed
      .map((log) => log.relatedCommentId)
      .filter((id): id is string => typeof id === "string"),
  ));
  const commentParents = relatedCommentIds.length === 0
    ? []
    : await prisma.comment.findMany({
        where: { id: { in: relatedCommentIds } },
        select: { id: true, questionId: true },
      });
  const commentParentById = new Map(
    commentParents.map((comment) => [comment.id, comment.questionId]),
  );

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const sourceQuestionIds = Array.from(new Set([
      ...allowed
        .map((log) => log.relatedQuestionId)
        .filter((id): id is string => typeof id === "string"),
      ...relatedCommentIds
        .map((commentId) => commentParentById.get(commentId))
        .filter((id): id is string => typeof id === "string"),
    ])).sort();
    const lockedQuestions = sourceQuestionIds.length === 0
      ? []
      : await tx.$queryRaw<Array<{
          id: string;
          authorId: string;
          sessionId: string | null;
          source: string;
        }>>(Prisma.sql`
          SELECT
            "id",
            "author_id" AS "authorId",
            "session_id" AS "sessionId",
            "source"
          FROM "questions"
          WHERE "id" IN (${Prisma.join(sourceQuestionIds)})
          ORDER BY "id"
          FOR SHARE
        `);
    const sortedCommentIds = [...relatedCommentIds].sort();
    const lockedComments = sortedCommentIds.length === 0
      ? []
      : await tx.$queryRaw<Array<{
          id: string;
          authorId: string;
          questionId: string;
        }>>(Prisma.sql`
          SELECT
            "id",
            "author_id" AS "authorId",
            "question_id" AS "questionId"
          FROM "comments"
          WHERE "id" IN (${Prisma.join(sortedCommentIds)})
          ORDER BY "id"
          FOR SHARE
        `);
    const allowedSessionIds = Array.from(new Set(
      allowed.map((log) => log.sessionId).filter((id): id is string => typeof id === "string"),
    )).sort();
    let currentOwnedSet = new Set<string>();
    if (allowedSessionIds.length > 0) {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "question_sessions"
        WHERE "id" IN (${Prisma.join(allowedSessionIds)})
        ORDER BY "id"
        FOR UPDATE
      `);
      const currentOwnedSessions = await tx.questionSession.findMany({
        where: { id: { in: allowedSessionIds }, teacherId },
        select: { id: true },
      });
      currentOwnedSet = new Set(currentOwnedSessions.map((owned) => owned.id));
    }

    const studentIds = Array.from(new Set(allowed.map((log) => log.studentId))).sort();
    await lockPointUserTransactions(tx, [teacherId, ...studentIds]);

    const currentTeacherScope = await lockAndLoadTeacherStudentScope(tx, teacherId);
    if (!currentTeacherScope) return { state: "FORBIDDEN" as const };

    await lockStudentRows(tx, studentIds);
    const currentStudents = await tx.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, role: true, school: true, grade: true, className: true },
      orderBy: { id: "asc" },
    });
    const currentStudentById = new Map(
      currentStudents.map((student) => [student.id, student]),
    );
    const currentAllowed = allowed.filter((log) => {
      const currentStudent = currentStudentById.get(log.studentId);
      return Boolean(
        currentStudent &&
        isStudentInTeacherScope(currentTeacherScope, currentStudent) &&
        log.sessionId &&
        currentOwnedSet.has(log.sessionId),
      );
    });
    if (currentAllowed.length === 0) return { state: "FORBIDDEN" as const };

    if (decision === "APPROVE") {
      const lockedQuestionById = new Map(
        lockedQuestions.map((question) => [question.id, question]),
      );
      const lockedCommentById = new Map(
        lockedComments.map((comment) => [comment.id, comment]),
      );
      const approvalCandidates = currentAllowed.filter((log) => {
        if (!log.sessionId) return false;
        const hasQuestion = typeof log.relatedQuestionId === "string";
        const hasComment = typeof log.relatedCommentId === "string";
        if (hasQuestion === hasComment) return false;
        if (hasQuestion) {
          const question = lockedQuestionById.get(log.relatedQuestionId!);
          return Boolean(
            QUESTION_SOURCE_BONUS_TYPES.has(log.bonusType) &&
            question &&
            question.authorId === log.studentId &&
            question.sessionId === log.sessionId &&
            question.source !== "TEACHER_SHARED"
          );
        }
        const comment = lockedCommentById.get(log.relatedCommentId!);
        const expectedQuestionId = commentParentById.get(log.relatedCommentId!);
        const question = expectedQuestionId
          ? lockedQuestionById.get(expectedQuestionId)
          : undefined;
        return Boolean(
          COMMENT_SOURCE_BONUS_TYPES.has(log.bonusType) &&
          comment &&
          question &&
          comment.authorId === log.studentId &&
          comment.questionId === expectedQuestionId &&
          question.sessionId === log.sessionId &&
          question.source !== "TEACHER_SHARED"
        );
      });
      const approvalIds = new Set(approvalCandidates.map((log) => log.id));
      const invalidSourceIds = currentAllowed
        .filter((log) => !approvalIds.has(log.id))
        .map((log) => log.id);
      if (invalidSourceIds.length > 0) {
        await tx.pointLog.updateMany({
          where: { id: { in: invalidSourceIds }, status: "PENDING" },
          data: {
            status: "REJECTED",
            decidedById: teacherId,
            decidedAt: now,
          },
        });
      }
      if (approvalCandidates.length === 0) {
        return { state: "UPDATED" as const, count: 0 };
      }
      const currentStudentIds = Array.from(
        new Set(approvalCandidates.map((log) => log.studentId)),
      ).sort();
      const sumByStudent: Record<string, number> = {};

      const nonNullSessionIds = Array.from(new Set(
        approvalCandidates.map((log) => log.sessionId).filter((id): id is string => typeof id === "string"),
      ));
      const approved = await tx.pointLog.findMany({
        where: {
          studentId: { in: currentStudentIds },
          status: "APPROVED",
          bonusType: { in: CAPPED_ACTIVITY_BONUS_TYPES },
          OR: [
            ...(nonNullSessionIds.length > 0
              ? [{ sessionId: { in: nonNullSessionIds } }]
              : []),
          ],
        },
        select: { studentId: true, sessionId: true, points: true },
      });
      const approvedByStudentSession = new Map<string, number>();
      for (const log of approved) {
        const key = studentSessionKey(log.studentId, log.sessionId);
        approvedByStudentSession.set(
          key,
          (approvedByStudentSession.get(key) ?? 0) + Math.max(0, log.points),
        );
      }
      let claimedCount = 0;

      for (const log of approvalCandidates) {
        const points = overridePoints != null ? overridePoints : log.points;
        const key = studentSessionKey(log.studentId, log.sessionId ?? null);
        const approvedPoints = approvedByStudentSession.get(key) ?? 0;
        if (
          !Number.isInteger(points) ||
          points < 0 ||
          approvedPoints + points > MAX_ACTIVITY_BONUS_PER_STUDENT
        ) {
          continue;
        }
        const claimed = await tx.pointLog.updateMany({
          where: { id: log.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            decidedById: teacherId,
            decidedAt: now,
            ...(overridePoints != null ? { points: overridePoints } : {}),
            ...(overridePoints != null && log.bonusType.includes("FLAGGED")
              ? { bonusType: TEACHER_ADJUSTED_BONUS }
              : {}),
          },
        });
        if (claimed.count === 0) continue;

        sumByStudent[log.studentId] = (sumByStudent[log.studentId] ?? 0) + points;
        approvedByStudentSession.set(key, approvedPoints + points);
        claimedCount += claimed.count;
      }

      for (const [studentId, points] of Object.entries(sumByStudent)) {
        await tx.user.update({
          where: { id: studentId },
          data: { totalPoints: { increment: points } },
        });
      }

      return { state: "UPDATED" as const, count: claimedCount };
    }

    const rejected = await tx.pointLog.updateMany({
      where: { id: { in: currentAllowed.map((log) => log.id) }, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: teacherId,
        decidedAt: now,
      },
    });
    return { state: "UPDATED" as const, count: rejected.count };
  });

  if (result.state === "FORBIDDEN") {
    return NextResponse.json({ error: "권한 있는 보너스가 없습니다" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, count: result.count });
}
