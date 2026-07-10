/**
 * 질문 연습 포인트 정책.
 *
 * 부정 방지 설계:
 * - 채점·판정은 항상 서버가 다시 수행한다(분류 퀴즈는 문항 은행 대조, 전환·생성은 AI 분류).
 * - 같은 문항은 하루 1회만 지급 — PointLog의 unique(studentId+gameId+roomCode+bonusType)에
 *   `문항:날짜` 중복 방지 키를 넣어 DB가 강제한다.
 * - 하루 총량 상한(PRACTICE_DAILY_CAP)으로 반복 파밍을 막는다
 *   (AI 활동 보너스 상한 MAX_ACTIVITY_BONUS_PER_STUDENT와 동일한 수준).
 */

export const PRACTICE_GAME_ID = "PRACTICE";

export const PRACTICE_POINTS = {
  /** 분류 퀴즈 정답 */
  QUIZ_CORRECT: 1,
  /** 질문 바꾸기·만들기 목표 유형 달성 */
  TARGET_ACHIEVED: 3,
} as const;

/** 연습으로 하루에 얻을 수 있는 최대 포인트 */
export const PRACTICE_DAILY_CAP = 15;

export type PracticeMode = "quiz" | "transform" | "create";

/** 한국 학급 기준의 하루 경계(Asia/Seoul)로 날짜 키를 만든다 — 예: 2026-07-10 */
export function practiceDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

/** 서울 기준 오늘 0시의 UTC 시각 — 오늘 지급분 합산 쿼리 경계 */
export function practiceDayStartUtc(now: Date = new Date()): Date {
  return new Date(`${practiceDayKey(now)}T00:00:00+09:00`);
}

/** 같은 문항 하루 1회 지급을 강제하는 중복 방지 키(roomCode 슬롯에 저장) */
export function buildPracticeDedupeKey(
  mode: PracticeMode,
  ref: string,
  now: Date = new Date(),
): string {
  return `${mode}:${ref}:${practiceDayKey(now)}`;
}

/** 하루 상한을 고려해 실제 지급할 포인트를 계산한다(상한 도달 시 0). */
export function clampToDailyCap(requested: number, earnedToday: number): number {
  const remaining = Math.max(0, PRACTICE_DAILY_CAP - earnedToday);
  return Math.max(0, Math.min(requested, remaining));
}
