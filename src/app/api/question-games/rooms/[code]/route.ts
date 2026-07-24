import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import {
  isValidQuestionForm,
  normalizeQuestionActivity,
  RELAY_ACTIVITY_LIMITS,
} from "@/lib/points-policy";
import {
  pointParticipantsForRoom,
  type GameRoom,
  type RoomChainItem,
  type RoomPlayer,
} from "@/lib/question-games-data";
import {
  readRoomCommandResult,
  toPublicGameRoom,
} from "@/lib/question-game-room-response";
import {
  deleteGameRoom,
  deleteGameRoomPresence,
  isStaleRoomAction,
  loadGameRoom,
  loadLockedGameRoom,
  saveGameRoom,
} from "@/lib/game-room-store";
import {
  recordMemoryRoll,
  settleMemoryRollingRoom,
} from "@/lib/memory-room-roll";
import {
  gameAwardResultsMatch,
  isGameAwardResult,
} from "@/lib/game-award-result";
import {
  QuestionGameAwardPublishError,
  loadVerifiedGameAwardResult,
} from "@/lib/question-game-award-publish-service";
import {
  QUESTION_GAME_LIMITS,
  getQuestionGameRule,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";
import {
  applyQuestionGameRoomCommand,
  hasQuestionGameRoomEngine,
  isQuestionGameCommandId,
  leaveQuestionGameRoom,
  restartQuestionGameRoom,
  type QuestionGameRoomResult,
} from "@/lib/question-game-room-engine";
import {
  findMysteryAiAnswerRequest,
  generateMysteryAiAnswer,
} from "@/lib/mystery-box-ai-answer";
import {
  getMysteryItem,
  type MysteryAnswerResolution,
  type MysterySelectionProfile,
} from "@/lib/mystery-box-rules";
import {
  loadMysterySelectionProfile,
  recordMysteryAnswerUses,
} from "@/lib/mystery-answer-rotation-service";
import { ensureQuestionGameRoomPoints } from "@/lib/point-award-service";
import {
  hasSettledQuestionGameRoomAward,
  isCompletedVersion2QuestionGameRoomCandidate,
  isCompletedVersion2QuestionGameRoom,
} from "@/lib/question-game-room-award-ledger";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ code: string }> };

const ROOM_CONFLICT_MESSAGE =
  "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.";
const MEMBERSHIP_WRITE_ATTEMPTS = 8;
const LEGACY_STATE_ACTIONS = new Set([
  "update-state",
  "set-state",
  "next-turn",
  "set-topic",
  "add-question",
]);
const VERSIONED_ACTIONS = new Set([
  "start",
  "update-state",
  "set-state",
  "next-turn",
  "set-topic",
  "add-question",
  "end",
  "restart",
]);
const PUBLISH_AWARD_RESULT_KEYS = new Set([
  "action",
  "commandId",
  "expectedCreatedAt",
  "expectedVersion",
  "playId",
]);
const REMOVE_PLAYER_KEYS = new Set([
  "action",
  "commandId",
  "expectedCreatedAt",
  "expectedVersion",
  "targetPlayerId",
]);

function isRequestBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoomMember(room: GameRoom, userId: string) {
  return room.players.some((player) => player.id === userId);
}

function isValidExpectedVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function roomConflict(room: GameRoom) {
  return NextResponse.json(
    { error: ROOM_CONFLICT_MESSAGE, room: toPublicGameRoom(room) },
    { status: 409 },
  );
}

function roomConflictWithoutRoom() {
  return NextResponse.json(
    { error: ROOM_CONFLICT_MESSAGE },
    { status: 409 },
  );
}

function roomMissing() {
  return NextResponse.json(
    { error: "방을 찾을 수 없습니다" },
    { status: 404 },
  );
}

function roomDeleted() {
  return NextResponse.json({ room: null, deleted: true });
}

function roomForbidden() {
  return NextResponse.json(
    { error: "방 참가자만 변경할 수 있어요" },
    { status: 403 },
  );
}

function roomRemoved() {
  return NextResponse.json(
    { error: "방장이 이 방에서 내보냈어요." },
    { status: 403 },
  );
}

function roomConflictForMember(room: GameRoom, userId: string) {
  if (isRoomMember(room, userId)) return roomConflict(room);
  return room.blockedPlayerIds?.includes(userId)
    ? roomRemoved()
    : roomForbidden();
}

function invalidRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function commandSuccess(
  room: GameRoom,
  result: unknown,
) {
  const publicResult = readRoomCommandResult(result);
  return NextResponse.json({
    room: toPublicGameRoom(room),
    ...(publicResult === undefined ? {} : { result: publicResult }),
  });
}

function replayedCommandSuccess(
  room: GameRoom,
  result: unknown,
) {
  return commandSuccess(room, {
    ...(readRoomCommandResult(result) ?? {}),
    replayed: true,
  });
}

function isCompletedVersion2Room(room: GameRoom) {
  return isCompletedVersion2QuestionGameRoom(room);
}

function roomSettlementPending(room: GameRoom) {
  return NextResponse.json(
    {
      error: "포인트 지급을 마친 뒤 방을 정리할 수 있습니다. 잠시 후 다시 시도해 주세요.",
      room: toPublicGameRoom(room),
    },
    { status: 409 },
  );
}

