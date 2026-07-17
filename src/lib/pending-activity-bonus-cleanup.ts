import { Prisma } from "@prisma/client";
import {
  TEACHER_ADJUSTED_BONUS,
  VALID_ACTIVITY_BONUS,
} from "@/lib/activity-bonus-policy";

export const PENDING_ACTIVITY_REVIEW_BONUS_TYPES = [
  ...VALID_ACTIVITY_BONUS.map((bonusType) => `AI_${bonusType}`),
  TEACHER_ADJUSTED_BONUS,
];

type Tx = Prisma.TransactionClient;

export type LockedPointIntegritySession = {
  id: string;
  teacherId: string;
};

export type LockedPointIntegrityQuestion = {
  id: string;
  authorId: string;
  sessionId: string | null;
};

export type LockedPointIntegrityComment = {
  id: string;
  authorId: string;
  questionId: string;
};

function sortedUnique(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.length > 0))).sort();
}

export async function lockPointIntegrityQuestionRows(tx: Tx, questionIds: readonly string[]) {
  const sortedIds = sortedUnique(questionIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<LockedPointIntegrityQuestion[]>(Prisma.sql`
    SELECT
      "id",
      "author_id" AS "authorId",
      "session_id" AS "sessionId"
    FROM "questions"
    WHERE "id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function lockPointIntegrityChildCommentRows(tx: Tx, questionIds: readonly string[]) {
  const sortedIds = sortedUnique(questionIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<LockedPointIntegrityComment[]>(Prisma.sql`
    SELECT
      "id",
      "author_id" AS "authorId",
      "question_id" AS "questionId"
    FROM "comments"
    WHERE "question_id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function lockPointIntegrityCommentRows(tx: Tx, commentIds: readonly string[]) {
  const sortedIds = sortedUnique(commentIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<LockedPointIntegrityComment[]>(Prisma.sql`
    SELECT
      "id",
      "author_id" AS "authorId",
      "question_id" AS "questionId"
    FROM "comments"
    WHERE "id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function lockPointIntegritySessionRows(tx: Tx, sessionIds: readonly string[]) {
  const sortedIds = sortedUnique(sessionIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<LockedPointIntegritySession[]>(Prisma.sql`
    SELECT "id", "teacher_id" AS "teacherId"
    FROM "question_sessions"
    WHERE "id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function lockPointIntegrityUserRows(tx: Tx, userIds: readonly string[]) {
  const sortedIds = sortedUnique(userIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function lockPointIntegrityTeacherClassRows(
  tx: Tx,
  teacherIds: readonly string[],
) {
  const sortedIds = sortedUnique(teacherIds);
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "teacher_classes"
    WHERE "teacher_id" IN (${Prisma.join(sortedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function rejectPendingActivityBonuses(
  tx: Tx,
  params: {
    questionIds?: readonly string[];
    commentIds?: readonly string[];
    sessionIds?: readonly string[];
    decidedAt?: Date;
  },
) {
  const questionIds = sortedUnique(params.questionIds ?? []);
  const commentIds = sortedUnique(params.commentIds ?? []);
  const sessionIds = sortedUnique(params.sessionIds ?? []);
  if (questionIds.length === 0 && commentIds.length === 0 && sessionIds.length === 0) {
    return 0;
  }

  const result = await tx.pointLog.updateMany({
    where: {
      status: "PENDING",
      bonusType: { in: PENDING_ACTIVITY_REVIEW_BONUS_TYPES },
      ...(sessionIds.length > 0
        ? { sessionId: { in: sessionIds } }
        : {
            OR: [
              ...(questionIds.length > 0
                ? [{ relatedQuestionId: { in: questionIds } }]
                : []),
              ...(commentIds.length > 0
                ? [{ relatedCommentId: { in: commentIds } }]
                : []),
            ],
          }),
    },
    data: {
      status: "REJECTED",
      decidedAt: params.decidedAt ?? new Date(),
    },
  });
  return result.count;
}

export async function lockQuestionDeletionTargets(
  tx: Tx,
  questionIds: readonly string[],
) {
  const lockedQuestions = await lockPointIntegrityQuestionRows(tx, questionIds);
  const lockedQuestionIds = lockedQuestions.map(({ id }) => id).sort();
  const lockedComments = await lockPointIntegrityChildCommentRows(tx, lockedQuestionIds);
  const lockedCommentIds = lockedComments.map(({ id }) => id).sort();
  return {
    questions: lockedQuestions,
    comments: lockedComments,
    questionIds: lockedQuestionIds,
    commentIds: lockedCommentIds,
  };
}

export async function lockCommentMutationTargets(
  tx: Tx,
  commentIds: readonly string[],
  parentQuestionIds: readonly string[] = [],
) {
  const questions = await lockPointIntegrityQuestionRows(tx, parentQuestionIds);
  const comments = await lockPointIntegrityCommentRows(tx, commentIds);
  return { questions, comments };
}

export async function lockCommentDeletionTargets(
  tx: Tx,
  commentIds: readonly string[],
  parentQuestionIds: readonly string[] = [],
) {
  const targets = await lockCommentMutationTargets(tx, commentIds, parentQuestionIds);
  return targets.comments.map(({ id }) => id).sort();
}

export async function lockSessionDeletionTargets(
  tx: Tx,
  sessionIds: readonly string[],
) {
  const sortedSessionIds = sortedUnique(sessionIds);
  if (sortedSessionIds.length === 0) {
    return {
      sessions: [] as LockedPointIntegritySession[],
      questionIds: [],
      commentIds: [],
      stable: true,
    };
  }

  const questions = await tx.question.findMany({
    where: { sessionId: { in: sortedSessionIds } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const lockedQuestions = await lockPointIntegrityQuestionRows(tx, questions.map(({ id }) => id));
  const lockedQuestionIds = lockedQuestions.map(({ id }) => id).sort();
  const lockedComments = await lockPointIntegrityChildCommentRows(tx, lockedQuestionIds);
  const lockedCommentIds = lockedComments.map(({ id }) => id).sort();
  const sessions = await lockPointIntegritySessionRows(tx, sortedSessionIds);
  const lockedSessionIds = sessions.map(({ id }) => id).sort();
  const currentQuestions = lockedSessionIds.length === 0
    ? []
    : await tx.question.findMany({
        where: { sessionId: { in: lockedSessionIds } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
  const lockedQuestionIdSet = new Set(lockedQuestionIds);
  const stable = currentQuestions.every(({ id }) => lockedQuestionIdSet.has(id));
  return {
    sessions,
    questionIds: lockedQuestionIds,
    commentIds: lockedCommentIds,
    stable,
  };
}

export async function lockAndRejectPendingBonusesForQuestions(
  tx: Tx,
  questionIds: readonly string[],
) {
  const targets = await lockQuestionDeletionTargets(tx, questionIds);
  await rejectPendingActivityBonuses(tx, targets);
  return targets;
}

export async function lockAndRejectPendingBonusesForComments(
  tx: Tx,
  commentIds: readonly string[],
) {
  const lockedCommentIds = await lockCommentDeletionTargets(tx, commentIds);
  await rejectPendingActivityBonuses(tx, { commentIds: lockedCommentIds });
  return lockedCommentIds;
}

export async function lockAndRejectPendingBonusesForSessions(
  tx: Tx,
  sessionIds: readonly string[],
) {
  const targets = await lockSessionDeletionTargets(tx, sessionIds);
  if (!targets.stable) return targets;
  await rejectPendingActivityBonuses(tx, {
    sessionIds: targets.sessions.map(({ id }) => id),
  });
  return targets;
}
