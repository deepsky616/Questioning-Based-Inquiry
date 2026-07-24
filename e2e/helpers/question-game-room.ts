import { loadEnvConfig } from "@next/env";
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { encode } from "next-auth/jwt";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
  restartQuestionGameRoom,
  type QuestionGameRoomResult,
} from "../../src/lib/question-game-room-engine";
import { toPublicGameRoom } from "../../src/lib/question-game-room-response";
import {
  getQuestionGameRule,
  isBuiltInQuestionGameId,
} from "../../src/lib/question-game-rules";
import { buildQuestionGameScoreEvidence } from "../../src/lib/question-game-score-evidence";
import { BASE_POINTS, SYSTEM_BONUS } from "../../src/lib/points-policy";
import type { GameAwardResult } from "../../src/lib/game-award-result";
import type {
  GameRoom,
  RoomCommandResult,
  RoomPlayer,
} from "../../src/lib/question-games-data";
import { createBrowserQuestionGameRunStore } from "./question-game-run";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SESSION_COOKIE = "authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 60 * 60;
const ROOM_PATH = /^\/api\/question-games\/rooms(?:\/([0-9]{4}))?\/?$/;
const ROOM_PRESENCE_PATH =
  /^\/api\/question-games\/rooms\/([0-9]{4})\/presence\/?$/;
const FIXTURE_SCHOOL = "질문놀이 시험 학교";

export interface QuestionGameBrowserIdentity {
  id: string;
  name: string;
  role: "STUDENT" | "TEACHER";
}

export interface QuestionGameBrowserFixture {
  teacher: QuestionGameBrowserIdentity;
  students: readonly [
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
  ];
}

export interface QuestionGameBrowserSession {
  context: BrowserContext;
  page: Page;
  identity: QuestionGameBrowserIdentity;
}

export interface QuestionGameRoomSession extends QuestionGameBrowserSession {
  code: string;
}

export interface QuestionGameContextOptions {
  theme?: "light" | "dark";
  viewport?: { width: number; height: number };
}

export interface SharedQuestionGameTransport {
  install: (
    context: BrowserContext,
    identity: QuestionGameBrowserIdentity,
  ) => Promise<void>;
  getRoom: (code: string) => GameRoom | null;
  roomCodeForHost: (hostId: string) => string | null;
  awardedPointsFor: (studentId: string) => number;
  awardRequestsFor: (studentId: string) => number;
  dispose: () => Promise<void>;
}

interface TransportResponse {
  status: number;
  body: Record<string, unknown>;
}

function fixtureIdentity(
  key: string,
  label: string,
  role: QuestionGameBrowserIdentity["role"],
): QuestionGameBrowserIdentity {
  return {
    id: `question-game-e2e-${key}-${label}`,
    name: role === "TEACHER" ? "시험 교사" : `시험 학생 ${label}`,
    role,
  };
}

export function createQuestionGameBrowserFixture(
  key: string,
): QuestionGameBrowserFixture {
  const normalizedKey = key.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return {
    teacher: fixtureIdentity(normalizedKey, "teacher", "TEACHER"),
    students: [
      fixtureIdentity(normalizedKey, "1", "STUDENT"),
      fixtureIdentity(normalizedKey, "2", "STUDENT"),
      fixtureIdentity(normalizedKey, "3", "STUDENT"),
      fixtureIdentity(normalizedKey, "4", "STUDENT"),
      fixtureIdentity(normalizedKey, "5", "STUDENT"),
      fixtureIdentity(normalizedKey, "6", "STUDENT"),
      fixtureIdentity(normalizedKey, "7", "STUDENT"),
      fixtureIdentity(normalizedKey, "8", "STUDENT"),
    ],
  };
}

export function createExtraStudentIdentity(
  key: string,
): QuestionGameBrowserIdentity {
  return fixtureIdentity(
    key.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    "9",
    "STUDENT",
  );
}

function loadSessionSecret(): string {
  const { combinedEnv } = loadEnvConfig(process.cwd(), true, {
    info: () => {},
    error: () => {},
  });
  const secret = combinedEnv.AUTH_SECRET?.trim() ||
    combinedEnv.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("브라우저 시험 인증 비밀값이 필요합니다");
  }
  return secret;
}

