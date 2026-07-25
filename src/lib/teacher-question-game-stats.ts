import { prisma } from "@/lib/db";
import { BASE_POINTS, pointBonusSpec } from "@/lib/points-policy";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";

type PlayMode = "solo" | "ai" | "friend";

interface ModeStat {
  plays: number;
  completions: number;
  points: number;
  goodQuestions: number;
}

export interface TeacherQuestionGameStudentStat {
  id: string;
  name: string;
  studentNumber: string | null;
  plays: number;
  completions: number;
  points: number;
  goodQuestions: number;
  lastPlayedAt: string | null;
  modes: Record<PlayMode, ModeStat>;
}

export interface TeacherQuestionGameStudent {
  id: string;
  name: string;
  studentNumber: string | null;
}

export interface TeacherQuestionGameStat {
  participants: number;
  plays: number;
  completions: number;
  goodQuestions: number;
  lastPlayedAt: string | null;
  students: TeacherQuestionGameStudentStat[];
  nonParticipants: TeacherQuestionGameStudent[];
}

const QUESTION_GAME_POINT_LOG_IDS = [
  ...BUILT_IN_QUESTION_GAME_IDS,
  "ACTIVITY_SOLO",
  "ACTIVITY_AI",
];

function emptyModeStat(): ModeStat {
  return { plays: 0, completions: 0, points: 0, goodQuestions: 0 };
}

function emptyModes(): Record<PlayMode, ModeStat> {
  return {
    solo: emptyModeStat(),
    ai: emptyModeStat(),
    friend: emptyModeStat(),
  };
}

function validQuestionCount(reason: string | undefined, points: number) {
  const match = reason?.match(/^유효 질문 ([1-9][0-9]*)개$/);
  if (match) return Number(match[1]);
  return Math.max(0, Math.round(points / BASE_POINTS.PER_VALID_QUESTION));
}

function friendRunKey(log: {
  studentId: string;
  gameId: string;
  roomCode?: string | null;
  createdAt: Date;
}) {
  return [
    log.studentId,
    log.gameId,
    log.roomCode ?? log.createdAt.toISOString(),
  ].join("\u0000");
}

