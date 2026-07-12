import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateJson } from "@/lib/ai";
import { loadGameRoom } from "@/lib/game-room-store";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";
import {
  BASE_POINTS,
  AI_BONUS_TYPES,
  VALID_BONUS_KEYS,
  MAX_BONUS_PER_STUDENT,
  MAX_BONUSES_PER_STUDENT,
  SYSTEM_BONUS,
  GAME_LABEL,
  type BonusKey,
} from "@/lib/points-policy";

interface StudentContribution {
  studentId: string;
  studentName: string;
  validQuestions: number;
  questions: string[];
  isWinner: boolean;
}

interface AwardRequest {
  gameId: string;
  roomCode: string;
  roomCreatedAt: number;
  topic?: string;
  contributions: StudentContribution[];
}

interface AIBonus { studentId: string; bonusType: string; points?: number; reason: string }
interface AIVerdictResponse { bonuses: AIBonus[]; bestQuestion?: { studentId: string; question: string; reason: string }; summary?: string }
interface Award { studentId: string; bonusType: string; points: number; reason: string }
interface AwardResultSnapshot {
  type: "game-room-award-result";
  version: 1;
  bestQuestion?: { studentId: string; question: string; reason: string };
  summary?: string;
}

const AWARD_RESULT_TYPE = "game-room-award-result";
const AWARD_RESULT_VERSION = 1;

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

