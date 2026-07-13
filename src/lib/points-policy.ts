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
  memory: "질문-대답 짝 찾기",
  "story-dice": "이야기 주사위",
  "hot-potato": "뜨거운 감자",
  bingo: "질문 빙고",
  ladder: "질문 사다리",
  "mystery-box": "미스터리 박스",
};

// ── 포인트 이력 표시용 한글 라벨 (학생 대시보드·교사 학생관리 공용) ──
export function pointBonusLabel(bonusType: string): { label: string; emoji: string } {
  if (bonusType in AI_BONUS_TYPES) {
    const def = AI_BONUS_TYPES[bonusType as BonusKey];
    return { label: def.label, emoji: def.emoji };
  }
  // 혼자/AI 모드 단일 놀이: ACTIVITY_SOLO_<gameId> / ACTIVITY_AI_<gameId>
  if (bonusType.startsWith("ACTIVITY_SOLO_") || bonusType.startsWith("ACTIVITY_AI_")) {
    const isSolo = bonusType.startsWith("ACTIVITY_SOLO_");
    const gameId = bonusType.slice(isSolo ? "ACTIVITY_SOLO_".length : "ACTIVITY_AI_".length);
    const gameName = GAME_LABEL[gameId];
    const mode = isSolo ? "혼자 모드" : "AI 모드";
    return { label: gameName ? `${mode} · ${gameName}` : `${mode} 놀이`, emoji: isSolo ? "🙋" : "🤖" };
  }
  switch (bonusType) {
    case "QUESTION_WRITE": return { label: "질문수업 질문 작성", emoji: "✏️" };
    case "COMMENT_WRITE": return { label: "친구 질문에 답변 작성", emoji: "💬" };
    case "PARTICIPATION": return { label: "게임 참여", emoji: "✋" };
    case "VALID_QUESTIONS": return { label: "좋은 질문", emoji: "❓" };
    case "COMPLETION": return { label: "게임 완료", emoji: "✅" };
    case "WINNER": return { label: "우승", emoji: "👑" };
    case "TEACHER_GRANT": return { label: "교사 지급", emoji: "🎁" };
    case "TEACHER_REVOKE": return { label: "교사 회수", emoji: "↩️" };
    default: return { label: "포인트 획득", emoji: "🎯" };
  }
}

const DEFAULT_QUESTION_WRITE_REASONS = new Set([
  "수업세션 질문 작성",
  "질문수업 질문 작성",
]);

export function shouldShowPointReason(
  reason: string,
  defaultLabel: string,
  bonusType: string,
): boolean {
  return Boolean(reason) &&
    reason !== defaultLabel &&
    !reason.startsWith("instance:") &&
    !(bonusType === "QUESTION_WRITE" && DEFAULT_QUESTION_WRITE_REASONS.has(reason));
}

// 포인트 이력 라벨을 번역키로 매핑하기 위한 명세(표시 시점 i18n용, 순수 함수).
// pointBonusLabel(한국어)은 게임 화면 등 비번역 영역에서 계속 사용한다.
const ACTIVITY_EMOJI: Record<string, string> = {
  QUESTION_WRITE: "✏️",
  COMMENT_WRITE: "💬",
  PRACTICE_QUIZ: "✅",
  PRACTICE_TRANSFORM: "🔁",
  PRACTICE_CREATE: "✏️",
  PARTICIPATION: "✋",
  VALID_QUESTIONS: "❓",
  COMPLETION: "✅",
  WINNER: "👑",
  TEACHER_GRANT: "🎁",
  TEACHER_ADJUSTED: "🧑‍🏫",
  TEACHER_REVOKE: "↩️",
};

export type PointBonusSpec =
  | { kind: "award"; code: string; emoji: string }
  | { kind: "game"; mode: "solo" | "ai"; gameId: string; emoji: string }
  | { kind: "activity"; code: string; emoji: string };

export function pointBonusSpec(bonusType: string): PointBonusSpec {
  if (bonusType in AI_BONUS_TYPES) {
    return { kind: "award", code: bonusType, emoji: AI_BONUS_TYPES[bonusType as BonusKey].emoji };
  }
  if (bonusType.startsWith("ACTIVITY_SOLO_") || bonusType.startsWith("ACTIVITY_AI_")) {
    const isSolo = bonusType.startsWith("ACTIVITY_SOLO_");
    const gameId = bonusType.slice(isSolo ? "ACTIVITY_SOLO_".length : "ACTIVITY_AI_".length);
    return { kind: "game", mode: isSolo ? "solo" : "ai", gameId, emoji: isSolo ? "🙋" : "🤖" };
  }
  const code = bonusType in ACTIVITY_EMOJI ? bonusType : "default";
  return { kind: "activity", code, emoji: ACTIVITY_EMOJI[code] ?? "🎯" };
}

// ── 유효 질문 판정 (서버에서 재검증) ─────────────────────
export function isValidQuestionForm(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return /[?？]/.test(t) ||
    /(나요|인가요|할까요|까요|니요|니까|가요|는지요|를까요)\s*$/.test(t);
}
