import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { deleteStudentAccountData, deleteTeacherAccountData } from "@/lib/account-deletion";

function createTransaction() {
  const tx = {
    pointLog: { deleteMany: vi.fn(), updateMany: vi.fn() },
    gameRoomSettlement: { findUnique: vi.fn() },
    practiceAttempt: { deleteMany: vi.fn() },
    questionLike: { deleteMany: vi.fn() },
    sessionAnalysis: { deleteMany: vi.fn() },
    comment: { findMany: vi.fn(), deleteMany: vi.fn() },
    question: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    translation: { deleteMany: vi.fn() },
    questionSession: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    gameRoom: { findMany: vi.fn(), delete: vi.fn() },
    appNotification: { deleteMany: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn() },
    questionGameCustom: { deleteMany: vi.fn() },
    questionGameVisibility: { deleteMany: vi.fn() },
    questionGameOrder: { deleteMany: vi.fn() },
    practiceCustomItem: { deleteMany: vi.fn() },
    unitDesign: { deleteMany: vi.fn() },
    teacherClass: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), delete: vi.fn() },
    $queryRaw: vi.fn(),
  };

  tx.questionSession.findMany.mockResolvedValue([]);
  tx.question.findMany.mockResolvedValue([]);
  tx.comment.findMany.mockResolvedValue([]);
  tx.gameRoom.findMany.mockResolvedValue([]);
  tx.$queryRaw.mockResolvedValue([]);
  tx.pointLog.deleteMany.mockResolvedValue({ count: 0 });
  tx.pointLog.updateMany.mockResolvedValue({ count: 0 });
  tx.gameRoomSettlement.findUnique.mockResolvedValue(null);
  tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "teacher-1"
      ? {
          id: "teacher-1",
          role: "TEACHER",
          school: "별빛초",
          teacherClasses: [],
        }
      : {
          id: where.id,
          role: "STUDENT",
          school: "별빛초",
          grade: "3",
          className: "1",
        }
  );
  return tx;
}

function sqlText(query: { strings?: readonly string[]; sql?: string }) {
  if (Array.isArray(query)) return query.join("?");
  return query.strings?.join("?") ?? query.sql ?? "";
}

