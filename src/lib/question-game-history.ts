export interface QuestionGamePlayLog {
  id: string;
  bonusType: string;
  gameId: string;
  roomCode: string | null;
  gameRunId: string | null;
}

export type QuestionGameHistoryMode = "solo" | "ai" | "friend";

export interface QuestionGameHistoryItem {
  id: string;
  gameId: string;
  mode: QuestionGameHistoryMode;
  completedAt: string;
  points: number;
  goodQuestions: number;
}

export interface QuestionGameDailyPoint {
  date: string;
  plays: number;
  goodQuestions: number;
}

export interface QuestionGameModeActivity {
  plays: number;
  completions: number;
  participants: number;
}

export interface QuestionGameModeSummary {
  gameId: string;
  modes: Record<QuestionGameHistoryMode, QuestionGameModeActivity>;
}

export interface QuestionGameLearningHistory {
  totals: { plays: number; points: number; goodQuestions: number };
  modes: Record<QuestionGameHistoryMode, {
    plays: number;
    points: number;
    goodQuestions: number;
  }>;
  recent: QuestionGameHistoryItem[];
  daily?: QuestionGameDailyPoint[];
  gameModes?: QuestionGameModeSummary[];
  nextCursor?: string | null;
}

export interface QuestionGameHistoryPage {
  items: QuestionGameHistoryItem[];
  nextCursor: string | null;
}

interface HistoryRun {
  id: string;
  gameId: string;
  mode: string;
  settledAt: Date | string | null;
  activities: Array<{ actorId: string | null; validQuestionCount: number }>;
  pointLogs: Array<{ studentId: string; points: number }>;
}

interface HistoryFriendLog {
  id: string;
  gameId: string;
  roomCode: string | null;
  bonusType: string;
  points: number;
  reason: string;
  createdAt: Date | string;
}

function historyDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function emptyQuestionGameModeActivity(): Record<
  QuestionGameHistoryMode,
  QuestionGameModeActivity
> {
  return {
    solo: { plays: 0, completions: 0, participants: 0 },
    ai: { plays: 0, completions: 0, participants: 0 },
    friend: { plays: 0, completions: 0, participants: 0 },
  };
}

export function validQuestionCountFromReason(reason: string): number {
  const match = reason.match(/^유효 질문 ([1-9][0-9]*)개$/);
  return match ? Number(match[1]) : 0;
}

export function buildQuestionGameLearningHistory({
  studentId,
  runs,
  friendLogs,
  recentLimit = 8,
}: {
  studentId: string;
  runs: HistoryRun[];
  friendLogs: HistoryFriendLog[];
  recentLimit?: number;
}): QuestionGameLearningHistory {
  const items: QuestionGameHistoryItem[] = [];

  for (const run of runs) {
    const mode = run.mode === "SOLO" ? "solo" : run.mode === "AI" ? "ai" : null;
    const settledAt = historyDate(run.settledAt);
    if (!mode || !settledAt) continue;
    items.push({
      id: `run:${run.id}`,
      gameId: run.gameId,
      mode,
      completedAt: settledAt.toISOString(),
      points: run.pointLogs.reduce(
        (sum, log) => log.studentId === studentId ? sum + Math.max(0, log.points) : sum,
        0,
      ),
      goodQuestions: run.activities.reduce(
        (sum, activity) => activity.actorId === studentId
          ? sum + Math.max(0, activity.validQuestionCount)
          : sum,
        0,
      ),
    });
  }

  const friendGroups = new Map<string, HistoryFriendLog[]>();
  for (const log of friendLogs) {
    const key = log.roomCode ?? log.id;
    const group = friendGroups.get(key) ?? [];
    group.push(log);
    friendGroups.set(key, group);
  }
  for (const [key, logs] of friendGroups) {
    if (!logs.some(({ bonusType }) =>
      bonusType === "PARTICIPATION" || bonusType === "FRIEND_DAILY_LIMIT"
    )) continue;
    const dated = logs
      .map((log) => ({ log, date: historyDate(log.createdAt) }))
      .filter((entry): entry is { log: HistoryFriendLog; date: Date } => entry.date !== null)
      .sort((first, second) => second.date.getTime() - first.date.getTime());
    const latest = dated[0];
    if (!latest) continue;
    items.push({
      id: `friend:${key}`,
      gameId: latest.log.gameId,
      mode: "friend",
      completedAt: latest.date.toISOString(),
      points: logs.reduce((sum, log) => sum + Math.max(0, log.points), 0),
      goodQuestions: logs.reduce(
        (sum, log) => sum + (
          log.bonusType === "VALID_QUESTIONS"
            ? validQuestionCountFromReason(log.reason)
            : 0
        ),
        0,
      ),
    });
  }

  items.sort((first, second) =>
    second.completedAt.localeCompare(first.completedAt) || first.id.localeCompare(second.id)
  );
  const modes: QuestionGameLearningHistory["modes"] = {
    solo: { plays: 0, points: 0, goodQuestions: 0 },
    ai: { plays: 0, points: 0, goodQuestions: 0 },
    friend: { plays: 0, points: 0, goodQuestions: 0 },
  };
  for (const item of items) {
    modes[item.mode].plays += 1;
    modes[item.mode].points += item.points;
    modes[item.mode].goodQuestions += item.goodQuestions;
  }
  const byGame = new Map<string, QuestionGameModeSummary>();
  for (const item of items) {
    const summary = byGame.get(item.gameId) ?? {
      gameId: item.gameId,
      modes: emptyQuestionGameModeActivity(),
    };
    const mode = summary.modes[item.mode];
    mode.plays += 1;
    mode.completions += 1;
    mode.participants = 1;
    byGame.set(item.gameId, summary);
  }

  return {
    totals: {
      plays: items.length,
      points: items.reduce((sum, item) => sum + item.points, 0),
      goodQuestions: items.reduce((sum, item) => sum + item.goodQuestions, 0),
    },
    modes,
    gameModes: [...byGame.values()].sort((first, second) =>
      first.gameId.localeCompare(second.gameId)
    ),
    recent: items.slice(0, Math.max(0, recentLimit)),
  };
}

export function countDistinctQuestionGamePlays(
  logs: QuestionGamePlayLog[],
): number {
  const plays = new Set<string>();

  for (const log of logs) {
    if (
      log.bonusType === "PARTICIPATION" ||
      log.bonusType === "FRIEND_DAILY_LIMIT"
    ) {
      plays.add(`friend:${log.roomCode ?? log.id}`);
      continue;
    }
    if (log.gameId === "ACTIVITY_SOLO" || log.gameId === "ACTIVITY_AI") {
      plays.add(`run:${log.gameRunId ?? log.id}`);
    }
  }

  return plays.size;
}