async function ensureCompletedRoomAwardSettled(room: GameRoom) {
  if (!isCompletedVersion2QuestionGameRoomCandidate(room)) return true;
  if (!isCompletedVersion2Room(room)) return false;
  try {
    const { prisma } = await import("@/lib/db");
    if (await hasSettledQuestionGameRoomAward(prisma, room)) return true;
    await ensureQuestionGameRoomPoints(room);
    return await hasSettledQuestionGameRoomAward(prisma, room);
  } catch {
    logger.warn("질문놀이 포인트 자동 지급을 마치지 못했습니다");
    return false;
  }
}

async function ensureCompletedRoomPoints(room: GameRoom): Promise<GameRoom> {
  if (!isCompletedVersion2Room(room)) return room;
  if (isGameAwardResult(room.awardResult)) return room;

  try {
    const awardResult = await ensureQuestionGameRoomPoints(room);
    if (!awardResult || gameAwardResultsMatch(room.awardResult, awardResult)) {
      return room;
    }
    const saved = await saveGameRoom({ ...room, awardResult });
    if (saved.kind === "saved") return saved.room;
    if (
      saved.kind === "conflict" &&
      saved.room.createdAt === room.createdAt &&
      saved.room.playId === room.playId
    ) {
      return saved.room;
    }
  } catch {
    logger.warn("질문놀이 포인트 자동 지급을 마치지 못했습니다");
  }
  return room;
}

function questionGameFailure(
  result: Exclude<QuestionGameRoomResult, { kind: "changed" | "replayed" }>,
  userId: string,
) {
  if (result.kind === "invalid") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  if (result.kind === "forbidden") {
    return NextResponse.json({ error: result.message }, { status: 403 });
  }
  if (result.kind === "conflict") {
    return roomConflictForMember(result.room, userId);
  }
  return NextResponse.json(
    { error: "질문놀이 상태를 처리할 수 없습니다" },
    { status: 500 },
  );
}

type PersistResult =
  | { ok: true; room: GameRoom }
  | { ok: false; response: NextResponse };

async function persistRoom(
  room: GameRoom,
  userId: string,
): Promise<PersistResult> {
  const result = await saveGameRoom(room);
  if (result.kind === "saved") return { ok: true, room: result.room };
  if (result.kind === "conflict") {
    return {
      ok: false,
      response: roomConflictForMember(result.room, userId),
    };
  }
  return { ok: false, response: roomMissing() };
}