async function sessionToken(identity: QuestionGameBrowserIdentity) {
  return encode({
    token: {
      sub: identity.id,
      id: identity.id,
      name: identity.name,
      email: `${identity.id}@example.test`,
      role: identity.role,
      school: FIXTURE_SCHOOL,
      grade: identity.role === "STUDENT" ? "6" : null,
      className: identity.role === "STUDENT" ? "1" : null,
      studentNumber: identity.role === "STUDENT"
        ? identity.id.split("-").at(-1)
        : null,
    },
    secret: loadSessionSecret(),
    salt: "authjs.session-token",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function fulfill(route: Route, response: TransportResponse) {
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: JSON.stringify(response.body),
  });
}

function publicRoom(room: GameRoom) {
  return structuredClone(toPublicGameRoom(structuredClone(room)));
}

function resultResponse(
  room: GameRoom,
  result?: RoomCommandResult,
): TransportResponse {
  return {
    status: 200,
    body: {
      room: publicRoom(room),
      ...(result === undefined ? {} : { result }),
    },
  };
}

function failureResponse(result: Exclude<
  QuestionGameRoomResult,
  { kind: "changed" | "replayed" }
>): TransportResponse {
  const status = result.kind === "invalid"
    ? 400
    : result.kind === "forbidden"
      ? 403
      : result.kind === "conflict"
        ? 409
        : 500;
  return {
    status,
    body: {
      error: result.message,
      ...(result.kind === "conflict"
        ? { room: publicRoom(result.room) }
        : {}),
    },
  };
}

function deterministicMemoryPairs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    question: {
      ko: `시험 질문 ${index + 1}은 무엇인가요?`,
      en: `What is test question ${index + 1}?`,
    },
    answer: {
      ko: `시험 대답 ${index + 1}입니다.`,
      en: `This is test answer ${index + 1}.`,
    },
  }));
}

async function installAuxiliaryRoutes(
  context: BrowserContext,
  identity: QuestionGameBrowserIdentity,
  award: (identity: QuestionGameBrowserIdentity, body: Record<string, unknown>) => TransportResponse,
) {
  await context.route("**/api/notifications**", async (route) => {
    await fulfill(route, {
      status: 200,
      body: {
        notifications: [],
        unreadCount: 0,
        unreadSessionReminders: [],
      },
    });
  });
  await context.route("**/api/teacher/flagged-count", async (route) => {
    await fulfill(route, {
      status: 200,
      body: { total: 0, questions: 0, comments: 0 },
    });
  });
  await context.route("**/api/teacher/points/pending-count", async (route) => {
    await fulfill(route, { status: 200, body: { count: 0 } });
  });
  await context.route("**/api/question-games/ai-play", async (route) => {
    const body = requestBody(route);
    const rawCount = isRecord(body.context) ? body.context.count : undefined;
    const count = typeof rawCount === "string" ? Number(rawCount) : 6;
    await fulfill(route, {
      status: 200,
      body: {
        text: JSON.stringify(deterministicMemoryPairs(
          Number.isInteger(count) && count > 0 ? count : 6,
        )),
      },
    });
  });
  await context.route("**/api/classify", async (route) => {
    await fulfill(route, {
      status: 200,
      body: {
        closure: "open",
        cognitive: "conceptual",
        closureScore: 0.2,
        cognitiveScore: 0.9,
        reasoning: "여러 생각을 이어 갈 수 있는 질문입니다.",
        feedback: "주제와 연결한 까닭이 잘 드러납니다.",
        inappropriate: false,
        inappropriateReason: "",
      },
    });
  });
  await context.route("**/api/points/award", async (route) => {
    await fulfill(route, award(identity, requestBody(route)));
  });
}