describe("계정 삭제 중 점수 장부 보존", () => {
  let tx: ReturnType<typeof createTransaction>;

  beforeEach(() => {
    tx = createTransaction();
  });

  it("학생 계정을 지울 때 본인 장부만 지우고 다른 학생의 답변 장부는 보존한다", async () => {
    tx.comment.findMany
      .mockResolvedValueOnce([{ id: "own-comment", questionId: "friend-question" }])
      .mockResolvedValueOnce([{ id: "friend-comment" }]);
    tx.question.findMany.mockResolvedValue([{ id: "own-question" }]);
    tx.$queryRaw.mockImplementation(async (
      query: { strings?: readonly string[]; sql?: string },
      lockKey?: unknown,
    ) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) return [{ id: "friend-question" }, { id: "own-question" }];
      if (sql.includes('FROM "comments"')) return [{ id: "friend-comment" }, { id: "own-comment" }];
      if (sql.includes('FROM "users"')) return [{ id: "student-1" }];
      return [];
    });

    await deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    );

    expect(tx.pointLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.pointLog.deleteMany).toHaveBeenCalledWith({ where: { studentId: "student-1" } });
    expect(tx.pointLog.updateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        OR: [
          { relatedQuestionId: { in: ["own-question"] } },
          { relatedCommentId: { in: ["friend-comment", "own-comment"] } },
        ],
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
  });

  it("완료 당시 참가한 학생의 실행 지급 장부가 없으면 계정과 방을 보존한다", async () => {
    const completedRoom = {
      code: "1234",
      gameId: "dice",
      hostId: "student-2",
      status: "ended",
      players: [
        { id: "student-2", name: "친구", isHost: true, joinedAt: 2 },
      ],
      pointParticipants: [
        { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
      ],
      topic: "우주",
      chain: [],
      turnIndex: 0,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
        recentCommandIds: [],
      },
      version: 5,
      createdAt: 100,
      updatedAt: 200,
      playId: "00000000-0000-4000-8000-000000000004",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: completedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) =>
      sqlText(query).includes('FROM "game_rooms"') ? [{ data: completedRoom }] : []
    );

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.gameRoomSettlement.findUnique).toHaveBeenCalledWith({
      where: {
        gameId_awardKey: {
          gameId: "dice",
          awardKey: "room:1234:100:00000000-0000-4000-8000-000000000004",
        },
      },
      select: { outcome: true },
    });
    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.pointLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it.each(["AWARDED", "NO_ELIGIBLE_STUDENTS"])(
    "%s 정산 영수증이 있으면 떠난 참가자 계정과 완료 방을 함께 삭제한다",
    async (outcome) => {
      const completedRoom = {
        code: "1234",
        gameId: "dice",
        hostId: "student-2",
        status: "ended",
        players: [
          { id: "student-2", name: "친구", isHost: true, joinedAt: 2 },
        ],
        pointParticipants: [
          { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
          { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
        ],
        topic: "우주",
        chain: [],
        turnIndex: 0,
        gameState: {
          stateVersion: 2,
          phase: "done",
          endReason: "completed",
          recentCommandIds: [],
        },
        version: 5,
        createdAt: 100,
        updatedAt: 200,
        playId: "00000000-0000-4000-8000-000000000004",
        pointAwardKeyVersion: 2,
        pointEvidenceVersion: 2,
      };
      tx.gameRoom.findMany.mockResolvedValue([{
        code: "1234",
        data: completedRoom,
      }]);
      tx.gameRoomSettlement.findUnique.mockResolvedValue({ outcome });
      tx.$queryRaw.mockImplementation(async (query: {
        strings?: readonly string[];
        sql?: string;
        values?: unknown[];
      }) => {
        const sql = sqlText(query);
        if (sql.includes('FROM "game_rooms"')) return [{ data: completedRoom }];
        if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
        if (sql.includes('FROM "teacher_classes"')) return [];
        if (sql.includes('FROM "users"')) {
          return [{
            id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1",
          }];
        }
        return [];
      });

      await deleteStudentAccountData(
        tx as unknown as Prisma.TransactionClient,
        "student-1",
        "teacher-1",
      );

      expect(tx.gameRoomSettlement.findUnique).toHaveBeenCalledOnce();
      expect(tx.gameRoom.delete).toHaveBeenCalledWith({ where: { code: "1234" } });
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "student-1" } });
    },
  );

  it("상태 버전이 빠지고 점수 버전 표지만 남은 완료 방 참가자의 계정도 보존한다", async () => {
    const damagedCompletedRoom = {
      code: "1234",
      gameId: "dice",
      hostId: "student-2",
      status: "ended",
      players: [
        { id: "student-2", name: "친구", isHost: true, joinedAt: 2 },
      ],
      pointParticipants: [
        { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
      ],
      topic: "우주",
      chain: [],
      turnIndex: 0,
      gameState: {
        phase: "done",
        endReason: "completed",
        recentCommandIds: [],
      },
      version: 5,
      createdAt: 100,
      updatedAt: 200,
      playId: "00000000-0000-4000-8000-000000000004",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: damagedCompletedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) return [{ data: damagedCompletedRoom }];
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{ id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1" }];
      }
      return [];
    });

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.gameRoomSettlement.findUnique).not.toHaveBeenCalled();
    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.pointLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("대기 방을 읽은 뒤 잠금 대기 중 완료된 미지급 방은 최신 자료로 다시 검사해 보존한다", async () => {
    const waitingRoom = {
      code: "1234",
      gameId: "dice",
      hostId: "student-1",
      status: "waiting",
      players: [
        { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
      ],
      topic: "",
      chain: [],
      turnIndex: 0,
      gameState: {},
      version: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    const completedRoom = {
      ...waitingRoom,
      status: "ended",
      players: [
        { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
      ],
      pointParticipants: [
        { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
      ],
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
        recentCommandIds: [],
      },
      version: 9,
      updatedAt: 200,
      playId: "00000000-0000-4000-8000-000000000009",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    };
    tx.gameRoom.findMany.mockResolvedValue([{ code: "1234", data: waitingRoom }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) return [{ data: completedRoom }];
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{ id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1" }];
      }
      return [];
    });

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    const roomLock = tx.$queryRaw.mock.calls.find(([query]) =>
      sqlText(query).includes('FROM "game_rooms"')
    );
    expect(sqlText(roomLock?.[0])).toContain("FOR UPDATE");
    expect(tx.gameRoomSettlement.findUnique).toHaveBeenCalledWith({
      where: {
        gameId_awardKey: {
          gameId: "dice",
          awardKey: "room:1234:100:00000000-0000-4000-8000-000000000009",
        },
      },
      select: { outcome: true },
    });
    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("잠근 최신 방 자료를 해석할 수 없으면 계정과 방을 보존한다", async () => {
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: {
        code: "1234",
        gameId: "dice",
        hostId: "student-1",
        status: "waiting",
        players: [{ id: "student-1", name: "학생", isHost: true, joinedAt: 1 }],
        topic: "",
        chain: [],
        turnIndex: 0,
        gameState: {},
        version: 1,
        createdAt: 100,
        updatedAt: 100,
      },
    }]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) =>
      sqlText(query).includes('FROM "game_rooms"') ? [{ data: { broken: true } }] : []
    );

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("처음부터 손상된 대기 방의 참가자 자리에 사용자 식별값이 있고 잠근 자료가 같으면 함께 삭제한다", async () => {
    const damagedRoom = {
      code: "1234",
      status: "waiting",
      hostId: "student-1",
      players: [{ id: "student-1", name: "학생" }],
      broken: true,
    };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: damagedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) {
        return [{ data: structuredClone(damagedRoom) }];
      }
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{
          id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1",
        }];
      }
      return [];
    });

    await deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    );

    expect(tx.gameRoom.delete).toHaveBeenCalledWith({ where: { code: "1234" } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "student-1" } });
  });

  it("손상된 방의 비참가자 자리에만 사용자 식별값이 있으면 방은 건드리지 않는다", async () => {
    const damagedRoom = {
      code: "1234",
      status: "waiting",
      hostId: "student-2",
      players: [{ id: "student-2", name: "student-1" }],
      topic: "student-1",
      broken: true,
    };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: damagedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) return [{ data: damagedRoom }];
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{
          id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1",
        }];
      }
      return [];
    });

    await deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    );

    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "student-1" } });
  });

  it("손상된 대기 방 원자료가 잠금 중 바뀌면 방과 계정을 보존한다", async () => {
    const observedRoom = {
      code: "1234",
      status: "waiting",
      hostId: "student-1",
      players: [{ id: "student-1", name: "학생" }],
      topic: "처음",
      broken: true,
    };
    const lockedRoom = { ...observedRoom, topic: "바뀜" };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: observedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) return [{ data: lockedRoom }];
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{
          id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1",
        }];
      }
      return [];
    });

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("파싱할 수 없는 완료 버전 2 후보 방은 미정산 증거와 계정을 보존한다", async () => {
    const damagedCompletedRoom = {
      code: "1234",
      gameId: "dice",
      hostId: "student-2",
      status: "ended",
      players: [{ id: "student-2", name: "친구" }],
      pointParticipants: [
        { id: "student-1", name: "학생" },
        { id: "student-2", name: "친구" },
      ],
      gameState: {
        phase: "done",
        endReason: "completed",
      },
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      broken: true,
    };
    tx.gameRoom.findMany.mockResolvedValue([{
      code: "1234",
      data: damagedCompletedRoom,
    }]);
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "game_rooms"')) {
        return [{ data: damagedCompletedRoom }];
      }
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) {
        return [{
          id: query.values?.includes("teacher-1") ? "teacher-1" : "student-1",
        }];
      }
      return [];
    });

    await expect(deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    )).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.gameRoomSettlement.findUnique).not.toHaveBeenCalled();
    expect(tx.gameRoom.delete).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("교사 계정을 지워도 교사 질문에 답한 학생의 장부는 보존한다", async () => {
    tx.comment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "student-comment" }]);
    tx.question.findMany.mockResolvedValue([{ id: "teacher-question" }]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) return [{ id: "teacher-question" }];
      if (sql.includes('FROM "comments"')) return [{ id: "student-comment" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
      return [];
    });

    await deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1");

    expect(tx.pointLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.pointLog.updateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        OR: [
          { relatedQuestionId: { in: ["teacher-question"] } },
          { relatedCommentId: { in: ["student-comment"] } },
        ],
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
  });

  it("학생 계정 삭제는 질문, 답변, 수업, 학생 순서로 행을 잠근다", async () => {
    const lockOrder: string[] = [];
    tx.question.findMany.mockResolvedValue([{ id: "own-question" }]);
    tx.comment.findMany
      .mockResolvedValueOnce([{ id: "own-comment", questionId: "parent-question" }])
      .mockResolvedValueOnce([{ id: "child-comment" }]);
    tx.questionSession.findMany.mockResolvedValue([{
      id: "session-1",
      targetType: "STUDENT",
      targetStudentId: "student-1",
      targetStudentIds: ["student-1"],
    }]);
    tx.$queryRaw.mockImplementation(async (
      query: { strings?: readonly string[]; sql?: string },
      lockKey?: unknown,
    ) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) {
        lockOrder.push("question");
        return [{ id: "own-question" }, { id: "parent-question" }];
      }
      if (sql.includes('FROM "comments"')) {
        lockOrder.push("comment");
        return [{ id: "child-comment" }, { id: "own-comment" }];
      }
      if (sql.includes('FROM "question_sessions"')) {
        lockOrder.push("session");
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        lockOrder.push(
          typeof lockKey === "string" && lockKey.startsWith("account-lifecycle:")
            ? "lifecycle"
            : "advisory",
        );
        return [{ lock: "" }];
      }
      if (sql.includes('FROM "teacher_classes"')) {
        lockOrder.push("class");
        return [];
      }
      if (sql.includes('FROM "users"')) {
        const values = (query as { values?: unknown[] }).values ?? [];
        const userType = values.includes("teacher-1") ? "teacher" : "student";
        lockOrder.push(userType);
        return [{ id: userType === "teacher" ? "teacher-1" : "student-1" }];
      }
      return [];
    });

    await deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    );

    expect(lockOrder).toEqual([
      "lifecycle",
      "question",
      "comment",
      "session",
      "advisory",
      "advisory",
      "teacher",
      "class",
      "student",
    ]);
    expect(tx.pointLog.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.$queryRaw.mock.invocationCallOrder.at(-1)!,
    );
    expect(tx.pointLog.deleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.$queryRaw.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("학생 계정 삭제는 수업 잠금 뒤 현재 대상 목록에서 학생만 제거한다", async () => {
    tx.questionSession.findMany
      .mockResolvedValueOnce([{
        id: "session-1",
        targetType: "STUDENT",
        targetStudentId: "student-1",
        targetStudentIds: ["student-1", "student-2"],
      }])
      .mockResolvedValueOnce([{
        id: "session-1",
        targetType: "CUSTOM",
        targetStudentId: "student-3",
        targetStudentIds: ["student-1", "student-2", "student-3"],
      }]);
    tx.$queryRaw.mockImplementation(async (
      query: { strings?: readonly string[]; sql?: string },
      lockKey?: unknown,
    ) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "question_sessions"')) {
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "users"')) return [{ id: "student-1" }];
      return [];
    });

    await deleteStudentAccountData(
      tx as unknown as Prisma.TransactionClient,
      "student-1",
      "teacher-1",
    );

    expect(tx.questionSession.findMany).toHaveBeenCalledTimes(2);
    expect(tx.questionSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        targetStudentId: "student-3",
        targetStudentIds: ["student-2", "student-3"],
      },
    });
  });

  it("학생 잠금 전 담당 교사의 현재 학교 범위가 바뀌면 계정과 장부를 삭제하지 않는다", async () => {
    tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "teacher-1"
        ? { role: "TEACHER", school: "다른학교", teacherClasses: [] }
        : {
            id: "student-1",
            role: "STUDENT",
            school: "별빛초",
            grade: "3",
            className: "1",
          }
    );
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }, { id: "student-1" }];
      return [];
    });

    await expect(
      deleteStudentAccountData(
        tx as unknown as Prisma.TransactionClient,
        "student-1",
        "teacher-1",
      ),
    ).rejects.toMatchObject({ name: "AccountDeletionForbiddenError", status: 403 });

    expect(tx.pointLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("교사 계정 삭제는 질문, 답변, 수업, 교사, 학급 순서로 행을 잠근다", async () => {
    const lockOrder: string[] = [];
    tx.questionSession.findMany.mockResolvedValue([{ id: "session-1" }]);
    tx.question.findMany
      .mockResolvedValueOnce([{ id: "session-question" }])
      .mockResolvedValueOnce([{ id: "teacher-question" }]);
    tx.comment.findMany
      .mockResolvedValueOnce([{ id: "teacher-comment", questionId: "parent-question" }])
      .mockResolvedValueOnce([{ id: "student-comment" }]);
    tx.$queryRaw.mockImplementation(async (
      query: { strings?: readonly string[]; sql?: string },
      lockKey?: unknown,
    ) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) {
        lockOrder.push("question");
        return [
          { id: "parent-question" },
          { id: "session-question" },
          { id: "teacher-question" },
        ];
      }
      if (sql.includes('FROM "comments"')) {
        lockOrder.push("comment");
        return [{ id: "student-comment" }, { id: "teacher-comment" }];
      }
      if (sql.includes('FROM "question_sessions"')) {
        lockOrder.push("session");
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        lockOrder.push(
          typeof lockKey === "string" && lockKey.startsWith("account-lifecycle:")
            ? "lifecycle"
            : "advisory",
        );
        return [{ lock: "" }];
      }
      if (sql.includes('FROM "users"')) {
        lockOrder.push("teacher");
        return [{ id: "teacher-1" }];
      }
      if (sql.includes('FROM "teacher_classes"')) {
        lockOrder.push("class");
        return [{ id: "class-1" }];
      }
      return [];
    });

    await deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1");

    expect(lockOrder).toEqual([
      "lifecycle",
      "question",
      "comment",
      "session",
      "advisory",
      "teacher",
      "class",
    ]);
    expect(tx.pointLog.updateMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.$queryRaw.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("거래에서 잠근 교사의 현재 역할이 바뀌면 자기 계정을 보존한다", async () => {
    tx.user.findUnique.mockResolvedValue({
      id: "teacher-1",
      role: "STUDENT",
    });
    tx.$queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
    }) => {
      const sql = sqlText(query);
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
      return [];
    });

    await expect(
      deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1"),
    ).rejects.toMatchObject({ name: "AccountDeletionForbiddenError", status: 403 });

    expect(tx.pointLog.updateMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("교사 수업을 지울 때 장부의 수업 연결을 먼저 끊고 질문을 분리한다", async () => {
    tx.questionSession.findMany.mockResolvedValue([{ id: "session-1" }]);
    tx.comment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    tx.question.findMany
      .mockResolvedValueOnce([{ id: "session-question" }])
      .mockResolvedValueOnce([]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) return [{ id: "session-question" }];
      if (sql.includes('FROM "question_sessions"')) {
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
      return [];
    });

    await deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1");

    expect(tx.pointLog.updateMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ["session-1"] } },
      data: { sessionId: null },
    });
    expect(tx.pointLog.updateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        sessionId: { in: ["session-1"] },
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
    expect(tx.question.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["session-question"] } },
      data: { sessionId: null },
    });
    expect(tx.pointLog.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.question.updateMany.mock.invocationCallOrder[0],
    );
  });

  it("수업 잠금 직전에 새 질문이 들어오면 교사 계정 삭제를 쓰기 전에 중단한다", async () => {
    tx.questionSession.findMany.mockResolvedValue([{ id: "session-1" }]);
    tx.question.findMany
      .mockResolvedValueOnce([{ id: "session-question" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "late-question" },
        { id: "session-question" },
      ]);
    tx.comment.findMany.mockResolvedValue([]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "questions"')) return [{ id: "session-question" }];
      if (sql.includes('FROM "question_sessions"')) {
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      return [];
    });

    await expect(
      deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1"),
    ).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.pointLog.updateMany).not.toHaveBeenCalled();
    expect(tx.questionSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("사용자 잠금 직전에 새 교사 수업이 들어오면 계정 삭제 거래를 중단한다", async () => {
    tx.questionSession.findMany
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ id: "late-session" }, { id: "session-1" }]);
    tx.question.findMany.mockResolvedValue([]);
    tx.comment.findMany.mockResolvedValue([]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes('FROM "question_sessions"')) {
        return [{ id: "session-1", teacherId: "teacher-1" }];
      }
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      return [];
    });

    await expect(
      deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1"),
    ).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.pointLog.updateMany).not.toHaveBeenCalled();
    expect(tx.questionSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("사용자 잠금 직전에 새 작성 질문이 들어오면 계정 삭제 거래를 중단한다", async () => {
    tx.question.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "late-question" }]);
    tx.comment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    tx.$queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = sqlText(query);
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      return [];
    });

    await expect(
      deleteTeacherAccountData(tx as unknown as Prisma.TransactionClient, "teacher-1"),
    ).rejects.toMatchObject({ name: "AccountDeletionConflictError", status: 409 });

    expect(tx.pointLog.updateMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});