async function handleQuestionGameCommand({
  room,
  userId,
  userName,
  action,
  body,
}: {
  room: GameRoom;
  userId: string;
  userName: string;
  action: string;
  body: Record<string, unknown>;
}) {
  let mysterySelectionProfile: MysterySelectionProfile | undefined;
  if (room.gameId === "mystery-box" && action === "mystery-start") {
    try {
      mysterySelectionProfile = await loadMysterySelectionProfile(
        prisma,
        room.players.map(({ id }) => id),
      );
    } catch {
      logger.warn("미스터리 박스 정답 순환 기록을 불러오지 못했습니다");
      return NextResponse.json(
        { error: "미스터리 박스를 준비하지 못했습니다. 다시 시도해 주세요" },
        { status: 503 },
      );
    }
  }

  const applyCommand = (
    currentRoom: GameRoom,
    mysteryAnswerResolution?: MysteryAnswerResolution,
  ) =>
    applyQuestionGameRoomCommand({
      room: currentRoom,
      userId,
      userName,
      action,
      body,
      now: Date.now(),
      random: Math.random,
      randomUUID: () => globalThis.crypto.randomUUID(),
      ...(mysteryAnswerResolution ? { mysteryAnswerResolution } : {}),
      ...(mysterySelectionProfile ? { mysterySelectionProfile } : {}),
    });

  const ensureMysterySelectionRecorded = async (
    selectedRoom: GameRoom,
  ): Promise<boolean> => {
    if (
      selectedRoom.gameId !== "mystery-box" ||
      action !== "mystery-start"
    ) {
      return true;
    }
    const privateState = selectedRoom.gameState.private;
    const itemId = isRequestBody(privateState)
      ? privateState.itemId
      : undefined;
    const item = typeof itemId === "string"
      ? getMysteryItem(itemId)
      : undefined;
    if (!item || !selectedRoom.playId) return false;
    try {
      const participantIds = Array.isArray(selectedRoom.gameState.turnOrder)
        ? selectedRoom.gameState.turnOrder.filter(
          (id): id is string => typeof id === "string",
        )
        : selectedRoom.players.map(({ id }) => id);
      await recordMysteryAnswerUses(prisma, {
        userIds: participantIds,
        item,
        selectionKey:
          `room:${selectedRoom.code}:${selectedRoom.createdAt}:${selectedRoom.playId}`,
      });
      return true;
    } catch {
      logger.warn("미스터리 박스 정답 순환 기록을 저장하지 못했습니다");
      return false;
    }
  };

  let result: QuestionGameRoomResult;
  let mysteryAnswerResolution: MysteryAnswerResolution | undefined;
  try {
    result = applyCommand(room);
  } catch {
    return NextResponse.json(
      { error: "질문놀이 상태를 처리할 수 없습니다" },
      { status: 500 },
    );
  }
  if (result.kind === "replayed") {
    if (!await ensureMysterySelectionRecorded(result.room)) {
      return NextResponse.json(
        { error: "미스터리 박스를 준비하지 못했습니다. 다시 시도해 주세요" },
        { status: 503 },
      );
    }
    return replayedCommandSuccess(result.room, result.result);
  }
  if (result.kind === "resolution-required") {
    const request = findMysteryAiAnswerRequest(result, userId);
    if (!request) {
      return NextResponse.json(
        { error: "질문놀이 상태를 처리할 수 없습니다" },
        { status: 500 },
      );
    }
    const limited = checkRateLimit(`game-room-mystery-ai:${userId}`, 20);
    if (limited) {
      logger.warn("미스터리 박스 에이아이 요청 제한으로 질문 처리를 보류합니다");
      return limited;
    } else {
      try {
        mysteryAnswerResolution = await generateMysteryAiAnswer(userId, request);
      } catch {
        logger.warn("미스터리 박스 에이아이 답변 실패로 질문 처리를 보류합니다");
        return NextResponse.json(
          { error: "미스터리 박스 질문 판정을 잠시 처리할 수 없습니다. 다시 시도해 주세요" },
          { status: 503 },
        );
      }
    }
    if (mysteryAnswerResolution.answer === "unknown") {
      return NextResponse.json(
        {
          error: "예 또는 아니오로 답할 수 있게 질문을 다시 써 주세요",
          mysteryRewriteRequired: true,
        },
        { status: 422 },
      );
    }
    try {
      result = applyCommand(room, mysteryAnswerResolution);
    } catch {
      return NextResponse.json(
        { error: "질문놀이 상태를 처리할 수 없습니다" },
        { status: 500 },
      );
    }
    if (result.kind === "resolution-required") {
      return NextResponse.json(
        { error: "질문놀이 상태를 처리할 수 없습니다" },
        { status: 500 },
      );
    }
    if (result.kind === "replayed") {
      if (!await ensureMysterySelectionRecorded(result.room)) {
        return NextResponse.json(
          { error: "미스터리 박스를 준비하지 못했습니다. 다시 시도해 주세요" },
          { status: 503 },
        );
      }
      return replayedCommandSuccess(result.room, result.result);
    }
  }
  if (result.kind !== "changed") return questionGameFailure(result, userId);

  const saved = await saveGameRoom(result.room);
  if (saved.kind === "saved") {
    if (!await ensureMysterySelectionRecorded(saved.room)) {
      return NextResponse.json(
        { error: "미스터리 박스를 준비하지 못했습니다. 다시 시도해 주세요" },
        { status: 503 },
      );
    }
    return commandSuccess(
      await ensureCompletedRoomPoints(saved.room),
      result.result,
    );
  }
  if (saved.kind === "missing") return roomMissing();
  if (!isRoomMember(saved.room, userId)) return roomForbidden();

  try {
    const replay = applyCommand(saved.room, mysteryAnswerResolution);
    if (replay.kind === "replayed") {
      if (!await ensureMysterySelectionRecorded(replay.room)) {
        return NextResponse.json(
          { error: "미스터리 박스를 준비하지 못했습니다. 다시 시도해 주세요" },
          { status: 503 },
        );
      }
      return replayedCommandSuccess(replay.room, replay.result);
    }
  } catch {
    return NextResponse.json(
      { error: "질문놀이 상태를 처리할 수 없습니다" },
      { status: 500 },
    );
  }
  return roomConflict(saved.room);
}