export function createSharedQuestionGameTransport(): SharedQuestionGameTransport {
  const rooms = new Map<string, GameRoom>();
  const runs = createBrowserQuestionGameRunStore();
  const identities = new Map<string, QuestionGameBrowserIdentity>();
  const awardResults = new Map<string, GameAwardResult>();
  const awardedPoints = new Map<string, number>();
  const awardRequests = new Map<string, number>();
  let nextCode = 1000;
  let nextUuid = 1;
  let clock = 1_900_000_000_000;
  let serial: Promise<void> = Promise.resolve();
  let disposed = false;

  const now = () => {
    clock += 1_000;
    return clock;
  };
  const random = () => 0.25;
  const randomUUID = () => {
    const suffix = nextUuid.toString(16).padStart(12, "0");
    nextUuid += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
  const enqueue = <T>(work: () => Promise<T> | T): Promise<T> => {
    const result = serial.then(work, work);
    serial = result.then(() => undefined, () => undefined);
    return result;
  };
  const save = (candidate: GameRoom): GameRoom => {
    const saved = {
      ...structuredClone(candidate),
      version: candidate.version + 1,
      updatedAt: now(),
    };
    rooms.set(saved.code, saved);
    return saved;
  };

  const awardKey = (room: GameRoom) =>
    `${room.gameId}:${room.code}:${room.createdAt}:${room.playId ?? "legacy"}`;

  const buildBrowserAwardResult = (room: GameRoom): GameAwardResult => {
    const studentIds = new Set(
      (room.pointParticipants ?? room.players)
        .map(({ id }) => identities.get(id))
        .filter((identity): identity is QuestionGameBrowserIdentity =>
          identity?.role === "STUDENT"
        )
        .map(({ id }) => id),
    );
    const contributions = buildQuestionGameScoreEvidence(room, studentIds);
    const awards = contributions.flatMap((contribution) => [
      {
        studentId: contribution.studentId,
        bonusType: SYSTEM_BONUS.PARTICIPATION,
        points: BASE_POINTS.PARTICIPATION,
        reason: "게임 참여",
      },
      ...(contribution.validQuestions > 0 ? [{
        studentId: contribution.studentId,
        bonusType: SYSTEM_BONUS.VALID_QUESTIONS,
        points: contribution.validQuestions * BASE_POINTS.PER_VALID_QUESTION,
        reason: `유효 질문 ${contribution.validQuestions}개`,
      }] : []),
      {
        studentId: contribution.studentId,
        bonusType: SYSTEM_BONUS.COMPLETION,
        points: BASE_POINTS.COMPLETION,
        reason: "게임 완료",
      },
      ...(contribution.isWinner ? [{
        studentId: contribution.studentId,
        bonusType: SYSTEM_BONUS.WINNER,
        points: BASE_POINTS.WINNER_BONUS,
        reason: "우승",
      }] : []),
    ]);
    return { awards, summary: "브라우저 시험 지급 결과" };
  };

  const awardRoom = (
    identity: QuestionGameBrowserIdentity,
    body: Record<string, unknown>,
  ): TransportResponse => {
    awardRequests.set(identity.id, (awardRequests.get(identity.id) ?? 0) + 1);
    const code = typeof body.roomCode === "string" ? body.roomCode : "";
    const room = rooms.get(code);
    if (
      !room ||
      room.status !== "ended" ||
      room.createdAt !== body.roomCreatedAt ||
      room.playId !== body.playId ||
      !room.players.some(({ id }) => id === identity.id)
    ) {
      return { status: 409, body: { error: "완료한 방을 확인할 수 없습니다" } };
    }
    const key = awardKey(room);
    const previous = awardResults.get(key);
    const result = previous ?? buildBrowserAwardResult(room);
    if (!previous) {
      awardResults.set(key, result);
      for (const item of result.awards) {
        awardedPoints.set(
          item.studentId,
          (awardedPoints.get(item.studentId) ?? 0) + item.points,
        );
      }
    }
    return {
      status: 200,
      body: { ...result, alreadyAwarded: previous !== undefined },
    };
  };

  const createRoom = (
    identity: QuestionGameBrowserIdentity,
    body: Record<string, unknown>,
  ): TransportResponse => {
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    if (!isBuiltInQuestionGameId(gameId)) {
      return { status: 400, body: { error: "지원하지 않는 질문놀이입니다" } };
    }
    while (rooms.has(String(nextCode))) nextCode += 1;
    const code = String(nextCode);
    nextCode += 1;
    const createdAt = now();
    const host: RoomPlayer = {
      id: identity.id,
      name: identity.name,
      isHost: true,
      joinedAt: createdAt,
    };
    const room: GameRoom = {
      code,
      gameId,
      hostId: identity.id,
      status: "waiting",
      players: [host],
      topic: "",
      chain: [],
      turnIndex: 0,
      gameState: {},
      version: 1,
      createdAt,
      updatedAt: createdAt,
    };
    rooms.set(code, room);
    return resultResponse(room);
  };

  const joinRoom = (
    room: GameRoom,
    identity: QuestionGameBrowserIdentity,
  ): TransportResponse => {
    if (room.blockedPlayerIds?.includes(identity.id)) {
      return {
        status: 403,
        body: { error: "방장이 이 방에서 내보냈어요." },
      };
    }
    if (room.players.some(({ id }) => id === identity.id)) {
      return resultResponse(room);
    }
    if (room.status !== "waiting") {
      return { status: 400, body: { error: "이미 시작된 방이에요" } };
    }
    const { max } = getQuestionGameRule(room.gameId).multiplayer;
    if (room.players.length >= max) {
      return {
        status: 400,
        body: { error: `방이 가득 찼어요 (최대 ${max}명)` },
      };
    }
    return resultResponse(save({
      ...room,
      players: [
        ...room.players,
        {
          id: identity.id,
          name: identity.name,
          isHost: false,
          joinedAt: now(),
        },
      ],
    }));
  };

  const leaveRoom = (
    room: GameRoom,
    identity: QuestionGameBrowserIdentity,
  ): TransportResponse => {
    if (!room.players.some(({ id }) => id === identity.id)) {
      return { status: 200, body: { room: null } };
    }
    if (room.gameState.stateVersion !== 2) {
      const players = room.players
        .filter(({ id }) => id !== identity.id)
        .map((player, index) => ({ ...player, isHost: index === 0 }));
      if (players.length === 0) {
        rooms.delete(room.code);
        return { status: 200, body: { room: null, deleted: true } };
      }
      const saved = save({
        ...room,
        players,
        hostId: room.hostId === identity.id ? players[0].id : room.hostId,
      });
      return resultResponse(saved);
    }

    const result = leaveQuestionGameRoom({
      room,
      userId: identity.id,
      now: now(),
      random,
      randomUUID,
      pointAwardSettled: true,
    });
    if (result.kind === "replayed") {
      return { status: 200, body: { room: null } };
    }
    if (result.kind !== "changed") return failureResponse(result);
    if (result.room.players.length === 0) {
      rooms.delete(room.code);
      return { status: 200, body: { room: null, deleted: true } };
    }
    return resultResponse(save(result.room), result.result);
  };

  const applyRoomAction = (
    room: GameRoom,
    identity: QuestionGameBrowserIdentity,
    action: string,
    body: Record<string, unknown>,
  ): TransportResponse => {
    if (!room.players.some(({ id }) => id === identity.id)) {
      return room.blockedPlayerIds?.includes(identity.id)
        ? { status: 403, body: { error: "방장이 이 방에서 내보냈어요." } }
        : { status: 403, body: { error: "방 참가자만 변경할 수 있어요" } };
    }
    if (body.expectedCreatedAt !== undefined &&
      body.expectedCreatedAt !== room.createdAt) {
      return {
        status: 409,
        body: { error: "방 생성 시각이 다릅니다", room: publicRoom(room) },
      };
    }
    if (action === "leave") return leaveRoom(room, identity);
    if (action === "remove-player") {
      const targetPlayerId =
        typeof body.targetPlayerId === "string" ? body.targetPlayerId : "";
      if (room.hostId !== identity.id) {
        return {
          status: 403,
          body: { error: "방장만 참가자를 내보낼 수 있어요" },
        };
      }
      if (room.status !== "waiting") {
        return {
          status: 409,
          body: { error: "놀이를 시작하기 전에만 참가자를 내보낼 수 있어요" },
        };
      }
      if (body.expectedVersion !== room.version) {
        return {
          status: 409,
          body: { error: "기대 버전이 다릅니다", room: publicRoom(room) },
        };
      }
      if (!targetPlayerId || targetPlayerId === identity.id) {
        return {
          status: 400,
          body: { error: "내보낼 참가자가 올바르지 않습니다" },
        };
      }
      if (!room.players.some(({ id }) => id === targetPlayerId)) {
        return {
          status: 400,
          body: { error: "내보낼 참가자를 찾을 수 없어요" },
        };
      }
      return resultResponse(save({
        ...room,
        players: room.players.filter(({ id }) => id !== targetPlayerId),
        blockedPlayerIds: [
          ...new Set([...(room.blockedPlayerIds ?? []), targetPlayerId]),
        ],
      }));
    }
    if (action === "publish-award-result") {
      const result = awardResults.get(awardKey(room));
      if (!result || body.playId !== room.playId) {
        return { status: 409, body: { error: "지급 결과를 확인할 수 없습니다" } };
      }
      return resultResponse(save({ ...room, awardResult: result }));
    }
    if (action === "restart") {
      if (room.hostId !== identity.id) {
        return { status: 403, body: { error: "방장만 다시 시작할 수 있어요" } };
      }
      if (body.expectedVersion !== room.version) {
        return {
          status: 409,
          body: { error: "기대 버전이 다릅니다", room: publicRoom(room) },
        };
      }
      const result = restartQuestionGameRoom(room, { pointAwardSettled: true });
      return result.kind === "changed"
        ? resultResponse(save(result.room), result.result)
        : result.kind === "replayed"
          ? resultResponse(result.room, result.result)
          : failureResponse(result);
    }
    if (action === "start") {
      const { min, max } = getQuestionGameRule(room.gameId).multiplayer;
      if (room.hostId !== identity.id) {
        return { status: 403, body: { error: "방장만 시작할 수 있어요" } };
      }
      if (room.status !== "waiting") {
        return {
          status: 409,
          body: { error: "이미 시작된 방이에요", room: publicRoom(room) },
        };
      }
      if (room.players.length < min || room.players.length > max) {
        return {
          status: 400,
          body: { error: `친구 방은 ${min}명부터 ${max}명까지 시작할 수 있어요` },
        };
      }
    }

    const result = applyQuestionGameRoomCommand({
      room,
      userId: identity.id,
      userName: identity.name,
      action,
      body,
      now: now(),
      random,
      randomUUID,
    });
    if (result.kind === "changed") {
      return resultResponse(save(result.room), result.result);
    }
    if (result.kind === "replayed") {
      return resultResponse(result.room, result.result);
    }
    return failureResponse(result);
  };

  const dispatch = (
    route: Route,
    identity: QuestionGameBrowserIdentity,
  ): TransportResponse => {
    if (disposed) {
      return { status: 410, body: { error: "시험 방 전송기가 닫혔습니다" } };
    }
    const request = route.request();
    const url = new URL(request.url());
    const presenceMatch = url.pathname.match(ROOM_PRESENCE_PATH);
    if (presenceMatch) {
      const room = rooms.get(presenceMatch[1]);
      if (request.method() !== "POST") {
        return { status: 405, body: { error: "허용하지 않는 요청입니다" } };
      }
      if (!room) {
        return { status: 404, body: { error: "방을 찾을 수 없습니다" } };
      }
      if (!room.players.some(({ id }) => id === identity.id)) {
        return room.blockedPlayerIds?.includes(identity.id)
          ? {
              status: 403,
              body: { error: "방장이 이 방에서 내보냈어요." },
            }
          : {
              status: 403,
              body: { error: "방 참가자만 접속을 확인할 수 있어요" },
            };
      }
      const body = requestBody(route);
      if (body.expectedCreatedAt !== room.createdAt) {
        return {
          status: 409,
          body: {
            error: "방 상태가 바뀌었어요",
            room: publicRoom(room),
          },
        };
      }
      return resultResponse(room);
    }

    const match = url.pathname.match(ROOM_PATH);
    if (!match) return { status: 404, body: { error: "방 경로를 찾을 수 없습니다" } };
    const code = match[1];
    const method = request.method();
    const body = requestBody(route);

    if (!code && method === "POST") return createRoom(identity, body);
    if (!code) return { status: 405, body: { error: "허용하지 않는 요청입니다" } };
    const room = rooms.get(code);
    if (!room) {
      return method === "PATCH" && body.action === "leave"
        ? { status: 200, body: { room: null, deleted: true } }
        : { status: 404, body: { error: "방을 찾을 수 없습니다" } };
    }
    if (method === "GET") {
      return room.players.some(({ id }) => id === identity.id)
        ? resultResponse(room)
        : room.blockedPlayerIds?.includes(identity.id)
          ? { status: 403, body: { error: "방장이 이 방에서 내보냈어요." } }
          : { status: 403, body: { error: "방 참가자만 확인할 수 있어요" } };
    }
    if (method !== "PATCH") {
      return { status: 405, body: { error: "허용하지 않는 요청입니다" } };
    }
    const action = typeof body.action === "string" ? body.action : "";
    return action === "join"
      ? joinRoom(room, identity)
      : applyRoomAction(room, identity, action, body);
  };

  return {
    async install(context, identity) {
      identities.set(identity.id, identity);
      await installAuxiliaryRoutes(context, identity, awardRoom);
      await context.route("**/api/question-games/runs**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const response = await enqueue(() => runs.dispatch(identity, {
          method: request.method(),
          pathname: url.pathname,
          body: requestBody(route),
        }));
        await fulfill(route, response);
      });
      await context.route("**/api/question-games/rooms**", async (route) => {
        const response = await enqueue(() => dispatch(route, identity));
        await fulfill(route, response);
      });
    },
    getRoom(code) {
      const room = rooms.get(code);
      return room ? structuredClone(room) : null;
    },
    roomCodeForHost(hostId) {
      return [...rooms.values()].find((room) => room.hostId === hostId)?.code ?? null;
    },
    awardedPointsFor(studentId) {
      return awardedPoints.get(studentId) ?? 0;
    },
    awardRequestsFor(studentId) {
      return awardRequests.get(studentId) ?? 0;
    },
    async dispose() {
      disposed = true;
      await serial;
      rooms.clear();
      runs.clear();
      identities.clear();
      awardResults.clear();
      awardedPoints.clear();
      awardRequests.clear();
    },
  };
}