function normalizeAwardRequest(body: Partial<AwardRequest>): AwardRequest {
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
  const contributions = Array.isArray(body.contributions) ? body.contributions : [];
  if (!gameId || !roomCode || contributions.length === 0) {
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
  return {
    gameId,
    roomCode,
    roomCreatedAt: body.roomCreatedAt,
    topic: body.topic,
    contributions: contributions as StudentContribution[],
  };
}

function buildRoomAwardKey(roomCode: string, roomCreatedAt: number) {
  return `room:${roomCode}:${roomCreatedAt}`;
}

function requireCurrentRoom(req: AwardRequest, room: GameRoom | null): GameRoom {
  if (
    !room ||
    room.code !== req.roomCode ||
    room.gameId !== req.gameId ||
    room.createdAt !== req.roomCreatedAt
  ) {
    throw new PointAwardError("방이 바뀌었습니다. 다시 열어 주세요", 409);
  }
  return room;
}

function buildAwardLogWhere(
  req: AwardRequest,
  room: GameRoom,
): Prisma.PointLogWhereInput {
  const awardKey = buildRoomAwardKey(req.roomCode, req.roomCreatedAt);
  if (room.pointAwardKeyVersion === 1) {
    return { gameId: req.gameId, roomCode: awardKey };
  }
  return {
    gameId: req.gameId,
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
  req: AwardRequest,
  room: GameRoom,
) {
  return client.pointLog.findMany({
    where: buildAwardLogWhere(req, room),
    orderBy: { createdAt: "asc" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAwardResultSnapshot(value: unknown): AwardResultSnapshot | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      parsed.type !== AWARD_RESULT_TYPE ||
      parsed.version !== AWARD_RESULT_VERSION ||
      (parsed.summary !== undefined && typeof parsed.summary !== "string")
    ) {
      return null;
    }
    if (parsed.bestQuestion !== undefined) {
      if (
        !isRecord(parsed.bestQuestion) ||
        typeof parsed.bestQuestion.studentId !== "string" ||
        typeof parsed.bestQuestion.question !== "string" ||
        typeof parsed.bestQuestion.reason !== "string"
      ) {
        return null;
      }
    }
    return parsed as unknown as AwardResultSnapshot;
  } catch {
    return null;
  }
}

function restoreAwardResult<T extends { aiAnalysis?: string | null }>(logs: T[]) {
  let snapshot: AwardResultSnapshot | null = null;
  for (const log of logs) {
    snapshot = parseAwardResultSnapshot(log.aiAnalysis);
    if (snapshot) break;
  }
  return {
    alreadyAwarded: true,
    awards: logs,
    ...(snapshot?.bestQuestion ? { bestQuestion: snapshot.bestQuestion } : {}),
    ...(snapshot?.summary !== undefined ? { summary: snapshot.summary } : {}),
  };
}

function serializeAwardResult(
  bestQuestion: AwardResultSnapshot["bestQuestion"],
  summary: string | undefined,
) {
  return JSON.stringify({
    type: AWARD_RESULT_TYPE,
    version: AWARD_RESULT_VERSION,
    ...(bestQuestion ? { bestQuestion } : {}),
    ...(summary !== undefined ? { summary } : {}),
  });
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
  awards: Award[];
  bestQuestion?: { studentId: string; question: string; reason: string };
  summary?: string;
} {
  const awards: Award[] = [];
  const validIds = new Set(req.contributions.map((c) => c.studentId));

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

  let bestQuestion: AIVerdictResponse["bestQuestion"];
  let summary: string | undefined;
  if (ai) {
    summary = ai.summary;
    bestQuestion = ai.bestQuestion && validIds.has(ai.bestQuestion.studentId)
      ? ai.bestQuestion : undefined;

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

    for (const b of ai.bonuses ?? []) {
      if (!validIds.has(b.studentId)) continue;
      if (!VALID_BONUS_KEYS.includes(b.bonusType as BonusKey)) continue;
      if (b.bonusType === "BEST_QUESTION") continue;
      const def = AI_BONUS_TYPES[b.bonusType as BonusKey];
      const s = perStudent[b.studentId];
      if (s.types.has(def.key)) continue;
      if (s.count >= MAX_BONUSES_PER_STUDENT) continue;
      if (s.sum + def.points > MAX_BONUS_PER_STUDENT) continue;
      awards.push({
        studentId: b.studentId, bonusType: def.key,
        points: def.points, reason: b.reason || def.label,
      });
      s.count++; s.sum += def.points; s.types.add(def.key);
    }
  }

  return { awards, bestQuestion, summary };
}

export async function awardGamePoints(body: Partial<AwardRequest>, userId: string) {
  const normalized = normalizeAwardRequest(body);
  const { gameId, roomCode, roomCreatedAt } = normalized;
  const room = requireCurrentRoom(
    normalized,
    await loadGameRoom(roomCode),
  );
  const awardRoomCode = buildRoomAwardKey(roomCode, roomCreatedAt);

  const existingLogs = await findAwardLogs(prisma, normalized, room);
  if (existingLogs.length > 0) return restoreAwardResult(existingLogs);

  const ai = await callAI(normalized, userId);
  const { awards, bestQuestion, summary } = buildAwardList(normalized, ai);
  const resultSnapshot = serializeAwardResult(bestQuestion, summary);

  const sumByStudent: Record<string, number> = {};
  for (const a of awards) {
    sumByStudent[a.studentId] = (sumByStudent[a.studentId] ?? 0) + a.points;
  }

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
      const lockedRoom = requireCurrentRoom(
        normalized,
        parseGameRoom(rows[0]?.data),
      );
      const lockedExistingLogs = await findAwardLogs(
        tx,
        normalized,
        lockedRoom,
      );
      if (lockedExistingLogs.length > 0) {
        return restoreAwardResult(lockedExistingLogs);
      }

      await tx.pointLog.createMany({
        data: awards.map((award, index) => ({
          studentId: award.studentId,
          gameId,
          roomCode: awardRoomCode,
          bonusType: award.bonusType,
          points: award.points,
          reason: award.reason,
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
    });
  } catch (err) {
    if (err instanceof PointAwardError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const logs = await findAwardLogs(prisma, normalized, room);
      if (logs.length === 0) {
        throw new PointAwardError("포인트 지급 실패", 500);
      }
      return restoreAwardResult(logs);
    }
    throw new PointAwardError("포인트 지급 실패", 500);
  }
}