async function publishAwardResult({
  room,
  body,
  userId,
}: {
  room: GameRoom;
  body: Record<string, unknown>;
  userId: string;
}) {
  if (!hasExactKeys(body, PUBLISH_AWARD_RESULT_KEYS)) {
    return invalidRequest("점수 결과 공개 요청이 올바르지 않습니다");
  }
  if (!isQuestionGameCommandId(body.commandId)) {
    return invalidRequest("명령 식별값이 올바르지 않습니다");
  }
  if (
    typeof body.expectedCreatedAt !== "number" ||
    !Number.isFinite(body.expectedCreatedAt)
  ) {
    return invalidRequest("방 생성 시각이 올바르지 않습니다");
  }
  if (!isValidExpectedVersion(body.expectedVersion)) {
    return invalidRequest("올바른 expectedVersion이 필요합니다");
  }
  if (!isQuestionGameCommandId(body.playId)) {
    return invalidRequest("놀이 실행 식별값이 올바르지 않습니다");
  }
  if (
    body.expectedCreatedAt !== room.createdAt ||
    room.playId !== body.playId ||
    room.pointAwardKeyVersion !== 2 ||
    room.pointEvidenceVersion !== 2 ||
    room.gameState.stateVersion !== 2 ||
    room.status !== "ended" ||
    room.gameState.phase !== "done" ||
    room.gameState.endReason !== "completed"
  ) {
    return roomConflict(room);
  }
  const staleVersion = isStaleRoomAction(room, body.expectedVersion);
  if (staleVersion && room.awardResult === undefined) return roomConflict(room);

  let verifiedResult: GameRoom["awardResult"];
  try {
    const allowedStudentIds = new Set(
      pointParticipantsForRoom(room).map((player) => player.id),
    );
    verifiedResult = await loadVerifiedGameAwardResult(
      {
        gameId: room.gameId,
        roomCode: room.code,
        roomCreatedAt: room.createdAt,
        playId: room.playId,
      },
      allowedStudentIds,
    ) ?? undefined;
  } catch (error) {
    if (error instanceof QuestionGameAwardPublishError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "점수 결과를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
  if (!verifiedResult) {
    return NextResponse.json(
      { error: "공개할 점수 기록이 아직 없습니다" },
      { status: 409 },
    );
  }
  if (gameAwardResultsMatch(room.awardResult, verifiedResult)) {
    return commandSuccess(room, undefined);
  }
  if (staleVersion) return roomConflict(room);
  if (room.awardResult !== undefined) return roomConflict(room);

  const saved = await saveGameRoom({ ...room, awardResult: verifiedResult });
  if (saved.kind === "saved") return commandSuccess(saved.room, undefined);
  if (saved.kind === "missing") return roomMissing();
  if (
    saved.room.createdAt === room.createdAt &&
    saved.room.playId === room.playId &&
    gameAwardResultsMatch(saved.room.awardResult, verifiedResult)
  ) {
    return commandSuccess(saved.room, undefined);
  }
  return roomConflictForMember(saved.room, userId);
}

async function restartManagedRoom(
  room: GameRoom,
  body: Record<string, unknown>,
  userId: string,
) {
  if (!isQuestionGameCommandId(body.commandId)) {
    return invalidRequest("명령 식별값이 올바르지 않습니다");
  }
  if (
    typeof body.expectedCreatedAt !== "number" ||
    !Number.isFinite(body.expectedCreatedAt)
  ) {
    return invalidRequest("방 생성 시각이 올바르지 않습니다");
  }
  if (
    isCompletedVersion2Room(room) &&
    !isValidExpectedVersion(body.expectedVersion)
  ) {
    return invalidRequest("올바른 expectedVersion이 필요합니다");
  }
  if (
    isCompletedVersion2Room(room) &&
    isStaleRoomAction(room, body.expectedVersion)
  ) {
    return roomConflict(room);
  }

  const pointAwardSettled = await ensureCompletedRoomAwardSettled(room);
  if (!pointAwardSettled) return roomSettlementPending(room);

  const result = isCompletedVersion2Room(room)
    ? restartQuestionGameRoom(room, { pointAwardSettled: true })
    : restartQuestionGameRoom(room);
  if (result.kind === "replayed") {
    return replayedCommandSuccess(result.room, result.result);
  }
  if (result.kind !== "changed") return questionGameFailure(result, userId);
  if (!isValidExpectedVersion(body.expectedVersion)) {
    return invalidRequest("올바른 expectedVersion이 필요합니다");
  }
  if (isStaleRoomAction(room, body.expectedVersion)) {
    return roomConflict(room);
  }

  const saved = await saveGameRoom(result.room);
  if (saved.kind === "saved") {
    return commandSuccess(saved.room, result.result);
  }
  if (saved.kind === "missing") return roomMissing();
  if (!isRoomMember(saved.room, userId)) return roomForbidden();
  if (saved.room.createdAt !== room.createdAt) return roomConflict(saved.room);

  const replayPointAwardSettled = await ensureCompletedRoomAwardSettled(saved.room);
  if (!replayPointAwardSettled) return roomSettlementPending(saved.room);
  const replay = isCompletedVersion2Room(saved.room)
    ? restartQuestionGameRoom(saved.room, { pointAwardSettled: true })
    : restartQuestionGameRoom(saved.room);
  return replay.kind === "replayed"
    ? replayedCommandSuccess(replay.room, replay.result)
    : roomConflict(saved.room);
}

async function handleMemoryRoll(
  room: GameRoom,
  userId: string,
  body: Record<string, unknown>,
) {
  try {
    const result = await recordMemoryRoll({
      initialRoom: room,
      userId,
      roll: body.roll,
      rollRoundId: body.rollRoundId,
    });
    if (result.kind === "saved" || result.kind === "replayed") {
      return NextResponse.json({
        room: toPublicGameRoom(result.room),
        result: { roll: result.roll, replayed: result.replayed },
      });
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: "잘못된 주사위 요청입니다" },
        { status: 400 },
      );
    }
    if (result.kind === "forbidden") {
      return NextResponse.json(
        { error: "방 참가자만 굴릴 수 있어요" },
        { status: 403 },
      );
    }
    if (result.kind === "missing") return roomMissing();
    if (result.kind === "conflict") {
      return roomConflictForMember(result.room, userId);
    }
    return NextResponse.json(
      { error: "메모리 게임 상태를 처리할 수 없습니다" },
      { status: 500 },
    );
  } catch {
    return NextResponse.json(
      { error: "주사위 결과 저장에 실패했습니다" },
      { status: 500 },
    );
  }
}

