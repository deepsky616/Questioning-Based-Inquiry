import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  isValidQuestionForm,
  normalizeQuestionActivity,
  RELAY_ACTIVITY_LIMITS,
} from "@/lib/points-policy";
import type {
  GameRoom,
  RoomChainItem,
  RoomPlayer,
} from "@/lib/question-games-data";
import {
  deleteGameRoom,
  isStaleRoomAction,
  loadGameRoom,
  saveGameRoom,
} from "@/lib/game-room-store";
import {
  recordMemoryRoll,
  settleMemoryRollingRoom,
} from "@/lib/memory-room-roll";
import {
  getQuestionGameRule,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";

type Params = { params: Promise<{ code: string }> };

const ROOM_CONFLICT_MESSAGE =
  "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.";
const MEMBERSHIP_WRITE_ATTEMPTS = 3;
const MEMBER_STATE_ACTIONS = new Set([
  "update-state",
  "set-state",
  "next-turn",
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
    { error: ROOM_CONFLICT_MESSAGE, room },
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

type PersistResult =
  | { ok: true; room: GameRoom }
  | { ok: false; response: NextResponse };

async function persistRoom(room: GameRoom): Promise<PersistResult> {
  const result = await saveGameRoom(room);
  if (result.kind === "saved") return { ok: true, room: result.room };
  if (result.kind === "conflict") {
    return { ok: false, response: roomConflict(result.room) };
  }
  return { ok: false, response: roomMissing() };
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
        room: result.room,
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
    if (result.kind === "conflict") return roomConflict(result.room);
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
  initialRoom: GameRoom,
  userId: string,
  userName: string,
) {
  let room = initialRoom;
  if (!isBuiltInQuestionGameId(room.gameId)) {
    return NextResponse.json(
      { error: "지원하지 않는 질문놀이입니다" },
      { status: 400 },
    );
  }
  const { max } = getQuestionGameRule(room.gameId).multiplayer;
  const player: RoomPlayer = {
    id: userId,
    name: userName,
    isHost: false,
    joinedAt: Date.now(),
  };

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    if (room.players.some((item) => item.id === userId)) {
      return NextResponse.json({ room });
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
    });
    if (result.kind === "saved") {
      return NextResponse.json({ room: result.room });
    }
    if (result.kind === "missing") return roomMissing();
    room = result.room;
  }

  if (room.players.some((item) => item.id === userId)) {
    return NextResponse.json({ room });
  }
  return roomConflict(room);
}

async function leaveRoom(initialRoom: GameRoom, userId: string) {
  let room = initialRoom;
  const expectedCreatedAt = initialRoom.createdAt;

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    let candidate: GameRoom;
    if (!room.players.some((item) => item.id === userId)) {
      candidate = settleMemoryRollingRoom(room);
      if (candidate === room) return NextResponse.json({ room });
    } else {
      const wasHost = room.hostId === userId;
      const players = room.players
        .filter((item) => item.id !== userId)
        .map((item, index) =>
          wasHost ? { ...item, isHost: index === 0 } : item,
        );

      if (players.length === 0) {
        const result = await deleteGameRoom(room);
        if (result.kind === "deleted" || result.kind === "missing") {
          return roomDeleted();
        }
        if (result.room.createdAt !== expectedCreatedAt) {
          return roomConflict(result.room);
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
      return NextResponse.json({ room: result.room });
    }
    if (result.kind === "missing") return roomDeleted();
    if (result.room.createdAt !== expectedCreatedAt) {
      return roomConflict(result.room);
    }
    room = result.room;
  }

  if (!room.players.some((item) => item.id === userId)) {
    const candidate = settleMemoryRollingRoom(room);
    if (candidate === room) return NextResponse.json({ room });
  }
  return roomConflict(room);
}

// 방 상태 조회 (폴링)
export async function GET(
  _req: NextRequest,
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
  const room = await loadGameRoom(code);
  if (!room) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!isRoomMember(room, userId)) {
    return NextResponse.json(
      { error: "방 참가자만 확인할 수 있어요" },
      { status: 403 },
    );
  }
  return NextResponse.json({ room });
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

  const parsedBody: unknown = await req.json().catch(() => null);
  const body = isRequestBody(parsedBody) ? parsedBody : {};
  const action = typeof body.action === "string" ? body.action : "";
  const expectedVersion = body.expectedVersion;
  const limited = action === "join"
    ? checkRateLimit(`game-room-join:${userId}`, 10)
    : checkRateLimit(`game-room-write:${userId}`, 120);
  if (limited) return limited;

  let room = await loadGameRoom(code);
  if (!room) {
    return action === "leave" ? roomDeleted() : roomMissing();
  }

  if (action === "join") return joinRoom(room, userId, userName);
  if (action === "leave" && !isRoomMember(room, userId)) {
    return NextResponse.json({ room: null });
  }
  if (MEMBER_STATE_ACTIONS.has(action) && !isRoomMember(room, userId)) {
    return NextResponse.json(
      { error: "방 참가자만 변경할 수 있어요" },
      { status: 403 },
    );
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
    body.expectedCreatedAt !== undefined &&
    body.expectedCreatedAt !== room.createdAt
  ) {
    return roomConflict(room);
  }
  if (action === "leave") return leaveRoom(room, userId);
  if (action === "memory-roll") return handleMemoryRoll(room, userId, body);

  switch (action) {
    case "start": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 시작할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
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
      room.status = "playing";
      room.turnIndex = 0;
      room.chain = [];
      room.gameState = {};
      const persisted = await persistRoom(room);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
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
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      // gameState 부분 병합 (참가자 누구나 자기 액션 반영 가능)
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      room.gameState = { ...room.gameState, ...patch };
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      if (typeof body.status === "string" && (body.status === "playing" || body.status === "ended")) {
        room.status = body.status;
      }
      const persisted = await persistRoom(room);
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
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      // gameState 전체 교체 (주로 방장이 초기화/리셋)
      room.gameState = (body.state ?? {}) as Record<string, unknown>;
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      const persisted = await persistRoom(room);
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
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      const persisted = await persistRoom(room);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "set-topic": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 주제를 정할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      room.topic = typeof body.topic === "string" ? body.topic : "";
      const persisted = await persistRoom(room);
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
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
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
      const persisted = await persistRoom(room);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "end": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 종료할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      room.status = "ended";
      const persisted = await persistRoom(room);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    case "restart": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 다시 시작할 수 있어요" }, { status: 403 });
      }
      if (isStaleRoomAction(room, expectedVersion)) {
        return NextResponse.json({ error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.", room }, { status: 409 });
      }
      room.status = "waiting";
      room.chain = [];
      room.turnIndex = 0;
      room.topic = "";
      room.gameState = {};
      const persisted = await persistRoom(room);
      if (!persisted.ok) return persisted.response;
      room = persisted.room;
      break;
    }

    default:
      return NextResponse.json({ error: `알 수 없는 액션: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ room });
}
