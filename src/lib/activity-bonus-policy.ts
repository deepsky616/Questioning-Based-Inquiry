// AI 분석 보너스 정책 (수업세션 활동)
export const ACTIVITY_BONUS_TYPES = {
  TOPIC_FIT_QUESTION:    { key: "TOPIC_FIT_QUESTION",    label: "주제 적합 질문",   points: 3, emoji: "🎯" },
  DEEP_QUESTION:         { key: "DEEP_QUESTION",         label: "깊이 있는 질문",   points: 5, emoji: "💡" },
  APT_ANSWER:            { key: "APT_ANSWER",            label: "적절한 답변",     points: 2, emoji: "🤝" },
  INSIGHTFUL_ANSWER:     { key: "INSIGHTFUL_ANSWER",     label: "통찰 있는 답변",   points: 5, emoji: "✨" },
  DUPLICATE_FLAGGED:     { key: "DUPLICATE_FLAGGED",     label: "중복 가능성",     points: 0, emoji: "⚠️" },
} as const;

export type ActivityBonusKey = keyof typeof ACTIVITY_BONUS_TYPES;
export const VALID_ACTIVITY_BONUS = Object.keys(ACTIVITY_BONUS_TYPES) as ActivityBonusKey[];
export const MAX_ACTIVITY_BONUS_PER_STUDENT = 15;
