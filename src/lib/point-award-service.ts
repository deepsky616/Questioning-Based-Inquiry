import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateJson } from "@/lib/ai";
import { loadGameRoom } from "@/lib/game-room-store";
import {
  restorePublishableAwardResult,
  serializeGameAwardResultSnapshot,
  type GameAward,
  type GameAwardBestQuestion,
} from "@/lib/game-award-result";
import {
  buildQuestionGameScoreEvidence,
  QuestionGameScoreEvidenceError,
} from "@/lib/question-game-score-evidence";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
  type TeacherStudentScope,
} from "@/lib/teacher-student-access";
import {
  BASE_POINTS,
  AI_BONUS_TYPES,
  VALID_BONUS_KEYS,
  MAX_BONUS_PER_STUDENT,
  MAX_BONUSES_PER_STUDENT,
  SYSTEM_BONUS,
  GAME_LABEL,
  isValidQuestionForm,
  normalizeQuestionActivity,
  RELAY_ACTIVITY_LIMITS,
  type BonusKey,
} from "@/lib/points-policy";

interface StudentContribution {
  studentId: string;
  studentName: string;
  validQuestions: number;
  activityScore?: number;
  questions: string[];
  isWinner: boolean;
}

interface AwardIdentity {
  gameId: string;
  roomCode: string;
  roomCreatedAt: number;
  playId?: string;
}

interface AwardRequest extends AwardIdentity {
  topic?: string;
  contributions: StudentContribution[];
}

interface AIBonus { studentId: string; bonusType: string; points?: number; reason: string }
interface AIVerdictResponse { bonuses: AIBonus[]; bestQuestion?: { studentId: string; question: string; reason: string }; summary?: string }

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEGACY_SERVER_VERIFIED_AWARD_GAMES = new Set(["relay"]);
const GAME_ACTIVITY_LIMITS: Record<string, { perStudent: number; perRoom: number }> = {
  relay: RELAY_ACTIVITY_LIMITS,
  dice: { perStudent: 20, perRoom: 80 },
  kaba: { perStudent: 12, perRoom: 24 },
  ladder: { perStudent: 1, perRoom: 8 },
  "story-dice": { perStudent: 20, perRoom: 80 },
  memory: { perStudent: 15, perRoom: 15 },
};

export class PointAwardError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "PointAwardError";
  }
}

const AI_SYSTEM = `당신은 초·중학생의 질문놀이 활동을 따뜻하게 평가하는 선생님입니다.
- 모든 학생을 격려하되, 특별히 두드러진 점만 보너스로 줍니다.
- 친구 사이 차이가 너무 크지 않게 균형을 맞춥니다.
- 명확한 근거 없으면 보너스를 주지 마세요.
- 반드시 요구된 JSON 형식으로만 답하세요.`;

function normalizeAwardRequest(body: Partial<AwardRequest>): AwardIdentity {
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
  if (!gameId || !roomCode) {
    throw new PointAwardError("필수 항목 누락", 400);
  }
  if (body.roomCreatedAt === undefined) {
    throw new PointAwardError("방 정보를 다시 불러와 주세요", 409);
  }
  if (
    typeof body.roomCreatedAt !== "number" ||
    !Number.isFinite(body.roomCreatedAt) ||
    !Number.isInteger(body.roomCreatedAt) ||
    body.roomCreatedAt < 0
  ) {
    throw new PointAwardError("잘못된 방 생성 시각", 400);
  }
  if (
    body.playId !== undefined &&
    (typeof body.playId !== "string" || !UUID_V4_PATTERN.test(body.playId))
  ) {
    throw new PointAwardError("잘못된 놀이 실행 식별값", 400);
  }
  return {
    gameId,
    roomCode,
    roomCreatedAt: body.roomCreatedAt,
    ...(body.playId ? { playId: body.playId } : {}),
  };
}

