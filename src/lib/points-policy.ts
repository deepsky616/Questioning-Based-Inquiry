/**
 * 학생 포인트 정책 (멀티 질문놀이 활동 보상)
 *
 * 기본 점수: 서버 규칙으로 객관적 자동 부여
 * 보너스: AI가 정해진 상에서만 선택, 학생당 합산 상한 적용
 */

// ── 기본 점수 (서버 자동 부여) ──────────────────────────────
export const BASE_POINTS = {
  PARTICIPATION: 1,      // 게임에 참여(방 입장)
  PER_VALID_QUESTION: 3, // 유효 질문 1개당
  COMPLETION: 5,         // 게임 완료까지 머무름
  WINNER_BONUS: 10,      // 점수표 1등 (공동 우승은 모두 지급)
} as const;

// ── 혼자 모드 점수 (멀티의 일부) ────────────────────────────
export const SOLO_POINTS = {
  PARTICIPATION: 0,
  PER_VALID_QUESTION: 1, // 유효 활동 1개당
  COMPLETION: 2,
} as const;

// ── AI 모드 점수 (혼자 < AI < 멀티) ──────────────────────────
export const AI_POINTS = {
  PARTICIPATION: 0,
  PER_VALID_QUESTION: 2,
  COMPLETION: 3,
} as const;

// ── 일일 상한 (어뷰징 방지) ──────────────────────────────
export const DAILY_LIMITS = {
  SOLO: 30, // 혼자 모드 일일 누적 상한
  AI: 50,   // AI 모드 일일 누적 상한
} as const;

// ── AI 보너스 상 정의 ────────────────────────────────────
export const AI_BONUS_TYPES = {
  BEST_QUESTION: { key: "BEST_QUESTION", label: "베스트 질문상", points: 10, emoji: "🏆" },
  CREATIVITY:    { key: "CREATIVITY",    label: "창의성상",     points: 5,  emoji: "💡" },
  EFFORT:        { key: "EFFORT",        label: "노력상",       points: 3,  emoji: "💪" },
  COOPERATION:   { key: "COOPERATION",   label: "협력상",       points: 3,  emoji: "🤝" },
  IMPROVEMENT:   { key: "IMPROVEMENT",   label: "향상상",       points: 3,  emoji: "📈" },
} as const;

export type BonusKey = keyof typeof AI_BONUS_TYPES;

export const VALID_BONUS_KEYS = Object.keys(AI_BONUS_TYPES) as BonusKey[];

// ── 안전장치 ────────────────────────────────────────────
export const MAX_BONUS_PER_STUDENT = 15; // 학생당 보너스 합산 상한
export const MAX_BONUSES_PER_STUDENT = 3; // 학생당 받을 수 있는 상 개수 상한

// ── 시스템 (서버가 부여하는 비-AI 보너스 종류) ─────────────
export const SYSTEM_BONUS = {
  PARTICIPATION: "PARTICIPATION",
  VALID_QUESTIONS: "VALID_QUESTIONS",
  COMPLETION: "COMPLETION",
  WINNER: "WINNER",
} as const;

export type SystemBonusKey = keyof typeof SYSTEM_BONUS;

// ── 게임 ID → 한글명 (이력 표시용) ─────────────────────────
export const GAME_LABEL: Record<string, string> = {
  relay: "질문 릴레이",
  kaba: "까바놀이",
  dice: "질문 주사위",
  "hot-potato": "뜨거운 감자",
  bingo: "질문 빙고",
  ladder: "질문 사다리",
  "mystery-box": "미스터리 박스",
};

// ── 유효 질문 판정 (서버에서 재검증) ─────────────────────
export function isValidQuestionForm(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return /[?？]/.test(t) ||
    /(나요|인가요|할까요|까요|니요|니까|가요|는지요|를까요)\s*$/.test(t);
}