export async function openQuestionGameContext(
  browser: Browser,
  identity: QuestionGameBrowserIdentity,
  transport: SharedQuestionGameTransport,
  options: QuestionGameContextOptions = {},
): Promise<QuestionGameBrowserSession> {
  const theme = options.theme ?? "light";
  const context = await browser.newContext({
    locale: "ko-KR",
    colorScheme: theme,
    ...(options.viewport ? { viewport: options.viewport } : {}),
  });
  try {
    await context.addCookies([{
      name: SESSION_COOKIE,
      value: await sessionToken(identity),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    }]);
    await context.addInitScript((selectedTheme) => {
      window.localStorage.setItem("question-lab-theme", selectedTheme);
    }, theme);
    await transport.install(context, identity);
    return { context, page: await context.newPage(), identity };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function openStudentFriendChoice(
  session: QuestionGameBrowserSession,
  gameId: string,
) {
  await session.page.goto(`/student-question-play/${gameId}`);
  await expect(session.page).toHaveURL(new RegExp(`/student-question-play/${gameId}$`));
  await session.page.getByRole("button")
    .filter({ hasText: "방 만들고 함께해요" })
    .click();
  await session.page.getByRole("button", { name: /친구와 함께하기/ }).click();
  await expect(
    session.page.getByRole("button").filter({ hasText: "방 개설하기" }),
  ).toBeVisible();
}

export async function openStudentJoinPage(
  browser: Browser,
  identity: QuestionGameBrowserIdentity,
  gameId: string,
  transport: SharedQuestionGameTransport,
  options?: QuestionGameContextOptions,
): Promise<QuestionGameBrowserSession> {
  const session = await openQuestionGameContext(
    browser,
    identity,
    transport,
    options,
  );
  try {
    await openStudentFriendChoice(session, gameId);
    await session.page.getByRole("button")
      .filter({ hasText: "방 코드 입력" })
      .click();
    await expect(session.page.locator("#question-game-room-code")).toBeVisible();
    return session;
  } catch (error) {
    await session.context.close().catch(() => {});
    throw error;
  }
}

export async function submitQuestionGameRoomCode(
  page: Page,
  code: string,
) {
  await page.locator("#question-game-room-code").fill(code);
  await page.getByRole("button", { name: /방 참가하기/ }).click();
}

export async function openStudentRoom(
  browser: Browser,
  identity: QuestionGameBrowserIdentity,
  gameId: string,
  transport: SharedQuestionGameTransport,
  options?: QuestionGameContextOptions,
): Promise<QuestionGameRoomSession> {
  const session = await openQuestionGameContext(
    browser,
    identity,
    transport,
    options,
  );
  try {
    await openStudentFriendChoice(session, gameId);
    await session.page.getByRole("button")
      .filter({ hasText: "방 개설하기" })
      .click();
    await expect(session.page.getByText("방 코드", { exact: true })).toBeVisible();
    const code = transport.roomCodeForHost(identity.id);
    expect(code).not.toBeNull();
    return { ...session, code: code as string };
  } catch (error) {
    await session.context.close().catch(() => {});
    throw error;
  }
}

export async function joinStudentRoom(
  browser: Browser,
  identity: QuestionGameBrowserIdentity,
  gameId: string,
  code: string,
  transport: SharedQuestionGameTransport,
  options?: QuestionGameContextOptions,
): Promise<QuestionGameRoomSession> {
  const session = await openStudentJoinPage(
    browser,
    identity,
    gameId,
    transport,
    options,
  );
  try {
    await submitQuestionGameRoomCode(session.page, code);
    await expect.poll(() => transport.getRoom(code)?.players.some(
      ({ id }) => id === identity.id,
    )).toBe(true);
    return { ...session, code };
  } catch (error) {
    await session.context.close().catch(() => {});
    throw error;
  }
}

export async function openTeacherRoom(
  browser: Browser,
  identity: QuestionGameBrowserIdentity,
  gameId: string,
  transport: SharedQuestionGameTransport,
): Promise<QuestionGameRoomSession> {
  const session = await openQuestionGameContext(browser, identity, transport);
  try {
    await session.page.goto(`/teacher-question-play/${gameId}/host`);
    await expect(session.page).toHaveURL(
      new RegExp(`/teacher-question-play/${gameId}/host$`),
    );
    await session.page.getByRole("button")
      .filter({ hasText: "방 개설하기" })
      .click();
    await expect(session.page.getByText("방 코드", { exact: true })).toBeVisible();
    const code = transport.roomCodeForHost(identity.id);
    expect(code).not.toBeNull();
    return { ...session, code: code as string };
  } catch (error) {
    await session.context.close().catch(() => {});
    throw error;
  }
}

export async function closeQuestionGameSessions(
  sessions: readonly QuestionGameBrowserSession[],
) {
  await Promise.all(sessions.map(({ context }) => context.close().catch(() => {})));
}

async function paintContrastMeasurements(
  locator: Locator,
  paintProperty: "color" | "stroke" | "border-right-color",
) {
  return locator.evaluateAll((elements, property) => {
    type Color = { red: number; green: number; blue: number; alpha: number };
    type Background = { color: Color; hasImage: boolean };
    const transparent: Color = { red: 0, green: 0, blue: 0, alpha: 0 };
    const parse = (value: string): Color | null => {
      const match = value.match(
        /rgba?\(\s*([0-9.]+)[, ]+([0-9.]+)[, ]+([0-9.]+)(?:\s*[,/]\s*([0-9.]+))?\s*\)/,
      );
      return match
        ? {
            red: Number(match[1]),
            green: Number(match[2]),
            blue: Number(match[3]),
            alpha: match[4] === undefined ? 1 : Number(match[4]),
          }
        : null;
    };
    const composite = (front: Color, back: Color): Color => {
      const alpha = front.alpha + back.alpha * (1 - front.alpha);
      if (alpha === 0) return { red: 255, green: 255, blue: 255, alpha: 1 };
      return {
        red: (front.red * front.alpha + back.red * back.alpha * (1 - front.alpha)) / alpha,
        green: (front.green * front.alpha + back.green * back.alpha * (1 - front.alpha)) / alpha,
        blue: (front.blue * front.alpha + back.blue * back.alpha * (1 - front.alpha)) / alpha,
        alpha,
      };
    };
    const background = (element: Element | null): Background => {
      if (!element) {
        return {
          color: { red: 255, green: 255, blue: 255, alpha: 1 },
          hasImage: false,
        };
      }
      const parent = background(element.parentElement);
      const style = getComputedStyle(element);
      const own = parse(style.backgroundColor) ?? transparent;
      const ownHasImage = style.backgroundImage !== "none";
      return {
        color: composite(own, parent.color),
        hasImage: ownHasImage || (own.alpha < 1 && parent.hasImage),
      };
    };
    const luminance = (color: Color) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.red) +
        0.7152 * channel(color.green) +
        0.0722 * channel(color.blue);
    };

    return elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const hasVisibleExtent = property === "stroke"
          ? (rect.width > 0 || rect.height > 0) &&
            Number.parseFloat(style.strokeWidth) > 0
          : rect.width > 0 && rect.height > 0;
        return style.visibility !== "hidden" &&
          style.display !== "none" &&
          hasVisibleExtent;
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const paintValue = style.getPropertyValue(property);
        const paint = parse(paintValue);
        const back = background(element);
        const label = element.getAttribute("aria-label") ||
          element.textContent?.trim() ||
          element.getAttribute("data-testid") ||
          element.getAttribute("class") ||
          property;
        if (!paint) {
          return {
            label,
            ratio: 0,
            hasBackgroundImage: back.hasImage,
            paintValue,
            backgroundColor: back.color,
          };
        }
        const opacity = Number(style.opacity);
        const renderedPaint = composite({
          ...paint,
          alpha: paint.alpha * (Number.isFinite(opacity) ? opacity : 1),
        }, back.color);
        const paintLuminance = luminance(renderedPaint);
        const backgroundLuminance = luminance(back.color);
        const ratio = (Math.max(paintLuminance, backgroundLuminance) + 0.05) /
          (Math.min(paintLuminance, backgroundLuminance) + 0.05);
        return {
          label,
          ratio,
          hasBackgroundImage: back.hasImage,
          paintValue,
          backgroundColor: back.color,
        };
      });
  }, paintProperty);
}