async function joinRoom(
  code: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockAccountLifecycles(tx, [userId]);
    let room = await loadLockedGameRoom(code, tx);
    if (!room) return roomMissing();
    const expectedCreatedAt = room.createdAt;
    if (room.blockedPlayerIds?.includes(userId)) return roomRemoved();
    const currentUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (
      !currentUser ||
      (currentUser.role !== "STUDENT" && currentUser.role !== "TEACHER")
    ) {
      return NextResponse.json(
        { error: "현재 계정으로는 방에 참가할 수 없습니다" },
        { status: 403 },
      );
    }
    if (!isBuiltInQuestionGameId(room.gameId)) {
      return NextResponse.json(
        { error: "지원하지 않는 질문놀이입니다" },
        { status: 400 },
      );
    }
    const { max } = getQuestionGameRule(room.gameId).multiplayer;
    const player: RoomPlayer = {
      id: userId,
      name: currentUser.name,
      isHost: false,
      joinedAt: Date.now(),
    };

    for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
      if (room.players.some((item) => item.id === userId)) {
        return NextResponse.json({ room: toPublicGameRoom(room) });
      }
      if (room.status !== "waiting") {
        return NextResponse.json(
          { error: "이미 시작된 방이에요" },
          { status: 400 },
        );
      }
      if (room.players.length >= max) {
        return NextResponse.json(
          { error: `방이 가득 찼어요 (최대 ${max}명)` },
          { status: 400 },
        );
      }

      const result = await saveGameRoom({
        ...room,
        players: [...room.players, player],
      }, tx);
      if (result.kind === "saved") {
        return NextResponse.json({ room: toPublicGameRoom(result.room) });
      }
      if (result.kind === "missing") return roomMissing();
      if (result.room.createdAt !== expectedCreatedAt) {
        return roomConflictForMember(result.room, userId);
      }
      room = result.room;
    }

    if (room.players.some((item) => item.id === userId)) {
      return NextResponse.json({ room: toPublicGameRoom(room) });
    }
    return roomConflictWithoutRoom();
  });
}

async function clearMemberPresence(room: GameRoom, userId: string) {
  try {
    await deleteGameRoomPresence({
      roomCode: room.code,
      roomCreatedAt: room.createdAt,
      userId,
    });
  } catch {
    logger.warn("질문놀이 접속 기록 정리를 마치지 못했습니다");
  }
}

async function removeWaitingRoomPlayer(
  room: GameRoom,
  userId: string,
  body: Record<string, unknown>,
) {
  if (!hasExactKeys(body, REMOVE_PLAYER_KEYS)) {
    return invalidRequest("참가자 내보내기 요청이 올바르지 않습니다");
  }
  if (!isQuestionGameCommandId(body.commandId)) {
    return invalidRequest("명령 식별값이 올바르지 않습니다");
  }
  if (
    typeof body.expectedCreatedAt !== "number" ||
    !Number.isFinite(body.expectedCreatedAt)
  ) {
    return invalidRequest("방 생성 시각이 올바르지 않습니다");
  }
  if (!isValidExpectedVersion(body.expectedVersion)) {
    return invalidRequest("올바른 expectedVersion이 필요합니다");
  }
  if (
    typeof body.targetPlayerId !== "string" ||
    body.targetPlayerId.length === 0 ||
    body.targetPlayerId.length > 128
  ) {
    return invalidRequest("내보낼 참가자가 올바르지 않습니다");
  }
  if (room.hostId !== userId) {
    return NextResponse.json(
      { error: "방장만 참가자를 내보낼 수 있어요" },
      { status: 403 },
    );
  }
  if (room.status !== "waiting") {
    return NextResponse.json(
      { error: "놀이를 시작하기 전에만 참가자를 내보낼 수 있어요" },
      { status: 409 },
    );
  }
  if (body.targetPlayerId === userId) {
    return invalidRequest("방장은 자기 자신을 내보낼 수 없어요");
  }
  if (
    body.expectedCreatedAt !== room.createdAt ||
    isStaleRoomAction(room, body.expectedVersion)
  ) {
    return roomConflict(room);
  }

  const targetPlayer = room.players.find(
    ({ id }) => id === body.targetPlayerId,
  );
  if (!targetPlayer) {
    if (room.blockedPlayerIds?.includes(body.targetPlayerId)) {
      return replayedCommandSuccess(room, undefined);
    }
    return invalidRequest("내보낼 참가자를 찾을 수 없어요");
  }
  if (targetPlayer.isHost) {
    return invalidRequest("방장은 자기 자신을 내보낼 수 없어요");
  }

  const blockedPlayerIds = [
    ...new Set([...(room.blockedPlayerIds ?? []), targetPlayer.id]),
  ];
  const saved = await saveGameRoom({
    ...room,
    players: room.players.filter(({ id }) => id !== targetPlayer.id),
    blockedPlayerIds,
  });
  if (saved.kind === "saved") {
    await clearMemberPresence(room, targetPlayer.id);
    return commandSuccess(saved.room, undefined);
  }
  if (saved.kind === "missing") return roomMissing();
  if (saved.room.createdAt !== room.createdAt) {
    return roomConflictForMember(saved.room, userId);
  }
  if (
    saved.room.hostId === userId &&
    !isRoomMember(saved.room, targetPlayer.id) &&
    saved.room.blockedPlayerIds?.includes(targetPlayer.id)
  ) {
    await clearMemberPresence(room, targetPlayer.id);
    return replayedCommandSuccess(saved.room, undefined);
  }
  return roomConflictForMember(saved.room, userId);
}

