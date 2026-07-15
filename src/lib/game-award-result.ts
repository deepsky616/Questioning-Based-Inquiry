export interface GameAward {
  studentId: string;
  bonusType: string;
  points: number;
  reason: string;
}

export interface GameAwardBestQuestion {
  studentId: string;
  question: string;
  reason: string;
}

export interface GameAwardResult {
  awards: GameAward[];
  bestQuestion?: GameAwardBestQuestion;
  summary?: string;
}

interface GameAwardResultSnapshot {
  type: "game-room-award-result";
  version: 1;
  bestQuestion?: GameAwardBestQuestion;
  summary?: string;
}

interface GameAwardResultSnapshotInput {
  bestQuestion?: GameAwardBestQuestion;
  summary?: string;
}

const SNAPSHOT_TYPE = "game-room-award-result";
const SNAPSHOT_VERSION = 1;
const MAX_AWARDS = 256;
const MAX_TEXT_LENGTH = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key));
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TEXT_LENGTH &&
    value === value.trim();
}

function isSummary(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function isGameAward(value: unknown): value is GameAward {
  return isRecord(value) &&
    hasExactKeys(value, ["studentId", "bonusType", "points", "reason"]) &&
    isNonEmptyText(value.studentId) &&
    isNonEmptyText(value.bonusType) &&
    typeof value.points === "number" &&
    Number.isSafeInteger(value.points) &&
    isNonEmptyText(value.reason);
}

function isBestQuestion(value: unknown): value is GameAwardBestQuestion {
  return isRecord(value) &&
    hasExactKeys(value, ["studentId", "question", "reason"]) &&
    isNonEmptyText(value.studentId) &&
    isNonEmptyText(value.question) &&
    isNonEmptyText(value.reason);
}

function readSnapshot(value: unknown): GameAwardResultSnapshot | null {
  if (typeof value !== "string" || value.length > 16_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      !hasExactKeys(parsed, ["type", "version"], ["bestQuestion", "summary"]) ||
      parsed.type !== SNAPSHOT_TYPE ||
      parsed.version !== SNAPSHOT_VERSION ||
      (parsed.bestQuestion !== undefined && !isBestQuestion(parsed.bestQuestion)) ||
      (parsed.summary !== undefined && !isSummary(parsed.summary))
    ) {
      return null;
    }
    return parsed as unknown as GameAwardResultSnapshot;
  } catch {
    return null;
  }
}

export function isGameAwardResult(value: unknown): value is GameAwardResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["awards"], ["bestQuestion", "summary"]) ||
    !Array.isArray(value.awards) ||
    value.awards.length === 0 ||
    value.awards.length > MAX_AWARDS ||
    !value.awards.every(isGameAward) ||
    (value.bestQuestion !== undefined && !isBestQuestion(value.bestQuestion)) ||
    (value.summary !== undefined && !isSummary(value.summary))
  ) {
    return false;
  }

  const awardKeys = value.awards.map(
    ({ studentId, bonusType }) => `${studentId}\u0000${bonusType}`,
  );
  if (new Set(awardKeys).size !== awardKeys.length) return false;

  const bestQuestion = value.bestQuestion;
  if (bestQuestion === undefined) return true;
  if (!isBestQuestion(bestQuestion)) return false;
  return value.awards.some(
    ({ studentId }) => studentId === bestQuestion.studentId,
  );
}

function compareAwardIdentity(first: GameAward, second: GameAward) {
  if (first.studentId !== second.studentId) {
    return first.studentId < second.studentId ? -1 : 1;
  }
  if (first.bonusType === second.bonusType) return 0;
  return first.bonusType < second.bonusType ? -1 : 1;
}

export function gameAwardResultsMatch(
  first: GameAwardResult | undefined,
  second: GameAwardResult | undefined,
): boolean {
  if (!first || !second || first.awards.length !== second.awards.length) {
    return false;
  }
  if (first.summary !== second.summary) return false;

  const firstBest = first.bestQuestion;
  const secondBest = second.bestQuestion;
  if (
    (firstBest === undefined) !== (secondBest === undefined) ||
    (firstBest !== undefined && secondBest !== undefined && (
      firstBest.studentId !== secondBest.studentId ||
      firstBest.question !== secondBest.question ||
      firstBest.reason !== secondBest.reason
    ))
  ) {
    return false;
  }

  const firstAwards = [...first.awards].sort(compareAwardIdentity);
  const secondAwards = [...second.awards].sort(compareAwardIdentity);
  return firstAwards.every((award, index) => {
    const other = secondAwards[index];
    return other !== undefined &&
      award.studentId === other.studentId &&
      award.bonusType === other.bonusType &&
      award.points === other.points &&
      award.reason === other.reason;
  });
}

export function serializeGameAwardResultSnapshot(
  input: GameAwardResultSnapshotInput,
): string {
  if (
    (input.bestQuestion !== undefined && !isBestQuestion(input.bestQuestion)) ||
    (input.summary !== undefined && !isSummary(input.summary))
  ) {
    throw new TypeError("Invalid game award result snapshot");
  }
  return JSON.stringify({
    type: SNAPSHOT_TYPE,
    version: SNAPSHOT_VERSION,
    ...(input.bestQuestion ? { bestQuestion: input.bestQuestion } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
  } satisfies GameAwardResultSnapshot);
}

export function restorePublishableAwardResult(
  logs: readonly unknown[],
): GameAwardResult | null {
  if (logs.length === 0 || logs.length > MAX_AWARDS) return null;

  const awards: GameAward[] = [];
  let snapshot: GameAwardResultSnapshot | null = null;
  for (const value of logs) {
    if (!isRecord(value)) return null;
    const award = {
      studentId: value.studentId,
      bonusType: value.bonusType,
      points: value.points,
      reason: value.reason,
    };
    if (!isGameAward(award)) return null;
    awards.push(award);
    if (!snapshot) snapshot = readSnapshot(value.aiAnalysis);
  }

  const studentIds = new Set(awards.map(({ studentId }) => studentId));
  const result: GameAwardResult = {
    awards,
    ...(snapshot?.bestQuestion && studentIds.has(snapshot.bestQuestion.studentId)
      ? { bestQuestion: snapshot.bestQuestion }
      : {}),
    ...(snapshot?.summary !== undefined ? { summary: snapshot.summary } : {}),
  };
  return isGameAwardResult(result) ? result : null;
}
