import { prisma } from "@/lib/db";
import { canViewQuestion } from "@/lib/content-visibility";
import { canPatchQuestion } from "@/lib/questions";

const STUDENT_EDIT_REACTION_BLOCK_MESSAGE =
  "좋아요나 댓글이 달린 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const STUDENT_EDIT_POINT_BLOCK_MESSAGE =
  "포인트가 지급된 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const STUDENT_DELETE_REACTION_BLOCK_MESSAGE =
  "좋아요·댓글·포인트가 달린 질문은 삭제할 수 없어요. 선생님께 요청해 주세요.";

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
  reactionCounts: { likes: number; comments: number },
) {
  if (reactionCounts.likes > 0 || reactionCounts.comments > 0) {
    return STUDENT_EDIT_REACTION_BLOCK_MESSAGE;
  }

  const pointCount = await prisma.pointLog.count({ where: { relatedQuestionId: questionId } });
  if (pointCount > 0) {
    return STUDENT_EDIT_POINT_BLOCK_MESSAGE;
  }

  return null;
}

export async function getStudentQuestionDeleteBlockReason(questionId: string) {
  const [likeCount, commentCount, pointCount] = await Promise.all([
    prisma.questionLike.count({ where: { questionId } }),
    prisma.comment.count({ where: { questionId } }),
    prisma.pointLog.count({ where: { relatedQuestionId: questionId } }),
  ]);

  if (likeCount > 0 || commentCount > 0 || pointCount > 0) {
    return STUDENT_DELETE_REACTION_BLOCK_MESSAGE;
  }

  return null;
}
