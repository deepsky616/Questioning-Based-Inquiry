import { Prisma } from "@prisma/client";
import { parseGameRoom } from "@/lib/question-games-data";

type Tx = Prisma.TransactionClient;

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function deleteQuestionRows(tx: Tx, questionIds: string[]) {
  if (questionIds.length === 0) return;

  const comments = await tx.comment.findMany({
    where: { questionId: { in: questionIds } },
    select: { id: true },
  });
  const commentIds = comments.map((comment) => comment.id);

  await tx.translation.deleteMany({
    where: {
      OR: [
        { sourceType: "QUESTION", sourceId: { in: questionIds } },
        ...(commentIds.length > 0 ? [{ sourceType: "COMMENT", sourceId: { in: commentIds } }] : []),
      ],
    },
  });

  await tx.pointLog.deleteMany({
    where: {
      OR: [
        { relatedQuestionId: { in: questionIds } },
        ...(commentIds.length > 0 ? [{ relatedCommentId: { in: commentIds } }] : []),
      ],
    },
  });
  await tx.questionLike.deleteMany({ where: { questionId: { in: questionIds } } });
  await tx.comment.deleteMany({ where: { questionId: { in: questionIds } } });
  await tx.question.deleteMany({ where: { id: { in: questionIds } } });
}

async function deleteAuthoredComments(tx: Tx, userId: string) {
  const comments = await tx.comment.findMany({
    where: { authorId: userId },
    select: { id: true },
  });
  const commentIds = comments.map((comment) => comment.id);
  if (commentIds.length === 0) return;

  await tx.translation.deleteMany({ where: { sourceType: "COMMENT", sourceId: { in: commentIds } } });
  await tx.pointLog.deleteMany({ where: { relatedCommentId: { in: commentIds } } });
  await tx.comment.deleteMany({ where: { id: { in: commentIds } } });
}

async function deleteAuthoredQuestions(tx: Tx, userId: string) {
  const questions = await tx.question.findMany({
    where: { authorId: userId },
    select: { id: true },
  });
  await deleteQuestionRows(tx, questions.map((question) => question.id));
}

async function removeStudentFromSessionTargets(tx: Tx, studentId: string) {
  const sessions = await tx.questionSession.findMany({
    where: {
      OR: [
        { targetStudentId: studentId },
        { targetType: { in: ["STUDENT", "CUSTOM", "CLASS"] } },
      ],
    },
    select: {
      id: true,
      targetType: true,
      targetStudentId: true,
      targetStudentIds: true,
    },
  });

  for (const session of sessions) {
    const targetStudentIds = jsonStringArray(session.targetStudentIds);
    const nextTargetStudentIds = targetStudentIds.filter((id) => id !== studentId);
    const targetStudentId = session.targetStudentId === studentId ? null : session.targetStudentId;

    if (targetStudentId === session.targetStudentId && nextTargetStudentIds.length === targetStudentIds.length) {
      continue;
    }

    await tx.questionSession.update({
      where: { id: session.id },
      data: {
        targetStudentId,
        targetStudentIds: nextTargetStudentIds as Prisma.InputJsonValue,
        ...(session.targetType === "STUDENT" && !targetStudentId && nextTargetStudentIds.length === 0
          ? { targetType: "CUSTOM" }
          : {}),
      },
    });
  }
}

async function removeUserFromGameRooms(tx: Tx, userId: string) {
  const rooms = await tx.gameRoom.findMany({ select: { code: true, data: true } });

  for (const row of rooms) {
    const room = parseGameRoom(row.data);
    if (!room || !room.players.some((player) => player.id === userId)) continue;
    await tx.gameRoom.delete({ where: { code: row.code } });
  }
}

export async function deleteStudentAccountData(tx: Tx, studentId: string) {
  await tx.pointLog.deleteMany({ where: { studentId } });
  await tx.practiceAttempt.deleteMany({ where: { studentId } });
  await tx.questionLike.deleteMany({ where: { userId: studentId } });
  await tx.sessionAnalysis.deleteMany({ where: { studentId } });
  await deleteAuthoredComments(tx, studentId);
  await deleteAuthoredQuestions(tx, studentId);
  await removeStudentFromSessionTargets(tx, studentId);
  await removeUserFromGameRooms(tx, studentId);
  await tx.appNotification.deleteMany({
    where: { OR: [{ recipientId: studentId }, { senderId: studentId }] },
  });
  await tx.passwordResetToken.deleteMany({ where: { userId: studentId } });
  await tx.user.delete({ where: { id: studentId } });
}

export async function deleteTeacherAccountData(tx: Tx, teacherId: string) {
  const sessions = await tx.questionSession.findMany({
    where: { teacherId },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length > 0) {
    await tx.sessionAnalysis.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.appNotification.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.pointLog.updateMany({ where: { sessionId: { in: sessionIds } }, data: { sessionId: null } });
    await tx.question.updateMany({ where: { sessionId: { in: sessionIds } }, data: { sessionId: null } });
    await tx.questionSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  await tx.pointLog.updateMany({ where: { awardedById: teacherId }, data: { awardedById: null } });
  await tx.pointLog.updateMany({ where: { decidedById: teacherId }, data: { decidedById: null } });
  await tx.questionGameCustom.deleteMany({ where: { teacherId } });
  await tx.questionGameVisibility.deleteMany({ where: { teacherId } });
  await tx.questionGameOrder.deleteMany({ where: { teacherId } });
  await tx.practiceCustomItem.deleteMany({ where: { teacherId } });
  await tx.unitDesign.deleteMany({ where: { teacherId } });
  await tx.teacherClass.deleteMany({ where: { teacherId } });
  await deleteAuthoredComments(tx, teacherId);
  await deleteAuthoredQuestions(tx, teacherId);
  await removeUserFromGameRooms(tx, teacherId);
  await tx.appNotification.deleteMany({
    where: { OR: [{ recipientId: teacherId }, { senderId: teacherId }] },
  });
  await tx.passwordResetToken.deleteMany({ where: { userId: teacherId } });
  await tx.user.delete({ where: { id: teacherId } });
}