export async function loadTeacherQuestionGameStats(
  students: TeacherQuestionGameStudent[],
): Promise<Record<string, TeacherQuestionGameStat>> {
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const ids = students.map((student) => student.id);
  if (ids.length === 0) return {};

  const [logs, runs] = await Promise.all([
    prisma.pointLog.findMany({
      where: {
        studentId: { in: ids },
        status: "APPROVED",
        gameId: { in: QUESTION_GAME_POINT_LOG_IDS },
      },
      select: {
        gameId: true,
        gameRunId: true,
        roomCode: true,
        studentId: true,
        bonusType: true,
        points: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.gameRun.findMany({
      where: {
        ownerId: { in: ids },
        gameId: { in: [...BUILT_IN_QUESTION_GAME_IDS] },
        mode: { in: ["SOLO", "AI"] },
        status: "SETTLED",
      },
      select: {
        id: true,
        gameId: true,
        mode: true,
        ownerId: true,
        settledAt: true,
        activities: {
          select: { actorId: true, validQuestionCount: true },
        },
        pointLogs: {
          where: { status: "APPROVED" },
          select: { studentId: true, points: true },
        },
      },
    }),
  ]);

  const byGame: Record<string, TeacherQuestionGameStat> = {};
  const perStudent: Record<
    string,
    Map<string, TeacherQuestionGameStudentStat>
  > = {};

  const ensureGame = (gameId: string) => {
    if (!byGame[gameId]) {
      byGame[gameId] = {
        participants: 0,
        plays: 0,
        completions: 0,
        goodQuestions: 0,
        lastPlayedAt: null,
        students: [],
        nonParticipants: [],
      };
      perStudent[gameId] = new Map();
    }
    return byGame[gameId];
  };

  const ensureStudent = (gameId: string, studentId: string) => {
    const meta = studentMap.get(studentId);
    if (!meta) return null;
    ensureGame(gameId);
    let row = perStudent[gameId].get(studentId);
    if (!row) {
      row = {
        id: meta.id,
        name: meta.name,
        studentNumber: meta.studentNumber,
        plays: 0,
        completions: 0,
        points: 0,
        goodQuestions: 0,
        lastPlayedAt: null,
        modes: emptyModes(),
      };
      perStudent[gameId].set(studentId, row);
    }
    return row;
  };

  const updateLastPlayedAt = (
    gameId: string,
    row: TeacherQuestionGameStudentStat,
    playedAt: Date | null,
  ) => {
    if (!(playedAt instanceof Date) || Number.isNaN(playedAt.getTime())) return;
    const stat = ensureGame(gameId);
    const value = playedAt.toISOString();
    if (!stat.lastPlayedAt || value > stat.lastPlayedAt) stat.lastPlayedAt = value;
    if (!row.lastPlayedAt || value > row.lastPlayedAt) row.lastPlayedAt = value;
  };

  const friendBaseRuns = new Set(
    logs
      .filter((log) =>
        isBuiltInQuestionGameId(log.gameId) &&
        (log.bonusType === "PARTICIPATION" || log.bonusType === "COMPLETION")
      )
      .map(friendRunKey),
  );

  for (const log of logs) {
    const bonusSpec = pointBonusSpec(log.bonusType);
    const isVerifiedRunLog = bonusSpec.kind === "game" && (
      (log.gameId === "ACTIVITY_SOLO" && bonusSpec.mode === "solo") ||
      (log.gameId === "ACTIVITY_AI" && bonusSpec.mode === "ai")
    );

    if (isVerifiedRunLog && log.gameRunId) continue;

    const gameId = isVerifiedRunLog ? bonusSpec.gameId : log.gameId;
    if (!isBuiltInQuestionGameId(gameId)) continue;
    const row = ensureStudent(gameId, log.studentId);
    if (!row) continue;

    const mode: PlayMode = isVerifiedRunLog ? bonusSpec.mode : "friend";
    row.points += log.points;
    row.modes[mode].points += log.points;

    if (isVerifiedRunLog) {
      row.plays += 1;
      row.completions += 1;
      row.modes[mode].plays += 1;
      row.modes[mode].completions += 1;
    } else if (log.bonusType === "PARTICIPATION") {
      row.plays += 1;
      row.modes.friend.plays += 1;
    } else if (log.bonusType === "COMPLETION") {
      row.completions += 1;
      row.modes.friend.completions += 1;
    } else if (
      log.bonusType === "FRIEND_DAILY_LIMIT" &&
      !friendBaseRuns.has(friendRunKey(log))
    ) {
      row.plays += 1;
      row.completions += 1;
      row.modes.friend.plays += 1;
      row.modes.friend.completions += 1;
    }

    if (log.bonusType === "VALID_QUESTIONS") {
      const count = validQuestionCount(log.reason, log.points);
      row.goodQuestions += count;
      row.modes.friend.goodQuestions += count;
    }
    updateLastPlayedAt(gameId, row, log.createdAt);
  }

  for (const run of runs) {
    if (
      !isBuiltInQuestionGameId(run.gameId) ||
      !run.ownerId ||
      (run.mode !== "SOLO" && run.mode !== "AI")
    ) {
      continue;
    }
    const row = ensureStudent(run.gameId, run.ownerId);
    if (!row) continue;
    const mode: PlayMode = run.mode === "SOLO" ? "solo" : "ai";
    const goodQuestions = run.activities.reduce(
      (sum, activity) =>
        activity.actorId === run.ownerId &&
        Number.isSafeInteger(activity.validQuestionCount) &&
        activity.validQuestionCount > 0
          ? sum + activity.validQuestionCount
          : sum,
      0,
    );
    const points = run.pointLogs.reduce(
      (sum, log) =>
        log.studentId === run.ownerId &&
        Number.isSafeInteger(log.points)
          ? sum + log.points
          : sum,
      0,
    );

    row.plays += 1;
    row.completions += 1;
    row.points += points;
    row.goodQuestions += goodQuestions;
    row.modes[mode].plays += 1;
    row.modes[mode].completions += 1;
    row.modes[mode].points += points;
    row.modes[mode].goodQuestions += goodQuestions;
    updateLastPlayedAt(run.gameId, row, run.settledAt);
  }

  for (const gameId of Object.keys(byGame)) {
    const rows = Array.from(perStudent[gameId].values());
    const active = rows.filter((row) => row.plays > 0 || row.points > 0);
    byGame[gameId].participants = active.filter((row) => row.plays > 0).length;
    byGame[gameId].plays = active.reduce((sum, row) => sum + row.plays, 0);
    byGame[gameId].completions = active.reduce(
      (sum, row) => sum + row.completions,
      0,
    );
    byGame[gameId].goodQuestions = active.reduce(
      (sum, row) => sum + row.goodQuestions,
      0,
    );
    byGame[gameId].students = active.sort(
      (first, second) =>
        second.plays - first.plays || second.points - first.points,
    );
    const playedIds = new Set(
      active.filter((row) => row.plays > 0).map((row) => row.id),
    );
    byGame[gameId].nonParticipants = students
      .filter((student) => !playedIds.has(student.id))
      .map((student) => ({
        id: student.id,
        name: student.name,
        studentNumber: student.studentNumber,
      }));
  }

  return byGame;
}