async function expectPaintContrast(
  locator: Locator,
  paintProperty: "color" | "stroke" | "border-right-color",
  minimum: number,
) {
  const measurements = await paintContrastMeasurements(locator, paintProperty);
  expect(measurements.length).toBeGreaterThan(0);
  for (const measurement of measurements) {
    expect(
      measurement.hasBackgroundImage,
      `${measurement.label} 배경 그림은 계산 대비 검사 대상에서 분리해야 합니다`,
    ).toBe(false);
    expect(
      measurement.ratio,
      `${measurement.label} 대비 ${measurement.ratio.toFixed(2)} ` +
        `(색 ${measurement.paintValue}, 바탕 ${JSON.stringify(measurement.backgroundColor)})`,
    ).toBeGreaterThanOrEqual(minimum);
  }
}

export async function expectTextContrast(locator: Locator, minimum = 4.5) {
  await expectPaintContrast(locator, "color", minimum);
}

export async function expectSvgStrokeContrast(locator: Locator, minimum = 3) {
  await expectPaintContrast(locator, "stroke", minimum);
}

export async function expectLoadingRingContrast(locator: Locator, minimum = 3) {
  await expectPaintContrast(locator, "border-right-color", minimum);
  const topBorderAlphas = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const value = getComputedStyle(element).borderTopColor;
      const match = value.match(
        /rgba?\(\s*[0-9.]+[, ]+[0-9.]+[, ]+[0-9.]+(?:\s*[,/]\s*([0-9.]+))?\s*\)/,
      );
      return match?.[1] === undefined ? 1 : Number(match[1]);
    }),
  );
  expect(topBorderAlphas.length).toBeGreaterThan(0);
  for (const alpha of topBorderAlphas) {
    expect(alpha, "회전 표시의 열린 부분이 투명해야 합니다").toBeLessThanOrEqual(0.05);
  }
}