async function leaveRoom(initialRoom: GameRoom, userId: string) {
  let room = initialRoom;
  const expectedCreatedAt = initialRoom.createdAt;

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    const requesterAlreadyLeft = !room.players.some(
      (item) => item.id === userId,
    );
    let candidate: GameRoom;
    if (requesterAlreadyLeft) {
      candidate = settleMemoryRollingRoom(room);
      if (candidate === room) {
        await clearMemberPresence(initialRoom, userId);
        return NextResponse.json({ room: null });
      }
    } else {
      const wasHost = room.hostId === userId;
      const players = room.players
        .filter((item) => item.id !== userId)
        .map((item, index) =>
          wasHost ? { ...item, isHost: index === 0 } : item,
        );

      if (players.length === 0) {
        if (!await ensureCompletedRoomAwardSettled(room)) {
          return roomSettlementPending(room);
        }
        const result = await deleteGameRoom(room);
        if (result.kind === "deleted" || result.kind === "missing") {
          return roomDeleted();
        }
        if (result.room.createdAt !== expectedCreatedAt) {
          return roomConflictForMember(result.room, userId);
        }
        room = result.room;
        continue;
      }

      candidate = settleMemoryRollingRoom({
        ...room,
        players,
        hostId: wasHost ? players[0].id : room.hostId,
      });
    }

    const result = await saveGameRoom(candidate);
    if (result.kind === "saved") {
      await clearMemberPresence(initialRoom, userId);
      return requesterAlreadyLeft
        ? NextResponse.json({ room: null })
        : NextResponse.json({ room: toPublicGameRoom(result.room) });
    }
    if (result.kind === "missing") return roomDeleted();
    if (result.room.createdAt !== expectedCreatedAt) {
      return roomConflictForMember(result.room, userId);
    }
    room = result.room;
  }

  if (!room.players.some((item) => item.id === userId)) {
    const settlement = settleMemoryRollingRoom(room);
    if (settlement === room) {
      await clearMemberPresence(initialRoom, userId);
      return NextResponse.json({ room: null });
    }

    const saved = await saveGameRoom(settlement);
    if (saved.kind === "saved") {
      await clearMemberPresence(initialRoom, userId);
      return NextResponse.json({ room: null });
    }
    if (saved.kind === "missing") return roomDeleted();
    return roomConflictWithoutRoom();
  }
  return roomConflict(room);
}

async function leaveVersion2Room(initialRoom: GameRoom, userId: string) {
  let room = initialRoom;
  const expectedCreatedAt = initialRoom.createdAt;

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    const requiresLastParticipantSettlement =
      isCompletedVersion2QuestionGameRoomCandidate(room) &&
      room.players.length === 1 &&
      room.players[0]?.id === userId;
    if (
      requiresLastParticipantSettlement &&
      !await ensureCompletedRoomAwardSettled(room)
    ) {
      return roomSettlementPending(room);
    }
    let result: QuestionGameRoomResult;
    try {
      result = leaveQuestionGameRoom({
        room,
        userId,
        now: Date.now(),
        random: Math.random,
        randomUUID: () => globalThis.crypto.randomUUID(),
        ...(requiresLastParticipantSettlement
          ? { pointAwardSettled: true }
          : {}),
      });
    } catch {
      return NextResponse.json(
        { error: "질문놀이 이탈을 처리할 수 없습니다" },
        { status: 500 },
      );
    }

    if (result.kind === "replayed") {
      await clearMemberPresence(initialRoom, userId);
      return NextResponse.json({ room: null });
    }
    if (result.kind !== "changed") {
      return questionGameFailure(result, userId);
    }

    if (result.room.players.length === 0) {
      const deleted = await deleteGameRoom(result.room);
      if (deleted.kind === "deleted" || deleted.kind === "missing") {
        return roomDeleted();
      }
      if (deleted.room.createdAt !== expectedCreatedAt) {
        return roomConflictForMember(deleted.room, userId);
      }
      if (!isRoomMember(deleted.room, userId)) {
        await clearMemberPresence(initialRoom, userId);
        return NextResponse.json({ room: null });
      }
      room = deleted.room;
      continue;
    }

    const saved = await saveGameRoom(result.room);
    if (saved.kind === "saved") {
      await clearMemberPresence(initialRoom, userId);
      return commandSuccess(saved.room, undefined);
    }
    if (saved.kind === "missing") return roomDeleted();
    if (saved.room.createdAt !== expectedCreatedAt) {
      return roomConflictForMember(saved.room, userId);
    }
    if (!isRoomMember(saved.room, userId)) {
      await clearMemberPresence(initialRoom, userId);
      return NextResponse.json({ room: null });
    }
    room = saved.room;
  }

  if (!isRoomMember(room, userId)) {
    await clearMemberPresence(initialRoom, userId);
    return NextResponse.json({ room: null });
  }
  return roomConflict(room);
}

