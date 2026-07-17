import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BUILT_IN_QUESTION_GAME_IDS } from "@/lib/question-game-rules";
import type {
  QuestionGameHistoryItem,
  QuestionGameHistoryMode,
  QuestionGameHistoryPage,
  QuestionGameLearningHistory,
} from "@/lib/question-game-history";

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;

interface HistoryCursor {
  completedAt: string;
  id: string;
}

interface RawHistoryRow {
  id: string;
  gameId: string;
  mode: QuestionGameHistoryMode;
  completedAt: Date;
  points: bigint | number;
  goodQuestions: bigint | number;
}

interface RawSummaryRow {
  mode: QuestionGameHistoryMode;
  plays: bigint | number;
  points: bigint | number;
  goodQuestions: bigint | number;
}

function emptyHistory(): QuestionGameLearningHistory {
  return {
    totals: { plays: 0, points: 0, goodQuestions: 0 },
    modes: {
      solo: { plays: 0, points: 0, goodQuestions: 0 },
      ai: { plays: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 0, points: 0, goodQuestions: 0 },
    },
    recent: [],
    nextCursor: null,
  };
}

function safeNumber(value: bigint | number) {
  const number = typeof value === "bigint" ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function encodeHistoryCursor(item: QuestionGameHistoryItem) {
  return Buffer.from(JSON.stringify({
    completedAt: item.completedAt,
    id: item.id,
  } satisfies HistoryCursor)).toString("base64url");
}

function decodeHistoryCursor(value: string | undefined): HistoryCursor | null {
  if (!value) return null;
  try {
    if (value.length > 500) return null;
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("completedAt" in parsed) ||
      !("id" in parsed) ||
      typeof parsed.completedAt !== "string" ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      parsed.id.length > 300
    ) return null;
    const completedAt = new Date(parsed.completedAt);
    if (Number.isNaN(completedAt.getTime())) return null;
    return { completedAt: completedAt.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export function isQuestionGameHistoryCursor(value: string | undefined) {
  return value === undefined || decodeHistoryCursor(value) !== null;
}

function playRowsSql(studentIds: string[]) {
  const studentList = Prisma.join(studentIds);
  const gameList = Prisma.join([...BUILT_IN_QUESTION_GAME_IDS]);
  return Prisma.sql`
    solo_plays AS (
      SELECT
        'run:' || gr."id" AS "id",
        gr."game_id" AS "gameId",
        LOWER(gr."mode") AS "mode",
        gr."settled_at" AS "completedAt",
        COALESCE((
          SELECT SUM(GREATEST(pl."points", 0))
          FROM "point_logs" pl
          WHERE pl."game_run_id" = gr."id"
            AND pl."student_id" = gr."owner_id"
            AND pl."status" = 'APPROVED'
        ), 0) AS "points",
        COALESCE((
          SELECT SUM(GREATEST(ga."valid_question_count", 0))
          FROM "game_activities" ga
          WHERE ga."run_id" = gr."id"
            AND ga."actor_id" = gr."owner_id"
        ), 0) AS "goodQuestions"
      FROM "game_runs" gr
      WHERE gr."owner_id" IN (${studentList})
        AND gr."status" = 'SETTLED'
        AND gr."mode" IN ('SOLO', 'AI')
        AND gr."game_id" IN (${gameList})
        AND gr."settled_at" IS NOT NULL
    ),
    friend_plays AS (
      SELECT
        'friend:' || pl."room_code" AS "id",
        (ARRAY_AGG(pl."game_id" ORDER BY pl."created_at" DESC))[1] AS "gameId",
        'friend'::text AS "mode",
        MAX(pl."created_at") AS "completedAt",
        SUM(GREATEST(pl."points", 0)) AS "points",
        SUM(
          CASE
            WHEN pl."bonus_type" = 'VALID_QUESTIONS'
              AND pl."reason" ~ '^유효 질문 [1-9][0-9]*개$'
            THEN (SUBSTRING(pl."reason" FROM '[0-9]+'))::integer
            ELSE 0
          END
        ) AS "goodQuestions"
      FROM "point_logs" pl
      WHERE pl."student_id" IN (${studentList})
        AND pl."status" = 'APPROVED'
        AND pl."game_id" IN (${gameList})
        AND pl."room_code" LIKE 'room:%'
      GROUP BY pl."student_id", pl."room_code"
      HAVING BOOL_OR(pl."bonus_type" IN ('PARTICIPATION', 'FRIEND_DAILY_LIMIT'))
    ),
    all_plays AS (
      SELECT * FROM solo_plays
      UNION ALL
      SELECT * FROM friend_plays
    )
  `;
}

function summaryFromRows(rows: RawSummaryRow[]): QuestionGameLearningHistory {
  const history = emptyHistory();
  for (const row of rows) {
    if (row.mode !== "solo" && row.mode !== "ai" && row.mode !== "friend") continue;
    const value = {
      plays: safeNumber(row.plays),
      points: safeNumber(row.points),
      goodQuestions: safeNumber(row.goodQuestions),
    };
    history.modes[row.mode] = value;
    history.totals.plays += value.plays;
    history.totals.points += value.points;
    history.totals.goodQuestions += value.goodQuestions;
  }
  return history;
}

async function loadSummary(studentIds: string[]) {
  if (studentIds.length === 0) return emptyHistory();
  const rows = await prisma.$queryRaw<RawSummaryRow[]>(Prisma.sql`
    WITH ${playRowsSql(studentIds)}
    SELECT
      "mode",
      COUNT(*) AS "plays",
      COALESCE(SUM("points"), 0) AS "points",
      COALESCE(SUM("goodQuestions"), 0) AS "goodQuestions"
    FROM all_plays
    GROUP BY "mode"
  `);
  return summaryFromRows(rows);
}

function rowToHistoryItem(row: RawHistoryRow): QuestionGameHistoryItem {
  return {
    id: row.id,
    gameId: row.gameId,
    mode: row.mode,
    completedAt: row.completedAt.toISOString(),
    points: safeNumber(row.points),
    goodQuestions: safeNumber(row.goodQuestions),
  };
}

export async function loadQuestionGameHistoryPage({
  studentId,
  mode,
  gameId,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
}: {
  studentId: string;
  mode?: QuestionGameHistoryMode;
  gameId?: string;
  cursor?: string;
  limit?: number;
}): Promise<QuestionGameHistoryPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError("올바르지 않은 페이지 크기입니다");
  }
  const decodedCursor = decodeHistoryCursor(cursor);
  if (cursor && !decodedCursor) throw new RangeError("올바르지 않은 이력 위치입니다");

  const filters: Prisma.Sql[] = [];
  if (mode) filters.push(Prisma.sql`"mode" = ${mode}`);
  if (gameId) filters.push(Prisma.sql`"gameId" = ${gameId}`);
  if (decodedCursor) {
    filters.push(Prisma.sql`(
      "completedAt" < ${new Date(decodedCursor.completedAt)}
      OR ("completedAt" = ${new Date(decodedCursor.completedAt)} AND "id" > ${decodedCursor.id})
    )`);
  }
  const where = filters.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<RawHistoryRow[]>(Prisma.sql`
    WITH ${playRowsSql([studentId])}
    SELECT "id", "gameId", "mode", "completedAt", "points", "goodQuestions"
    FROM all_plays
    ${where}
    ORDER BY "completedAt" DESC, "id" ASC
    LIMIT ${limit + 1}
  `);
  const items = rows.slice(0, limit).map(rowToHistoryItem);
  return {
    items,
    nextCursor: rows.length > limit && items.length > 0
      ? encodeHistoryCursor(items[items.length - 1])
      : null,
  };
}

export async function loadQuestionGameLearningHistory(
  studentId: string,
  recentLimit = DEFAULT_PAGE_SIZE,
): Promise<QuestionGameLearningHistory> {
  const [summary, page] = await Promise.all([
    loadSummary([studentId]),
    loadQuestionGameHistoryPage({ studentId, limit: recentLimit }),
  ]);
  return { ...summary, recent: page.items, nextCursor: page.nextCursor };
}

export async function loadQuestionGameClassSummary(
  studentIds: string[],
): Promise<QuestionGameLearningHistory> {
  return loadSummary([...new Set(studentIds)]);
}
