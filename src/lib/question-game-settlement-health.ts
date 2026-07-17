export type QuestionGameSettlementStatus =
  | "settled"
  | "recovered"
  | "pending"
  | "failed";

export interface QuestionGameSettlementItem {
  code: string;
  gameId: string;
  completedAt: string;
  status: QuestionGameSettlementStatus;
  outcome?: "AWARDED" | "NO_ELIGIBLE_STUDENTS";
  reason?: string;
}

export interface QuestionGameSettlementHealth {
  checkedAt: string;
  summary: {
    checked: number;
    settled: number;
    recovered: number;
    pending: number;
    failed: number;
  };
  items: QuestionGameSettlementItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isQuestionGameSettlementHealth(
  value: unknown,
): value is QuestionGameSettlementHealth {
  if (
    !isRecord(value) ||
    typeof value.checkedAt !== "string" ||
    !isRecord(value.summary) ||
    !Array.isArray(value.items)
  ) return false;
  const summary = value.summary;
  if (![
    summary.checked,
    summary.settled,
    summary.recovered,
    summary.pending,
    summary.failed,
  ].every(isCount)) return false;
  return value.items.every((item) =>
    isRecord(item) &&
    typeof item.code === "string" &&
    typeof item.gameId === "string" &&
    typeof item.completedAt === "string" &&
    (
      item.status === "settled" ||
      item.status === "recovered" ||
      item.status === "pending" ||
      item.status === "failed"
    ) &&
    (item.reason === undefined || typeof item.reason === "string")
  );
}