export function buildRoomAwardKey(
  roomCode: string,
  roomCreatedAt: number,
  playId?: string,
) {
  return playId
    ? `room:${roomCode}:${roomCreatedAt}:${playId}`
    : `room:${roomCode}:${roomCreatedAt}`;
}

function isVersion2Room(room: GameRoom): boolean {
  return room.pointAwardKeyVersion === 2 || room.pointEvidenceVersion === 2;
}

function requireCurrentRoom(req: AwardIdentity, room: GameRoom | null): GameRoom {
  if (
    !room ||
    room.code !== req.roomCode ||
    room.gameId !== req.gameId ||
    room.createdAt !== req.roomCreatedAt
  ) {
    throw new PointAwardError("방이 바뀌었습니다. 다시 열어 주세요", 409);
  }
  if (isVersion2Room(room)) {
    if (
      room.pointAwardKeyVersion !== 2 ||
      room.pointEvidenceVersion !== 2 ||
      typeof room.playId !== "string" ||
      !UUID_V4_PATTERN.test(room.playId)
    ) {
      throw new PointAwardError("질문놀이 점수 근거 버전을 확인할 수 없습니다", 409);
    }
    if (!req.playId) {
      throw new PointAwardError("놀이 실행 정보를 다시 불러와 주세요", 409);
    }
    if (room.playId !== req.playId) {
      throw new PointAwardError("방의 놀이 실행이 바뀌었습니다. 다시 열어 주세요", 409);
    }
  }
  return room;
}

function requireAwardableRoom(
  req: AwardIdentity,
  room: GameRoom | null,
  userId: string,
): GameRoom {
  const current = requireCurrentRoom(req, room);
  if (current.hostId !== userId) {
    throw new PointAwardError("방장만 점수를 지급할 수 있어요", 403);
  }
  if (current.status !== "ended") {
    throw new PointAwardError("놀이가 끝난 뒤 점수를 지급할 수 있어요", 409);
  }
  if (current.players.length === 0) {
    throw new PointAwardError("점수를 지급할 참가자가 없습니다", 409);
  }
  if (isVersion2Room(current)) {
    if (
      current.pointEvidenceVersion !== 2 ||
      current.pointAwardKeyVersion !== 2 ||
      current.gameState.stateVersion !== 2
    ) {
      throw new PointAwardError("질문놀이 점수 근거 버전을 확인할 수 없습니다", 409);
    }
    if (
      current.gameState.phase !== "done" ||
      current.gameState.endReason !== "completed"
    ) {
      throw new PointAwardError("목표를 완료한 질문놀이만 점수를 지급할 수 있습니다", 409);
    }
    return current;
  }
  if (!LEGACY_SERVER_VERIFIED_AWARD_GAMES.has(current.gameId)) {
    throw new PointAwardError(
      "서버에서 활동을 확인할 수 있는 놀이만 점수를 지급할 수 있습니다",
      409,
    );
  }
  if (current.pointEvidenceVersion !== 1) {
    throw new PointAwardError(
      "서버에서 활동을 확인한 새 놀이만 점수를 지급할 수 있습니다",
      409,
    );
  }
  return current;
}

function awardKeyForRoom(req: AwardIdentity, room: GameRoom): string {
  return buildRoomAwardKey(
    req.roomCode,
    req.roomCreatedAt,
    room.pointAwardKeyVersion === 2 ? req.playId : undefined,
  );
}

function buildAwardLogWhere(
  req: AwardIdentity,
  room: GameRoom,
  awardKey: string,
): Prisma.PointLogWhereInput {
  if (room.pointAwardKeyVersion === 2) {
    return { gameId: req.gameId, roomCode: awardKey, status: "APPROVED" };
  }
  if (room.pointAwardKeyVersion === 1) {
    return { gameId: req.gameId, roomCode: awardKey, status: "APPROVED" };
  }
  return {
    gameId: req.gameId,
    status: "APPROVED",
    OR: [
      { roomCode: awardKey },
      {
        roomCode: req.roomCode,
        createdAt: { gte: new Date(req.roomCreatedAt) },
      },
    ],
  };
}