// 방 상태 조회 (폴링)
export async function GET(
  req: NextRequest,
  { params }: Params,
) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const limited = checkRateLimit(`game-room-read:${userId}`, 120);
  if (limited) return limited;
  let room = await loadGameRoom(code);
  if (!room) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!isRoomMember(room, userId)) {
    if (room.blockedPlayerIds?.includes(userId)) return roomRemoved();
    return NextResponse.json(
      { error: "방 참가자만 확인할 수 있어요" },
      { status: 403 },
    );
  }
  room = await ensureCompletedRoomPoints(room);
  // 2초 폴링 최적화: 클라이언트가 이미 같은 version의 방을 들고 있으면
  // 본문 없이 304 — 직렬화·전송 비용을 없앤다. 지급으로 방이 저장되면
  // version이 올라가므로 위 ensure 뒤에 비교해야 한다.
  const knownVersion = Number(
    new URL(req.url).searchParams.get("version") ?? NaN,
  );
  if (Number.isInteger(knownVersion) && knownVersion === room.version) {
    return new NextResponse(null, { status: 304 });
  }
  return NextResponse.json({ room: toPublicGameRoom(room) });
}

// 방 액션 (참가/시작/주제설정/질문추가/종료/나가기)
export async function PATCH(
  req: NextRequest,
  { params }: Params,
) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const userName = (session.user as { name?: string }).name ?? "학생";

  const rawBody = await req.text().catch(() => null);
  if (
    rawBody === null ||
    new TextEncoder().encode(rawBody).byteLength >
      QUESTION_GAME_LIMITS.commandBodyBytes
  ) {
    return invalidRequest("요청 본문이 너무 큽니다");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return invalidRequest("요청 본문이 올바르지 않습니다");
  }
  if (!isRequestBody(parsedBody)) {
    return invalidRequest("요청 본문이 올바르지 않습니다");
  }
  const body = parsedBody;
  const action = typeof body.action === "string" ? body.action : "";
  const expectedVersion = body.expectedVersion;
  const limited = action === "join"
    ? checkRateLimit(`game-room-join:${userId}`, 10)
    : checkRateLimit(`game-room-write:${userId}`, 120);
  if (limited) return limited;

  if (action === "join") return joinRoom(code, userId);

  let room = await loadGameRoom(code);
  if (!room) {
    return action === "leave" ? roomDeleted() : roomMissing();
  }

  const isMember = isRoomMember(room, userId);
  if (action === "leave" && !isMember) {
    await clearMemberPresence(room, userId);
    return NextResponse.json({ room: null });
  }
  if (!isMember) {
    if (room.blockedPlayerIds?.includes(userId)) return roomRemoved();
    return NextResponse.json(
      { error: "방 참가자만 변경할 수 있어요" },
      { status: 403 },
    );
  }
  if (body.expectedCreatedAt !== undefined) {
    if (
      typeof body.expectedCreatedAt !== "number" ||
      !Number.isFinite(body.expectedCreatedAt)
    ) {
      return invalidRequest("방 생성 시각이 올바르지 않습니다");
    }
    if (body.expectedCreatedAt !== room.createdAt) return roomConflict(room);
  }

  if (action === "publish-award-result") {
    return publishAwardResult({ room, body, userId });
  }
  if (action === "remove-player") {
    return removeWaitingRoomPlayer(room, userId, body);
  }

  const isVersion2 = room.gameState.stateVersion === 2;
  const hasEngine = hasQuestionGameRoomEngine(room.gameId);
  if (action === "leave") {
    if (isVersion2 && body.expectedCreatedAt === undefined) {
      return invalidRequest("방 생성 시각이 올바르지 않습니다");
    }
    return isVersion2
      ? leaveVersion2Room(room, userId)
      : leaveRoom(room, userId);
  }
  if (
    room.status === "playing" &&
    !isVersion2 &&
    hasEngine &&
    action !== "restart"
  ) {
    return NextResponse.json(
      {
        error: "새 규칙으로 다시 시작해 주세요",
        room: toPublicGameRoom(room),
      },
      { status: 409 },
    );
  }
  if (action === "restart" && (isVersion2 || hasEngine)) {
    if (room.hostId !== userId) {
      return NextResponse.json(
        { error: "방장만 다시 시작할 수 있어요" },
        { status: 403 },
      );
    }
    return restartManagedRoom(room, body, userId);
  }
  if (
    VERSIONED_ACTIONS.has(action) &&
    !isValidExpectedVersion(expectedVersion)
  ) {
    return NextResponse.json(
      { error: "올바른 expectedVersion이 필요합니다" },
      { status: 400 },
    );
  }
  if (
    action === "update-state" &&
    (body.status === "playing" || body.status === "ended") &&
    room.hostId !== userId
  ) {
    return NextResponse.json(
      { error: "방장만 방 상태를 변경할 수 있어요" },
      { status: 403 },
    );
  }
  if (action === "update-state" && body.status === "playing") {
    return NextResponse.json(
      { error: "게임 시작은 시작 동작으로만 할 수 있어요" },
      { status: 400 },
    );
  }
  if (
    (isVersion2 || (hasEngine && room.status === "waiting")) &&
    LEGACY_STATE_ACTIONS.has(action)
  ) {
    return NextResponse.json(
      { error: "새 질문놀이에서는 사용할 수 없는 동작입니다" },
      { status: 403 },
    );
  }
  if (isVersion2 && action === "start") {
    const recentCommandIds = room.gameState.recentCommandIds;
    const isRecordedCommand =
      isQuestionGameCommandId(body.commandId) &&
      Array.isArray(recentCommandIds) &&
      recentCommandIds.includes(body.commandId);
    if (!isRecordedCommand) {
      if (room.hostId !== userId) {
        return NextResponse.json(
          { error: "방장만 시작할 수 있어요" },
          { status: 403 },
        );
      }
      if (room.status !== "waiting") return roomConflict(room);
      if (!isBuiltInQuestionGameId(room.gameId)) {
        return invalidRequest("지원하지 않는 질문놀이입니다");
      }
      const { min, max } = getQuestionGameRule(room.gameId).multiplayer;
      if (room.players.length < min || room.players.length > max) {
        return invalidRequest(
          `친구 방은 ${min}명부터 ${max}명까지 시작할 수 있어요`,
        );
      }
    }
  }
  if (isVersion2) {
    return handleQuestionGameCommand({
      room,
      userId,
      userName,
      action,
      body,
    });
  }
  if (action === "memory-roll") return handleMemoryRoll(room, userId, body);

  switch (action) {
    case "start": {
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 시작할 수 있어요" }, { status: 403 });
      }
      if (room.status !== "waiting") return roomConflict(room);
      if (!isBuiltInQuestionGameId(room.gameId)) {
        return NextResponse.json(
          { error: "지원하지 않는 질문놀이입니다" },
          { status: 400 },
        );
      }
      const { min, max } = getQuestionGameRule(room.gameId).multiplayer;
      if (room.players.length < min || room.players.length > max) {
        return NextResponse.json(
          { error: `친구 방은 ${min}명부터 ${max}명까지 시작할 수 있어요` },
          { status: 400 },
        );
      }
      return handleQuestionGameCommand({
        room,
        userId,
        userName,
        action,
        body,
      });
    }

    case "update-state": {
      if (room.gameId === "relay" && room.hostId !== userId) {
        return NextResponse.json(
          { error: "방장만 이어 말하기 상태를 직접 바꿀 수 있어요" },
          { status: 403 },
        );
      }
      if (
        (body.status === "playing" || body.status === "ended") &&
        room.hostId !== userId
      ) {
        return NextResponse.json(
          { error: "방장만 방 상태를 변경할 수 있어요" },
          { status: 403 },
        );
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      // gameState 부분 병합 (참가자 누구나 자기 액션 반영 가능)
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      room.gameState = { ...room.gameState, ...patch };
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      if (typeof body.status === "string" && (body.status === "playing" || body.status === "ended")) {
        room.status = body.status;
      }
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "set-state": {
      if (room.hostId !== userId) {
        return NextResponse.json(
          { error: "방장만 상태를 설정할 수 있어요" },
          { status: 403 },
        );
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      // gameState 전체 교체 (주로 방장이 초기화/리셋)
      room.gameState = (body.state ?? {}) as Record<string, unknown>;
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "next-turn": {
      if (room.hostId !== userId) {
        return NextResponse.json(
          { error: "방장만 차례를 넘길 수 있어요" },
          { status: 403 },
        );
      }
      if (room.status !== "playing") {
        return NextResponse.json(
          { error: "진행 중인 방에서만 차례를 넘길 수 있어요" },
          { status: 409 },
        );
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "set-topic": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 주제를 정할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      room.topic = typeof body.topic === "string" ? body.topic : "";
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "add-question": {
      if (room.gameId !== "relay" || room.status !== "playing") {
        return NextResponse.json(
          { error: "진행 중인 이어 말하기에서만 질문을 추가할 수 있어요" },
          { status: 409 },
        );
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question) {
        return NextResponse.json({ error: "질문이 비어있어요" }, { status: 400 });
      }
      if (question.length > 200 || !isValidQuestionForm(question)) {
        return NextResponse.json(
          { error: "질문 형식으로 200자 이내에 작성해 주세요" },
          { status: 400 },
        );
      }
      if (room.chain.length >= RELAY_ACTIVITY_LIMITS.perRoom) {
        return NextResponse.json(
          { error: "한 방에서 저장할 수 있는 질문 수를 모두 사용했어요" },
          { status: 400 },
        );
      }
      if (
        room.chain.filter((item) => item.playerId === userId).length >=
          RELAY_ACTIVITY_LIMITS.perStudent
      ) {
        return NextResponse.json(
          { error: "한 학생이 저장할 수 있는 질문 수를 모두 사용했어요" },
          { status: 400 },
        );
      }
      // 현재 턴인 사람만 추가 가능
      const currentPlayer = room.players[room.turnIndex % room.players.length];
      if (!currentPlayer || currentPlayer.id !== userId) {
        return NextResponse.json({ error: "지금은 당신의 차례가 아니에요" }, { status: 409 });
      }
      // 중복 검사
      const normalizedQuestion = normalizeQuestionActivity(question);
      if (room.chain.some((item) =>
        normalizeQuestionActivity(item.question) === normalizedQuestion
      )) {
        return NextResponse.json({ error: "이미 나온 질문이에요" }, { status: 400 });
      }
      const item: RoomChainItem = { question, playerId: userId, playerName: userName };
      room.chain.push(item);
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "end": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 종료할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      room.status = "ended";
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "restart": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 다시 시작할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return roomConflict(room);
      }
      room.status = "waiting";
      room.chain = [];
      room.turnIndex = 0;
      room.topic = "";
      room.gameState = {};
      const persisted = await persistRoom(room, userId);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    default:
      return NextResponse.json({ error: `알 수 없는 액션: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ room: toPublicGameRoom(room) });
}