export async function expectNoBoxOverlap(locators: readonly Locator[]) {
  const boxes = await Promise.all(locators.map(async (locator, index) => {
    await expect(locator, `경계 상자 ${index + 1}`).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `경계 상자 ${index + 1} 좌표`).not.toBeNull();
    if (!box) throw new Error(`경계 상자 ${index + 1} 좌표를 찾을 수 없습니다`);
    return box;
  }));

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];
      const overlapWidth = Math.min(left.x + left.width, right.x + right.width) -
        Math.max(left.x, right.x);
      const overlapHeight = Math.min(left.y + left.height, right.y + right.height) -
        Math.max(left.y, right.y);
      expect(
        overlapWidth > 0.5 && overlapHeight > 0.5,
        `경계 상자 ${leftIndex + 1}과 ${rightIndex + 1}이 겹칩니다`,
      ).toBe(false);
    }
  }
}

export async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

export async function expectLadderPathGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    function readLine(element: Element) {
      if (!(element instanceof SVGLineElement)) {
        throw new Error("사다리 선 요소가 아닙니다");
      }
      const matrix = element.getScreenCTM();
      const svg = element.ownerSVGElement;
      if (!matrix || !svg) throw new Error("사다리 선 화면 좌표를 구할 수 없습니다");
      const screenPoint = (x: number, y: number) => {
        const point = svg.createSVGPoint();
        point.x = x;
        point.y = y;
        const screen = point.matrixTransform(matrix);
        return { x: screen.x, y: screen.y };
      };
      const x1 = element.x1.baseVal.value;
      const x2 = element.x2.baseVal.value;
      const y1 = element.y1.baseVal.value;
      const y2 = element.y2.baseVal.value;
      return {
        x1,
        x2,
        y1,
        y2,
        screenFrom: screenPoint(x1, y1),
        screenTo: screenPoint(x2, y2),
        axis: element.getAttribute("data-axis"),
        fromColumn: Number(element.getAttribute("data-from-column")),
        toColumn: Number(element.getAttribute("data-to-column")),
      };
    }
    const lines = (testId: string) => [...document.querySelectorAll(
      `[data-testid="${testId}"]`,
    )].map(readLine);
    return {
      segments: lines("ladder-path-segment"),
      verticals: lines("ladder-base-vertical"),
      rungs: lines("ladder-base-rung"),
    };
  });

  const localTolerance = 0.01;
  const screenTolerance = 0.75;
  const close = (
    received: number,
    expected: number,
    tolerance: number,
    label: string,
  ) => {
    expect(Math.abs(received - expected), label).toBeLessThanOrEqual(tolerance);
  };
  const finiteLine = (line: (typeof geometry.segments)[number]) =>
    [
      line.x1,
      line.x2,
      line.y1,
      line.y2,
      line.screenFrom.x,
      line.screenFrom.y,
      line.screenTo.x,
      line.screenTo.y,
    ].every(Number.isFinite);

  expect(geometry.segments.length).toBeGreaterThan(0);
  expect(geometry.verticals.length).toBeGreaterThanOrEqual(2);
  expect(geometry.rungs.length).toBeGreaterThan(0);
  expect(geometry.segments.every(finiteLine)).toBe(true);
  const columnXs = geometry.verticals.map(({ x1 }) => x1)
    .sort((left, right) => left - right);
  const ladderTop = Math.min(...geometry.verticals.flatMap(({ y1, y2 }) => [y1, y2]));
  const ladderBottom = Math.max(
    ...geometry.verticals.flatMap(({ y1, y2 }) => [y1, y2]),
  );
  close(geometry.segments[0].y1, ladderTop, localTolerance, "사다리 경로 시작 높이");
  close(
    geometry.segments.at(-1)?.y2 ?? Number.NaN,
    ladderBottom,
    localTolerance,
    "사다리 경로 끝 높이",
  );

  let horizontalCount = 0;
  for (const [index, segment] of geometry.segments.entries()) {
    const vertical = Math.abs(segment.x2 - segment.x1) <= localTolerance &&
      Math.abs(segment.y2 - segment.y1) > localTolerance;
    const horizontal = Math.abs(segment.y2 - segment.y1) <= localTolerance &&
      Math.abs(segment.x2 - segment.x1) > localTolerance;
    expect(vertical || horizontal, `사다리 경로 ${index + 1}은 대각선입니다`).toBe(true);
    const actualAxis = vertical ? "vertical" : "horizontal";
    expect(segment.axis).toBe(actualAxis);
    expect(Number.isInteger(segment.fromColumn)).toBe(true);
    expect(Number.isInteger(segment.toColumn)).toBe(true);
    close(
      segment.x1,
      columnXs[segment.fromColumn],
      localTolerance,
      `사다리 경로 ${index + 1} 시작 열`,
    );
    close(
      segment.x2,
      columnXs[segment.toColumn],
      localTolerance,
      `사다리 경로 ${index + 1} 끝 열`,
    );

    if (vertical) {
      expect(segment.y2).toBeGreaterThan(segment.y1);
      close(
        segment.screenFrom.x,
        segment.screenTo.x,
        screenTolerance,
        `사다리 경로 ${index + 1} 화면 세로축`,
      );
      expect(segment.screenTo.y).toBeGreaterThan(segment.screenFrom.y);
      const followsVertical = geometry.verticals.some((base) =>
        Math.abs(base.x1 - segment.x1) <= localTolerance &&
        segment.y1 >= Math.min(base.y1, base.y2) - localTolerance &&
        segment.y2 <= Math.max(base.y1, base.y2) + localTolerance
      );
      expect(followsVertical, `사다리 경로 ${index + 1} 기본 세로선`).toBe(true);
    } else {
      horizontalCount += 1;
      close(
        segment.screenFrom.y,
        segment.screenTo.y,
        screenTolerance,
        `사다리 경로 ${index + 1} 화면 가로축`,
      );
      expect(Math.abs(segment.screenTo.x - segment.screenFrom.x))
        .toBeGreaterThan(screenTolerance);
      const followsRung = geometry.rungs.some((rung) => {
        const sameDirection =
          Math.abs(rung.x1 - segment.x1) <= localTolerance &&
          Math.abs(rung.x2 - segment.x2) <= localTolerance;
        const reverseDirection =
          Math.abs(rung.x2 - segment.x1) <= localTolerance &&
          Math.abs(rung.x1 - segment.x2) <= localTolerance;
        return (sameDirection || reverseDirection) &&
          Math.abs(rung.y1 - segment.y1) <= localTolerance &&
          Math.abs(rung.y2 - segment.y2) <= localTolerance;
      });
      expect(followsRung, `사다리 경로 ${index + 1} 기본 가로 발판`).toBe(true);
    }

    const next = geometry.segments[index + 1];
    if (next) {
      close(segment.x2, next.x1, localTolerance, `사다리 경로 ${index + 1} 가로 연결`);
      close(segment.y2, next.y1, localTolerance, `사다리 경로 ${index + 1} 세로 연결`);
      close(
        segment.screenTo.x,
        next.screenFrom.x,
        screenTolerance,
        `사다리 경로 ${index + 1} 화면 가로 연결`,
      );
      close(
        segment.screenTo.y,
        next.screenFrom.y,
        screenTolerance,
        `사다리 경로 ${index + 1} 화면 세로 연결`,
      );
    }
  }
  expect(horizontalCount, "실제 가로 경로 구간").toBeGreaterThan(0);
}