async function findAwardLogs(
  client: Pick<Prisma.TransactionClient, "pointLog">,
  req: AwardIdentity,
  room: GameRoom,
  awardKey: string,
) {
  const logs = await client.pointLog.findMany({
    where: buildAwardLogWhere(req, room, awardKey),
    orderBy: { createdAt: "asc" },
  });
  return logs.filter((log) => log.status === "APPROVED");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertStoredActivityCount(
  room: GameRoom,
  count: number,
  limit: { perRoom: number },
) {
  if (count > limit.perRoom || count > room.version) {
    throw new PointAwardError("저장된 놀이 활동 수를 확인할 수 없습니다", 409);
  }
}

function readMemoryCards(
  value: unknown,
  maxCards: number,
): Map<string, string> {
  const cards = Array.isArray(value) ? value : [];
  if (cards.length > maxCards) {
    throw new PointAwardError("저장된 짝 찾기 카드 수를 확인할 수 없습니다", 409);
  }
  const byId = new Map<string, string>();
  const pairIds = new Set<string>();
  for (const card of cards) {
    if (!isRecord(card)) {
      throw new PointAwardError("저장된 짝 찾기 카드를 확인할 수 없습니다", 409);
    }
    const id = readNonEmptyString(card.id);
    const pairId = readNonEmptyString(card.pairId);
    if (!id || !pairId || byId.has(id) || pairIds.has(pairId)) {
      throw new PointAwardError("저장된 짝 찾기 카드를 확인할 수 없습니다", 409);
    }
    byId.set(id, pairId);
    pairIds.add(pairId);
  }
  return byId;
}

function buildStoredContributions(
  room: GameRoom,
  studentIds: Set<string>,
): StudentContribution[] {
  const allPlayers = Array.from(
    new Map(room.players.map((player) => [player.id, player])).values(),
  );
  const players = allPlayers.filter((player) => studentIds.has(player.id));
  const questionsByStudent = new Map(
    players.map((player) => [player.id, [] as string[]]),
  );
  const scoreByStudent = new Map(players.map((player) => [player.id, 0]));
  const seenByStudent = new Map(
    players.map((player) => [player.id, new Set<string>()]),
  );
  const activityLimit = GAME_ACTIVITY_LIMITS[room.gameId];
  if (!activityLimit) {
    throw new PointAwardError("이 놀이는 서버에서 점수를 확인할 수 없습니다", 409);
  }
  let roomActivityCount = 0;

  const addActivity = (
    studentId: unknown,
    text: unknown,
    dedupContext = "",
  ) => {
    if (typeof studentId !== "string" || !scoreByStudent.has(studentId)) return;
    const normalizedText = readNonEmptyString(text);
    if (!normalizedText) return;
    const activityKey = `${dedupContext}:${normalizeQuestionActivity(normalizedText)}`;
    const seen = seenByStudent.get(studentId);
    if (!seen || seen.has(activityKey)) {
      throw new PointAwardError("같은 놀이 활동이 반복 저장되었습니다", 409);
    }
    const currentStudentCount = scoreByStudent.get(studentId) ?? 0;
    if (currentStudentCount >= activityLimit.perStudent) {
      throw new PointAwardError("학생별 놀이 활동 상한을 넘었습니다", 409);
    }
    if (roomActivityCount >= activityLimit.perRoom) {
      throw new PointAwardError("방 전체 놀이 활동 상한을 넘었습니다", 409);
    }
    seen.add(activityKey);
    questionsByStudent.get(studentId)?.push(normalizedText);
    scoreByStudent.set(studentId, currentStudentCount + 1);
    roomActivityCount++;
  };

  const state = room.gameState;
  switch (room.gameId) {
    case "relay":
      assertStoredActivityCount(room, room.chain.length, activityLimit);
      for (const item of room.chain) {
        if (item.question.length > 200 || !isValidQuestionForm(item.question)) {
          throw new PointAwardError("저장된 질문 형식을 확인할 수 없습니다", 409);
        }
        addActivity(item.playerId, item.question);
      }
      break;
    case "dice": {
      const history = Array.isArray(state.history) ? state.history : [];
      assertStoredActivityCount(room, history.length, activityLimit);
      for (const item of history) {
        if (isRecord(item)) addActivity(item.playerId, item.question);
      }
      break;
    }
    case "kaba": {
      const history = Array.isArray(state.history) ? state.history : [];
      assertStoredActivityCount(room, history.length, activityLimit);
      for (const item of history) {
        if (isRecord(item) && item.correct === true) {
          const sentence = readNonEmptyString(item.sentence) ?? "";
          addActivity(item.playerId, item.answer, normalizeQuestionActivity(sentence));
        }
      }
      break;
    }
    case "ladder": {
      const questions = Array.isArray(state.questions) ? state.questions : [];
      assertStoredActivityCount(room, questions.length, activityLimit);
      const recorded = new Set<string>();
      for (const item of questions) {
        if (!isRecord(item) || typeof item.playerId !== "string") continue;
        if (recorded.has(item.playerId)) continue;
        const before = scoreByStudent.get(item.playerId) ?? 0;
        addActivity(item.playerId, item.question);
        if ((scoreByStudent.get(item.playerId) ?? 0) > before) {
          recorded.add(item.playerId);
        }
      }
      break;
    }
    case "story-dice": {
      const chain = Array.isArray(state.chain) ? state.chain : [];
      assertStoredActivityCount(room, chain.length, activityLimit);
      for (const item of chain) {
        if (isRecord(item) && item.type !== "story") {
          const type = readNonEmptyString(item.type) ?? "activity";
          addActivity(item.playerId, item.text, type);
        }
      }
      break;
    }
    case "memory": {
      const scores = isRecord(state.scores) ? state.scores : {};
      const qCards = readMemoryCards(state.qCards, activityLimit.perRoom);
      const aCards = readMemoryCards(state.aCards, activityLimit.perRoom);
      for (const id of qCards.keys()) {
        if (aCards.has(id)) {
          throw new PointAwardError("저장된 짝 찾기 카드를 확인할 수 없습니다", 409);
        }
      }
      const rawTakenIds = Array.isArray(state.takenIds) ? state.takenIds : [];
      if (rawTakenIds.some((id) => typeof id !== "string")) {
        throw new PointAwardError("저장된 짝 찾기 활동을 확인할 수 없습니다", 409);
      }
      const takenIds = new Set(rawTakenIds as string[]);
      if (takenIds.size !== rawTakenIds.length) {
        throw new PointAwardError("같은 놀이 활동이 반복 저장되었습니다", 409);
      }
      const takenQuestionPairs = new Set<string>();
      const takenAnswerPairs = new Set<string>();
      for (const id of takenIds) {
        const questionPairId = qCards.get(id);
        const answerPairId = aCards.get(id);
        if (!questionPairId && !answerPairId) {
          throw new PointAwardError("저장된 짝 찾기 활동을 확인할 수 없습니다", 409);
        }
        if (questionPairId) takenQuestionPairs.add(questionPairId);
        if (answerPairId) takenAnswerPairs.add(answerPairId);
      }
      const verifiedPairs = Array.from(takenQuestionPairs)
        .filter((pairId) => takenAnswerPairs.has(pairId)).length;
      if (takenIds.size !== verifiedPairs * 2) {
        throw new PointAwardError("저장된 짝 찾기 활동을 확인할 수 없습니다", 409);
      }
      assertStoredActivityCount(room, verifiedPairs, activityLimit);
      let storedScoreSum = 0;
      for (const player of allPlayers) {
        const score = scores[player.id];
        if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
          throw new PointAwardError("저장된 놀이 점수를 확인할 수 없습니다", 409);
        }
        if (studentIds.has(player.id) && score > activityLimit.perStudent) {
          throw new PointAwardError("학생별 놀이 활동 상한을 넘었습니다", 409);
        }
        if (studentIds.has(player.id)) scoreByStudent.set(player.id, score);
        storedScoreSum += score;
      }
      if (storedScoreSum !== verifiedPairs) {
        throw new PointAwardError("저장된 놀이 점수가 활동 기록과 맞지 않습니다", 409);
      }
      break;
    }
    default:
      throw new PointAwardError("이 놀이는 서버에서 점수를 확인할 수 없습니다", 409);
  }

  const topScore = Math.max(...scoreByStudent.values(), 0);
  if (topScore <= 0) {
    throw new PointAwardError("확인할 수 있는 놀이 활동이 없습니다", 409);
  }
  return players.map((player) => ({
    studentId: player.id,
    studentName: player.name,
    validQuestions: scoreByStudent.get(player.id) ?? 0,
    questions: questionsByStudent.get(player.id) ?? [],
    isWinner: (scoreByStudent.get(player.id) ?? 0) === topScore,
  }));
}

