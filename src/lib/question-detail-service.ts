import { prisma } from "@/lib/db";

const STUDENT_EDIT_REACTION_BLOCK_MESSAGE =
  "좋아요나 댓글이 달린 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const STUDENT_EDIT_POINT_BLOCK_MESSAGE =
  "포인트가 지급된 질문은 수정할 수 없어요. 선생님께 요청해 주세요.";
const STUDENT_DELETE_REACTION_BLOCK_MESSAGE =
  "좋아요·댓글·포인트가 달린 질문은 삭제할 수 없어요. 선생님께 요청해 주세요.";

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
