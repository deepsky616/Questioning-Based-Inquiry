import { Prisma } from "@prisma/client";
import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";
import {
  lockPointIntegrityCommentRows,
  lockPointIntegrityQuestionRows,
  lockPointIntegritySessionRows,
  lockPointIntegrityTeacherClassRows,
  lockPointIntegrityUserRows,
  rejectPendingActivityBonuses,
} from "@/lib/pending-activity-bonus-cleanup";
import {
  parseGameRoom,
  pointParticipantsForRoom,
} from "@/lib/question-games-data";
import { lockPointUserTransactions } from "@/lib/point-user-transaction-lock";
import {
  hasSettledQuestionGameRoomAward,
  isCompletedVersion2QuestionGameRoomCandidate,
} from "@/lib/question-game-room-award-ledger";

type Tx = Prisma.TransactionClient;

type StudentSessionTarget = {
  id: string;
  targetType: string;
  targetStudentId: string | null;
  targetStudentIds: unknown;
};

type ContentDeletionTargets = {
  questionIds: string[];
  commentIds: string[];
  lockedQuestionIds: string[];
};

export class AccountDeletionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("계정 활동 내용이 바뀌었습니다. 다시 시도해 주세요");
    this.name = "AccountDeletionConflictError";
  }
}

export class AccountDeletionForbiddenError extends Error {
  readonly status = 403;

  constructor() {
    super("현재 담당 학생만 삭제할 수 있습니다");
    this.name = "AccountDeletionForbiddenError";
  }
}

function sortedUnique(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.length > 0))).sort();
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonArrayHasParticipantId(value: unknown, userId: string) {
  return Array.isArray(value) && value.some((item) =>
    isJsonRecord(item) && item.id === userId
  );
}

function rawGameRoomHasParticipant(value: unknown, userId: string) {
  if (!isJsonRecord(value)) return false;
  return value.hostId === userId ||
    jsonArrayHasParticipantId(value.players, userId) ||
    jsonArrayHasParticipantId(value.pointParticipants, userId);
}

function isRawCompletedVersion2Candidate(value: unknown) {
  if (!isJsonRecord(value) || !isJsonRecord(value.gameState)) return false;
  return value.status === "ended" &&
    value.gameState.phase === "done" &&
    value.gameState.endReason === "completed" &&
    (
      value.gameState.stateVersion === 2 ||
      value.pointEvidenceVersion === 2 ||
      value.pointAwardKeyVersion === 2
    );
}

function isSameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameJsonValue(item, right[index]));
  }
  if (!isJsonRecord(left) || !isJsonRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) =>
      key === rightKeys[index] && isSameJsonValue(left[key], right[key])
    );
}

function sessionTargetsStudent(session: StudentSessionTarget, studentId: string) {
  return session.targetStudentId === studentId ||
    jsonStringArray(session.targetStudentIds).includes(studentId);
}