async function loadScopedStudentIds(
  room: GameRoom,
  client: Pick<Prisma.TransactionClient, "user">,
  teacherScope: TeacherStudentScope,
): Promise<Set<string>> {
  const participantIds = Array.from(new Set(
    room.players
      .filter((player) => player.id !== room.hostId)
      .map((player) => player.id),
  ));
  if (participantIds.length === 0) {
    throw new PointAwardError("점수를 지급할 학생 참가자가 없습니다", 409);
  }
  const students = await client.user.findMany({
    where: { id: { in: participantIds } },
    select: {
      id: true,
      role: true,
      school: true,
      grade: true,
      className: true,
    },
  });
  if (students.length !== participantIds.length) {
    throw new PointAwardError("학생 참가자 정보를 확인할 수 없습니다", 409);
  }
  if (students.some((student) => !isStudentInTeacherScope(teacherScope, student))) {
    throw new PointAwardError("담당 학생에게만 점수를 지급할 수 있습니다", 403);
  }
  return new Set(students.map((student) => student.id));
}

function buildStoredAwardRequest(
  req: AwardIdentity,
  room: GameRoom,
  studentIds: Set<string>,
): AwardRequest {
  let contributions: StudentContribution[];
  if (room.pointEvidenceVersion === 2) {
    try {
      contributions = buildQuestionGameScoreEvidence(room, studentIds);
    } catch (error) {
      if (error instanceof QuestionGameScoreEvidenceError) {
        throw new PointAwardError(error.message, error.status);
      }
      throw error;
    }
  } else {
    contributions = buildStoredContributions(room, studentIds);
  }
  return {
    ...req,
    topic: room.topic,
    contributions,
  };
}

