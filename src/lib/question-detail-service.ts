import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canModerateQuestion, canViewQuestion } from "@/lib/content-visibility";
import { canPatchQuestion } from "@/lib/questions";
import {
  lockQuestionDeletionTargets,
  lockPointIntegritySessionRows,
  rejectPendingActivityBonuses,
} from "@/lib/pending-activity-bonus-cleanup";
import { lockCurrentSessionAccessScope } from "@/lib/session-access";
import { studentCanAccessSession } from "@/lib/session-access-policy";

const STUDENT_EDIT_REACTION_BLOCK_MESSAGE =
  "좋아요나 댓글이 달린 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const STUDENT_EDIT_POINT_BLOCK_MESSAGE =
  "포인트가 지급된 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const POINT_ELIGIBLE_STUDENT_QUESTION_EDIT_BLOCK_MESSAGE =
  "포인트 지급 대상 학생 질문의 내용은 수정할 수 없어요.";
const STUDENT_DELETE_REACTION_BLOCK_MESSAGE =
  "좋아요·댓글·포인트가 달린 질문은 삭제할 수 없어요. 선생님께 요청해 주세요.";

type LockedQuestion = {
  id: string;
  authorId: string;
  sessionId: string | null;
  source: string;
  authorRole: string;
};

type TeacherManagementTarget = {
  authorId: string;
  sessionId: string | null;
};

export async function revalidateStudentOwnedMutationAfterLocks(
  tx: Prisma.TransactionClient,
  studentId: string,
  authorId: string,
  sessionId: string | null,
) {
  const access = await lockCurrentSessionAccessScope(tx, {
    viewerId: studentId,
    sessionId,
  });
  if (
    !access?.viewer ||
    access.viewer.role !== "STUDENT" ||
    access.viewer.id !== authorId
  ) {
    return false;
  }
  if (!sessionId) return true;
  return Boolean(
    access.session && studentCanAccessSession(access.session, access.viewer),
  );
}

export async function revalidateTeacherQuestionManagementAfterLocks(
  tx: Prisma.TransactionClient,
  teacherId: string,
  target: TeacherManagementTarget,
) {
  if (target.sessionId) {
    const lockedSessions = await lockPointIntegritySessionRows(tx, [target.sessionId]);
    if (lockedSessions.length !== 1) return false;
  }

  const [teacher] = await tx.$queryRaw<Array<{
    id: string;
    role: string;
    school: string | null;
  }>>(Prisma.sql`
    SELECT "id", "role", "school"
    FROM "users"
    WHERE "id" = ${teacherId}
    ORDER BY "id"
    FOR UPDATE
  `);
  if (!teacher || teacher.role !== "TEACHER") return false;

  const teacherClasses = await tx.$queryRaw<Array<{
    id: string;
    grade: string;
    className: string;
  }>>(Prisma.sql`
    SELECT "id", "grade", "class_name" AS "className"
    FROM "teacher_classes"
    WHERE "teacher_id" = ${teacherId}
    ORDER BY "id"
    FOR UPDATE
  `);

  const author = target.authorId === teacherId
    ? {
        id: teacher.id,
        role: teacher.role,
        school: teacher.school,
        grade: null,
        className: null,
      }
    : (await tx.$queryRaw<Array<{
        id: string;
        role: string;
        school: string | null;
        grade: string | null;
        className: string | null;
      }>>(Prisma.sql`
        SELECT "id", "role", "school", "grade", "class_name" AS "className"
        FROM "users"
        WHERE "id" = ${target.authorId}
        ORDER BY "id"
        FOR UPDATE
      `))[0];
  if (!author) return false;

  return canModerateQuestion(
    {
      id: teacher.id,
      role: teacher.role,
      school: teacher.school,
      grade: null,
      className: null,
      teacherClasses: teacherClasses.map(({ grade, className }) => ({ grade, className })),
    },
    {
      isPublic: false,
      authorId: target.authorId,
      author: {
        role: author.role,
        school: author.school,
        grade: author.grade,
        className: author.className,
      },
    },
  );
}