async function lockAccountContentDeletionTargets(
  tx: Tx,
  userId: string,
  additionalQuestionIds: readonly string[] = [],
): Promise<ContentDeletionTargets> {
  const authoredQuestions = await tx.question.findMany({
    where: { authorId: userId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const authoredComments = await tx.comment.findMany({
    where: { authorId: userId },
    select: { id: true, questionId: true },
    orderBy: { id: "asc" },
  });

  const authoredQuestionIds = sortedUnique(authoredQuestions.map(({ id }) => id));
  const questionLockIds = sortedUnique([
    ...additionalQuestionIds,
    ...authoredQuestionIds,
    ...authoredComments.map(({ questionId }) => questionId),
  ]);
  const lockedQuestions = await lockPointIntegrityQuestionRows(tx, questionLockIds);
  const lockedQuestionIds = lockedQuestions.map(({ id }) => id).sort();
  const lockedQuestionIdSet = new Set(lockedQuestionIds);
  const lockedAuthoredQuestionIds = authoredQuestionIds.filter((id) => lockedQuestionIdSet.has(id));

  // 질문 행을 먼저 잠그면 그 질문에 새 답변이 붙는 동안의 삭제 누락을 막을 수 있다.
  const childComments = lockedAuthoredQuestionIds.length === 0
    ? []
    : await tx.comment.findMany({
        where: { questionId: { in: lockedAuthoredQuestionIds } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
  const commentLockIds = sortedUnique([
    ...authoredComments.map(({ id }) => id),
    ...childComments.map(({ id }) => id),
  ]);
  const lockedComments = await lockPointIntegrityCommentRows(tx, commentLockIds);

  return {
    questionIds: lockedAuthoredQuestionIds,
    commentIds: lockedComments.map(({ id }) => id).sort(),
    lockedQuestionIds,
  };
}

async function deleteContentRows(tx: Tx, targets: ContentDeletionTargets) {
  const { questionIds, commentIds } = targets;
  if (questionIds.length === 0 && commentIds.length === 0) return;

  await tx.translation.deleteMany({
    where: {
      OR: [
        ...(questionIds.length > 0
          ? [{ sourceType: "QUESTION", sourceId: { in: questionIds } }]
          : []),
        ...(commentIds.length > 0
          ? [{ sourceType: "COMMENT", sourceId: { in: commentIds } }]
          : []),
      ],
    },
  });

  if (questionIds.length > 0) {
    await tx.questionLike.deleteMany({ where: { questionId: { in: questionIds } } });
  }
  if (commentIds.length > 0) {
    await tx.comment.deleteMany({ where: { id: { in: commentIds } } });
  }
  if (questionIds.length > 0) {
    await tx.question.deleteMany({ where: { id: { in: questionIds } } });
  }
}

async function assertAuthoredContentTargetsStable(
  tx: Tx,
  userId: string,
  targets: ContentDeletionTargets,
) {
  const currentQuestions = await tx.question.findMany({
    where: { authorId: userId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const currentComments = await tx.comment.findMany({
    where: { authorId: userId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const lockedQuestionIds = new Set(targets.questionIds);
  const lockedCommentIds = new Set(targets.commentIds);
  if (
    currentQuestions.some(({ id }) => !lockedQuestionIds.has(id)) ||
    currentComments.some(({ id }) => !lockedCommentIds.has(id))
  ) {
    throw new AccountDeletionConflictError();
  }
}

async function loadStudentSessionTargets(tx: Tx, studentId: string) {
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
    orderBy: { id: "asc" },
  });

  return sessions.filter((session) => sessionTargetsStudent(session, studentId));
}

async function loadLockedStudentSessionTargets(
  tx: Tx,
  studentId: string,
  sessionIds: readonly string[],
) {
  const ids = sortedUnique(sessionIds);
  if (ids.length === 0) return [];
  const sessions = await tx.questionSession.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      targetType: true,
      targetStudentId: true,
      targetStudentIds: true,
    },
    orderBy: { id: "asc" },
  });
  return sessions.filter((session) => sessionTargetsStudent(session, studentId));
}

async function removeStudentFromSessionTargets(
  tx: Tx,
  studentId: string,
  sessions: readonly StudentSessionTarget[],
) {
  for (const session of sessions) {
    const targetStudentIds = jsonStringArray(session.targetStudentIds);
    const nextTargetStudentIds = targetStudentIds.filter((id) => id !== studentId);
    const targetStudentId = session.targetStudentId === studentId ? null : session.targetStudentId;

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
  const rooms = await tx.gameRoom.findMany({
    select: { code: true, data: true },
    orderBy: { code: "asc" },
  });

  for (const row of rooms) {
    const observedRoom = parseGameRoom(row.data);
    const wasObservedParticipant = observedRoom
      ? observedRoom.players.some((player) => player.id === userId) ||
        pointParticipantsForRoom(observedRoom).some((player) => player.id === userId)
      : rawGameRoomHasParticipant(row.data, userId);
    if (!wasObservedParticipant) continue;

    const lockedRows = await tx.$queryRaw<Array<{ data: Prisma.JsonValue }>>`
      SELECT "data"
      FROM "game_rooms"
      WHERE "code" = ${row.code}
      FOR UPDATE
    `;
    if (lockedRows.length === 0) continue;
    const lockedData = lockedRows[0]?.data;
    if (!observedRoom && !isSameJsonValue(row.data, lockedData)) {
      throw new AccountDeletionConflictError();
    }
    const room = parseGameRoom(lockedData);
    if (!room) {
      if (observedRoom) throw new AccountDeletionConflictError();
      if (
        !rawGameRoomHasParticipant(lockedData, userId) ||
        isRawCompletedVersion2Candidate(lockedData) ||
        !isJsonRecord(lockedData) ||
        lockedData.code !== row.code ||
        lockedData.status !== "waiting"
      ) {
        throw new AccountDeletionConflictError();
      }
      await tx.gameRoom.delete({ where: { code: row.code } });
      continue;
    }
    if (room.code !== row.code) {
      throw new AccountDeletionConflictError();
    }
    const isCurrentParticipant = room.players.some((player) => player.id === userId);
    const wasCompletionParticipant = pointParticipantsForRoom(room).some(
      (player) => player.id === userId,
    );
    if (!isCurrentParticipant && !wasCompletionParticipant) continue;
    if (
      isCompletedVersion2QuestionGameRoomCandidate(room) &&
      wasCompletionParticipant
    ) {
      if (!await hasSettledQuestionGameRoomAward(tx, room)) {
        throw new AccountDeletionConflictError();
      }
      await tx.gameRoom.delete({ where: { code: row.code } });
      continue;
    }
    if (!isCurrentParticipant) continue;
    await tx.gameRoom.delete({ where: { code: row.code } });
  }
}

export async function deleteStudentAccountData(
  tx: Tx,
  studentId: string,
  teacherId: string,
) {
  await lockAccountLifecycles(tx, [studentId]);
  const sessionTargets = await loadStudentSessionTargets(tx, studentId);
  const contentTargets = await lockAccountContentDeletionTargets(tx, studentId);
  const lockedSessions = await lockPointIntegritySessionRows(
    tx,
    sessionTargets.map(({ id }) => id),
  );
  const currentSessionTargets = await loadLockedStudentSessionTargets(
    tx,
    studentId,
    lockedSessions.map(({ id }) => id),
  );

  // 질문놀이 지급도 방 잠금 뒤 사용자 행을 잠그므로 같은 순서를 지킨다.
  await removeUserFromGameRooms(tx, studentId);
  await lockPointUserTransactions(tx, [teacherId, studentId]);
  const lockedTeachers = await lockPointIntegrityUserRows(tx, [teacherId]);
  if (lockedTeachers.length === 0) throw new AccountDeletionForbiddenError();
  await lockPointIntegrityTeacherClassRows(tx, [teacherId]);
  const currentTeacher = await tx.user.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      role: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  if (currentTeacher?.role !== "TEACHER" || !currentTeacher.school) {
    throw new AccountDeletionForbiddenError();
  }
  const lockedStudents = await lockPointIntegrityUserRows(tx, [studentId]);
  if (lockedStudents.length === 0) throw new AccountDeletionConflictError();
  const currentStudent = await tx.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      school: true,
      grade: true,
      className: true,
    },
  });
  if (
    !currentStudent ||
    currentStudent.role !== "STUDENT" ||
    currentStudent.school !== currentTeacher.school
  ) {
    throw new AccountDeletionForbiddenError();
  }
  const inCurrentClass = currentTeacher.teacherClasses.length === 0 ||
    currentTeacher.teacherClasses.some(
      (item) => item.grade === currentStudent.grade && item.className === currentStudent.className,
    );
  if (!inCurrentClass) throw new AccountDeletionForbiddenError();
  await assertAuthoredContentTargetsStable(tx, studentId, contentTargets);

  await rejectPendingActivityBonuses(tx, {
    questionIds: contentTargets.questionIds,
    commentIds: contentTargets.commentIds,
  });
  await tx.pointLog.deleteMany({ where: { studentId } });
  await tx.practiceAttempt.deleteMany({ where: { studentId } });
  await tx.questionLike.deleteMany({ where: { userId: studentId } });
  await tx.sessionAnalysis.deleteMany({ where: { studentId } });
  await removeStudentFromSessionTargets(tx, studentId, currentSessionTargets);
  await deleteContentRows(tx, contentTargets);
  await tx.appNotification.deleteMany({
    where: { OR: [{ recipientId: studentId }, { senderId: studentId }] },
  });
  await tx.passwordResetToken.deleteMany({ where: { userId: studentId } });
  await tx.user.delete({ where: { id: studentId } });
}

export async function deleteTeacherAccountData(tx: Tx, teacherId: string) {
  await lockAccountLifecycles(tx, [teacherId]);
  const sessions = await tx.questionSession.findMany({
    where: { teacherId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const requestedSessionIds = sessions.map(({ id }) => id).sort();
  const sessionQuestions = requestedSessionIds.length === 0
    ? []
    : await tx.question.findMany({
        where: { sessionId: { in: requestedSessionIds } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
  const requestedSessionQuestionIds = sessionQuestions.map(({ id }) => id).sort();
  const contentTargets = await lockAccountContentDeletionTargets(
    tx,
    teacherId,
    requestedSessionQuestionIds,
  );
  const lockedSessions = await lockPointIntegritySessionRows(tx, requestedSessionIds);
  const lockedSessionIds = lockedSessions
    .filter((session) => session.teacherId === teacherId)
    .map(({ id }) => id)
    .sort();
  const lockedQuestionIdSet = new Set(contentTargets.lockedQuestionIds);
  const currentSessionQuestions = lockedSessionIds.length === 0
    ? []
    : await tx.question.findMany({
        where: { sessionId: { in: lockedSessionIds } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
  if (currentSessionQuestions.some(({ id }) => !lockedQuestionIdSet.has(id))) {
    throw new AccountDeletionConflictError();
  }
  const lockedSessionQuestionIds = requestedSessionQuestionIds.filter((id) =>
    lockedQuestionIdSet.has(id)
  );

  await removeUserFromGameRooms(tx, teacherId);
  await lockPointUserTransactions(tx, [teacherId]);
  const lockedTeachers = await lockPointIntegrityUserRows(tx, [teacherId]);
  if (lockedTeachers.length === 0) throw new AccountDeletionForbiddenError();
  const currentTeacher = await tx.user.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });
  if (currentTeacher?.role !== "TEACHER") {
    throw new AccountDeletionForbiddenError();
  }
  await lockPointIntegrityTeacherClassRows(tx, [teacherId]);
  const currentSessions = await tx.questionSession.findMany({
    where: { teacherId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const lockedSessionIdSet = new Set(lockedSessionIds);
  if (currentSessions.some(({ id }) => !lockedSessionIdSet.has(id))) {
    throw new AccountDeletionConflictError();
  }
  await assertAuthoredContentTargetsStable(tx, teacherId, contentTargets);

  if (lockedSessionIds.length > 0) {
    await rejectPendingActivityBonuses(tx, { sessionIds: lockedSessionIds });
  }
  await rejectPendingActivityBonuses(tx, {
    questionIds: contentTargets.questionIds,
    commentIds: contentTargets.commentIds,
  });

  if (lockedSessionIds.length > 0) {
    await tx.sessionAnalysis.deleteMany({ where: { sessionId: { in: lockedSessionIds } } });
    await tx.appNotification.deleteMany({ where: { sessionId: { in: lockedSessionIds } } });
    await tx.pointLog.updateMany({
      where: { sessionId: { in: lockedSessionIds } },
      data: { sessionId: null },
    });
    if (lockedSessionQuestionIds.length > 0) {
      await tx.question.updateMany({
        where: { id: { in: lockedSessionQuestionIds } },
        data: { sessionId: null },
      });
    }
    await tx.questionSession.deleteMany({ where: { id: { in: lockedSessionIds } } });
  }

  await tx.pointLog.updateMany({ where: { awardedById: teacherId }, data: { awardedById: null } });
  await tx.pointLog.updateMany({ where: { decidedById: teacherId }, data: { decidedById: null } });
  await tx.questionGameCustom.deleteMany({ where: { teacherId } });
  await tx.questionGameVisibility.deleteMany({ where: { teacherId } });
  await tx.questionGameOrder.deleteMany({ where: { teacherId } });
  await tx.practiceCustomItem.deleteMany({ where: { teacherId } });
  await tx.unitDesign.deleteMany({ where: { teacherId } });
  await tx.teacherClass.deleteMany({ where: { teacherId } });
  await deleteContentRows(tx, contentTargets);
  await tx.appNotification.deleteMany({
    where: { OR: [{ recipientId: teacherId }, { senderId: teacherId }] },
  });
  await tx.passwordResetToken.deleteMany({ where: { userId: teacherId } });
  await tx.user.delete({ where: { id: teacherId } });
}