function participantIdsForRoom(room: GameRoom) {
  return Array.from(new Set(
    room.players
      .filter((player) => player.id !== room.hostId)
      .map((player) => player.id),
  ));
}

async function lockAwardScopeRows(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  teacherId: string,
  participantIds: string[],
) {
  const userIds = Array.from(new Set([teacherId, ...participantIds]));
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "users"
    WHERE "id" IN (${Prisma.join(userIds)})
    FOR SHARE
  `;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "teacher_classes"
    WHERE "teacher_id" = ${teacherId}
    FOR SHARE
  `;
}

async function loadCurrentTeacherScope(
  client: Pick<Prisma.TransactionClient, "user">,
  teacherId: string,
): Promise<TeacherStudentScope | null> {
  const teacher = await client.user.findUnique({
    where: { id: teacherId },
    select: {
      role: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  if (teacher?.role !== "TEACHER" || !teacher.school) return null;
  return { school: teacher.school, classes: teacher.teacherClasses };
}

function restoreScopedAwardResult<
  T extends { studentId?: unknown; aiAnalysis?: string | null },
>(logs: T[], studentIds: Set<string>) {
  if (logs.some((log) =>
    typeof log.studentId !== "string" || !studentIds.has(log.studentId)
  )) {
    throw new PointAwardError("현재 방 참가 학생의 점수만 확인할 수 있습니다", 403);
  }
  const restored = restorePublishableAwardResult(logs);
  if (!restored) {
    throw new PointAwardError("기존 점수 지급 결과를 확인할 수 없습니다", 409);
  }
  return { alreadyAwarded: true, ...restored };
}

function buildPrompt(req: AwardRequest): string {
  const gameLabel = GAME_LABEL[req.gameId] ?? req.gameId;
  const contributionLines = req.contributions.map((c) =>
    `[학생ID=${c.studentId}] ${c.studentName} (유효질문 ${c.validQuestions}개):\n` +
      (c.questions.length === 0 ? "  (작성 없음)" : c.questions.map((q) => `  - ${q}`).join("\n"))
  ).join("\n\n");

  const bonusList = Object.values(AI_BONUS_TYPES).map((b) =>
    `  - ${b.key}: ${b.label} (${b.points}점)`
  ).join("\n");

  return `[게임] ${gameLabel}${req.topic ? ` / 주제: ${req.topic}` : ""}

[학생별 기여 내역]
${contributionLines}

[수여 가능한 상]
${bonusList}

[규칙]
- 각 학생은 최대 ${MAX_BONUSES_PER_STUDENT}개의 상을 받을 수 있고, 보너스 합산은 ${MAX_BONUS_PER_STUDENT}점을 넘지 않습니다.
- "BEST_QUESTION"은 전체에서 1명만 받습니다 (또는 0명).
- 다른 상은 받을 만한 학생만 받습니다 (모두에게 줄 필요 없음).

[응답 형식 — 이 JSON 외의 다른 텍스트는 절대 출력 금지]
{
  "bestQuestion": { "studentId": "...", "question": "...", "reason": "한 문장 칭찬" },
  "bonuses": [
    { "studentId": "...", "bonusType": "CREATIVITY", "reason": "한 문장 근거" },
    { "studentId": "...", "bonusType": "EFFORT", "reason": "한 문장 근거" }
  ],
  "summary": "전체 게임에 대한 따뜻한 총평 한 줄"
}`;
}

async function callAI(req: AwardRequest, userId: string): Promise<AIVerdictResponse | null> {
  try {
    return await generateJson<AIVerdictResponse>({
      userId,
      prompt: buildPrompt(req),
      systemInstruction: AI_SYSTEM,
      temperature: 0,
    });
  } catch {
    return null;
  }
}

export function buildAwardList(req: AwardRequest, ai: AIVerdictResponse | null): {
  awards: GameAward[];
  bestQuestion?: GameAwardBestQuestion;
  summary?: string;
} {
  const awards: GameAward[] = [];
  const validIds = new Set(req.contributions.map((c) => c.studentId));
  const storedQuestions = new Map<string, Map<string, string>>();
  for (const contribution of req.contributions) {
    const byNormalizedQuestion = new Map<string, string>();
    for (const question of contribution.questions) {
      const normalized = normalizeQuestionActivity(question);
      if (normalized) byNormalizedQuestion.set(normalized, question);
    }
    storedQuestions.set(contribution.studentId, byNormalizedQuestion);
  }
  const hasStoredQuestion = (studentId: string) =>
    (storedQuestions.get(studentId)?.size ?? 0) > 0;

  for (const c of req.contributions) {
    awards.push({
      studentId: c.studentId,
      bonusType: SYSTEM_BONUS.PARTICIPATION,
      points: BASE_POINTS.PARTICIPATION,
      reason: "게임 참여",
    });
    if (c.validQuestions > 0) {
      awards.push({
        studentId: c.studentId,
        bonusType: SYSTEM_BONUS.VALID_QUESTIONS,
        points: c.validQuestions * BASE_POINTS.PER_VALID_QUESTION,
        reason: `유효 질문 ${c.validQuestions}개`,
      });
    }
    awards.push({
      studentId: c.studentId,
      bonusType: SYSTEM_BONUS.COMPLETION,
      points: BASE_POINTS.COMPLETION,
      reason: "게임 완료",
    });
    if (c.isWinner) {
      awards.push({
        studentId: c.studentId,
        bonusType: SYSTEM_BONUS.WINNER,
        points: BASE_POINTS.WINNER_BONUS,
        reason: "우승",
      });
    }
  }

  let bestQuestion: GameAwardBestQuestion | undefined;
  let summary: string | undefined;
  if (ai) {
    summary = typeof ai.summary === "string" && ai.summary.length <= 4_000
      ? ai.summary
      : undefined;
    const candidate = ai.bestQuestion;
    if (
      candidate &&
      typeof candidate.studentId === "string" &&
      typeof candidate.question === "string" &&
      validIds.has(candidate.studentId) &&
      hasStoredQuestion(candidate.studentId)
    ) {
      const storedQuestion = storedQuestions
        .get(candidate.studentId)
        ?.get(normalizeQuestionActivity(candidate.question));
      if (storedQuestion) {
        const reason = typeof candidate.reason === "string"
          ? candidate.reason.trim()
          : "";
        bestQuestion = {
          studentId: candidate.studentId,
          question: storedQuestion,
          reason: reason && reason.length <= 4_000
            ? reason
            : "좋은 질문을 만들었어요",
        };
      }
    }

    const perStudent: Record<string, { count: number; sum: number; types: Set<string> }> = {};
    validIds.forEach((id) => { perStudent[id] = { count: 0, sum: 0, types: new Set() }; });

    if (bestQuestion) {
      const bk = AI_BONUS_TYPES.BEST_QUESTION;
      awards.push({
        studentId: bestQuestion.studentId, bonusType: bk.key,
        points: bk.points, reason: bestQuestion.reason || "AI 베스트 질문 선정",
      });
      const s = perStudent[bestQuestion.studentId];
      s.count++; s.sum += bk.points; s.types.add(bk.key);
    }

    for (const b of Array.isArray(ai.bonuses) ? ai.bonuses : []) {
      if (!validIds.has(b.studentId)) continue;
      if (!hasStoredQuestion(b.studentId)) continue;
      if (!VALID_BONUS_KEYS.includes(b.bonusType as BonusKey)) continue;
      if (b.bonusType === "BEST_QUESTION") continue;
      const def = AI_BONUS_TYPES[b.bonusType as BonusKey];
      const s = perStudent[b.studentId];
      if (s.types.has(def.key)) continue;
      if (s.count >= MAX_BONUSES_PER_STUDENT) continue;
      if (s.sum + def.points > MAX_BONUS_PER_STUDENT) continue;
      awards.push({
        studentId: b.studentId, bonusType: def.key,
        points: def.points,
        reason: typeof b.reason === "string" && b.reason.trim() && b.reason.length <= 4_000
          ? b.reason.trim()
          : def.label,
      });
      s.count++; s.sum += def.points; s.types.add(def.key);
    }
  }

  return { awards, bestQuestion, summary };
}

export async function awardGamePoints(
  body: Partial<AwardRequest>,
  userId: string,
  userRole: string,
) {
  if (userRole !== "TEACHER") {
    throw new PointAwardError("교사만 질문놀이 점수를 지급할 수 있습니다", 403);
  }
  const normalized = normalizeAwardRequest(body);
  const { gameId, roomCode } = normalized;
  const room = requireAwardableRoom(
    normalized,
    await loadGameRoom(roomCode),
    userId,
  );
  const teacherScope = await loadTeacherStudentScope(userId);
  if (!teacherScope) {
    throw new PointAwardError("교사 소속 학교를 확인할 수 없습니다", 403);
  }
  const awardRoomCode = awardKeyForRoom(normalized, room);
  const studentIds = await loadScopedStudentIds(room, prisma, teacherScope);

  const existingLogs = await findAwardLogs(
    prisma,
    normalized,
    room,
    awardRoomCode,
  );
  if (existingLogs.length > 0) {
    return restoreScopedAwardResult(existingLogs, studentIds);
  }

  const storedRequest = buildStoredAwardRequest(
    normalized,
    room,
    studentIds,
  );
  const hasStoredQuestions = storedRequest.contributions.some((contribution) =>
    contribution.questions.some((question) => question.trim().length > 0)
  );
  const ai = hasStoredQuestions
    ? await callAI(storedRequest, userId)
    : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const lockKey = `${gameId}:${awardRoomCode}`;
      await tx.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0)
        )::text AS "lock"
      `;
      const rows = await tx.$queryRaw<Array<{ data: Prisma.JsonValue }>>`
        SELECT "data"
        FROM "game_rooms"
        WHERE "code" = ${roomCode}
        FOR SHARE
      `;
      const lockedRoom = requireAwardableRoom(
        normalized,
        parseGameRoom(rows[0]?.data),
        userId,
      );
      const lockedParticipantIds = participantIdsForRoom(lockedRoom);
      await lockAwardScopeRows(tx, userId, lockedParticipantIds);
      const currentTeacherScope = await loadCurrentTeacherScope(tx, userId);
      if (!currentTeacherScope) {
        throw new PointAwardError("교사 소속 학교를 확인할 수 없습니다", 403);
      }
      const lockedStudentIds = await loadScopedStudentIds(
        lockedRoom,
        tx,
        currentTeacherScope,
      );
      const lockedExistingLogs = await findAwardLogs(
        tx,
        normalized,
        lockedRoom,
        awardRoomCode,
      );
      if (lockedExistingLogs.length > 0) {
        return restoreScopedAwardResult(lockedExistingLogs, lockedStudentIds);
      }

      if (lockedRoom.version !== room.version) {
        throw new PointAwardError("놀이 결과가 바뀌었습니다. 다시 확인해 주세요", 409);
      }
      const lockedRequest = buildStoredAwardRequest(
        normalized,
        lockedRoom,
        lockedStudentIds,
      );
      const { awards, bestQuestion, summary } = buildAwardList(lockedRequest, ai);
      const resultSnapshot = serializeGameAwardResultSnapshot({
        bestQuestion,
        summary,
      });
      const sumByStudent: Record<string, number> = {};
      for (const award of awards) {
        sumByStudent[award.studentId] =
          (sumByStudent[award.studentId] ?? 0) + award.points;
      }

      await tx.pointLog.createMany({
        data: awards.map((award, index) => ({
          studentId: award.studentId,
          gameId,
          roomCode: awardRoomCode,
          bonusType: award.bonusType,
          points: award.points,
          reason: award.reason,
          status: "APPROVED",
          ...(index === 0 ? { aiAnalysis: resultSnapshot } : {}),
        })),
      });
      for (const [id, points] of Object.entries(sumByStudent)) {
        await tx.user.update({
          where: { id },
          data: { totalPoints: { increment: points } },
        });
      }

      return { awards, bestQuestion, summary };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof PointAwardError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new PointAwardError("점수 자료가 바뀌었습니다. 다시 시도해 주세요", 409);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const currentScope = await loadTeacherStudentScope(userId);
      if (!currentScope) {
        throw new PointAwardError("교사 소속 학교를 확인할 수 없습니다", 403);
      }
      const currentStudentIds = await loadScopedStudentIds(
        room,
        prisma,
        currentScope,
      );
      const logs = await findAwardLogs(
        prisma,
        normalized,
        room,
        awardRoomCode,
      );
      if (logs.length === 0) {
        throw new PointAwardError("포인트 지급 실패", 500);
      }
      return restoreScopedAwardResult(logs, currentStudentIds);
    }
    throw new PointAwardError("포인트 지급 실패", 500);
  }
}