export async function loadQuestionAccessContext(userId: string, questionId: string) {
  const [viewer, question] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        school: true,
        grade: true,
        className: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    }),
    prisma.question.findUnique({
      where: { id: questionId },
      select: {
        authorId: true,
        isPublic: true,
        author: {
          select: {
            role: true,
            school: true,
            grade: true,
            className: true,
          },
        },
        session: {
          select: {
            isActive: true,
            commentsVisibleToPeers: true,
            teacherId: true,
            targetType: true,
            targetGrade: true,
            targetClassName: true,
            targetStudentId: true,
            targetStudentIds: true,
            teacher: {
              select: {
                role: true,
                school: true,
                teacherClasses: { select: { grade: true, className: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  return { viewer, question };
}

export async function canTeacherManageQuestion(teacherId: string, questionId: string) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      author: {
        select: {
          role: true,
          school: true,
          grade: true,
          className: true,
        },
      },
    },
  });

  if (!teacher || !question || question.author.role !== "STUDENT") return false;

  if (teacher.teacherClasses.length > 0) {
    return Boolean(teacher.school && teacher.school === question.author.school) && teacher.teacherClasses.some(
      (teacherClass) =>
        teacherClass.grade === question.author.grade &&
        teacherClass.className === question.author.className,
    );
  }

  return Boolean(teacher.school && teacher.school === question.author.school);
}

export async function canEditQuestionForUser(params: {
  role: string | null | undefined;
  userId: string;
  questionId: string;
  authorId: string;
  fields: string[];
}) {
  if (!canPatchQuestion(params.role, params.userId, params.authorId, params.fields)) {
    return false;
  }
  if (params.role === "TEACHER") {
    return canTeacherManageQuestion(params.userId, params.questionId);
  }
  const access = await loadQuestionAccessContext(params.userId, params.questionId);
  return params.role === "STUDENT" && Boolean(
    access.question && canViewQuestion(access.viewer, access.question),
  );
}

export async function canDeleteQuestionForUser(params: {
  role: string | null | undefined;
  userId: string;
  questionId: string;
  authorId: string;
}) {
  if (params.role === "TEACHER") {
    return canTeacherManageQuestion(params.userId, params.questionId);
  }
  if (params.role !== "STUDENT" || params.authorId !== params.userId) return false;
  const access = await loadQuestionAccessContext(params.userId, params.questionId);
  return Boolean(access.question && canViewQuestion(access.viewer, access.question));
}

export async function getStudentQuestionEditBlockReason(
  questionId: string,
  reactionCounts?: { likes: number; comments: number },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const counts = reactionCounts ?? await (async () => {
    const [likes, comments] = await Promise.all([
      db.questionLike.count({ where: { questionId } }),
      db.comment.count({ where: { questionId } }),
    ]);
    return { likes, comments };
  })();

  if (counts.likes > 0 || counts.comments > 0) {
    return STUDENT_EDIT_REACTION_BLOCK_MESSAGE;
  }

  const pointCount = await db.pointLog.count({ where: { relatedQuestionId: questionId } });
  if (pointCount > 0) {
    return STUDENT_EDIT_POINT_BLOCK_MESSAGE;
  }

  return null;
}

export async function getStudentQuestionDeleteBlockReason(
  questionId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const [likeCount, commentCount, pointCount] = await Promise.all([
    db.questionLike.count({ where: { questionId } }),
    db.comment.count({ where: { questionId } }),
    db.pointLog.count({ where: { relatedQuestionId: questionId } }),
  ]);

  if (likeCount > 0 || commentCount > 0 || pointCount > 0) {
    return STUDENT_DELETE_REACTION_BLOCK_MESSAGE;
  }

  return null;
}

export async function updateQuestionWithGuard(params: {
  questionId: string;
  actorId: string;
  userRole: string | null | undefined;
  contentChanged: boolean;
  data: Prisma.QuestionUncheckedUpdateInput;
}) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<LockedQuestion[]>(
      Prisma.sql`
        SELECT
          q."id",
          q."author_id" AS "authorId",
          q."session_id" AS "sessionId",
          q."source",
          u."role" AS "authorRole"
        FROM "questions" AS q
        JOIN "users" AS u ON u."id" = q."author_id"
        WHERE q."id" = ${params.questionId}
        FOR UPDATE OF q
      `,
    );
    const lockedQuestion = locked[0];
    if (!lockedQuestion) return { state: "MISSING" as const };

    if (
      params.contentChanged &&
      lockedQuestion.authorRole === "STUDENT" &&
      lockedQuestion.sessionId !== null &&
      lockedQuestion.source !== "TEACHER_SHARED"
    ) {
      return {
        state: "BLOCKED" as const,
        error: POINT_ELIGIBLE_STUDENT_QUESTION_EDIT_BLOCK_MESSAGE,
      };
    }

    if (
      params.userRole === "TEACHER" &&
      !(await revalidateTeacherQuestionManagementAfterLocks(tx, params.actorId, {
        authorId: lockedQuestion.authorId,
        sessionId: lockedQuestion.sessionId,
      }))
    ) {
      return { state: "FORBIDDEN" as const };
    }

    if (
      params.userRole === "STUDENT" &&
      !(await revalidateStudentOwnedMutationAfterLocks(
        tx,
        params.actorId,
        lockedQuestion.authorId,
        lockedQuestion.sessionId,
      ))
    ) {
      return { state: "FORBIDDEN" as const };
    }

    if (params.userRole !== "TEACHER" && params.userRole !== "STUDENT") {
      return { state: "FORBIDDEN" as const };
    }

    if (params.contentChanged && params.userRole === "STUDENT") {
      const blockReason = await getStudentQuestionEditBlockReason(params.questionId, undefined, tx);
      if (blockReason) return { state: "BLOCKED" as const, error: blockReason };
    }

    const question = await tx.question.update({
      where: { id: params.questionId },
      data: params.data,
      include: {
        author: {
          select: { id: true, name: true, className: true },
        },
      },
    });
    return { state: "UPDATED" as const, question };
  });
}

export async function deleteQuestionWithGuard(params: {
  questionId: string;
  actorId: string;
  userRole: string | null | undefined;
}) {
  return prisma.$transaction(async (tx) => {
    const targets = await lockQuestionDeletionTargets(tx, [params.questionId]);
    if (targets.questionIds.length === 0) return { state: "MISSING" as const };

    const lockedQuestion = targets.questions[0];
    if (
      params.userRole === "TEACHER" &&
      (!lockedQuestion || !(await revalidateTeacherQuestionManagementAfterLocks(
        tx,
        params.actorId,
        {
          authorId: lockedQuestion.authorId,
          sessionId: lockedQuestion.sessionId,
        },
      )))
    ) {
      return { state: "FORBIDDEN" as const };
    }

    if (
      params.userRole === "STUDENT" &&
      (!lockedQuestion || !(await revalidateStudentOwnedMutationAfterLocks(
        tx,
        params.actorId,
        lockedQuestion.authorId,
        lockedQuestion.sessionId,
      )))
    ) {
      return { state: "FORBIDDEN" as const };
    }

    if (params.userRole !== "TEACHER" && params.userRole !== "STUDENT") {
      return { state: "FORBIDDEN" as const };
    }

    if (params.userRole === "STUDENT") {
      const blockReason = await getStudentQuestionDeleteBlockReason(params.questionId, tx);
      if (blockReason) return { state: "BLOCKED" as const, error: blockReason };
    }

    await rejectPendingActivityBonuses(tx, targets);
    const commentIds = targets.commentIds;
    await tx.translation.deleteMany({
      where: {
        OR: [
          { sourceType: "QUESTION", sourceId: params.questionId },
          ...(commentIds.length > 0
            ? [{ sourceType: "COMMENT", sourceId: { in: commentIds } }]
            : []),
        ],
      },
    });
    await tx.comment.deleteMany({ where: { questionId: params.questionId } });
    await tx.questionLike.deleteMany({ where: { questionId: params.questionId } });
    await tx.question.delete({ where: { id: params.questionId } });
    return { state: "DELETED" as const };
  });
}
