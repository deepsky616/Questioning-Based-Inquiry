// AI 분석 보너스 정책 (수업세션 활동)
export const ACTIVITY_BONUS_TYPES = {
  TOPIC_FIT_QUESTION:    { key: "TOPIC_FIT_QUESTION",    label: "주제 적합 질문",   points: 3, emoji: "🎯" },
  DEEP_QUESTION:         { key: "DEEP_QUESTION",         label: "깊이 있는 질문",   points: 5, emoji: "💡" },
  APT_ANSWER:            { key: "APT_ANSWER",            label: "적절한 답변",     points: 2, emoji: "🤝" },
  INSIGHTFUL_ANSWER:     { key: "INSIGHTFUL_ANSWER",     label: "통찰 있는 답변",   points: 5, emoji: "✨" },
  DUPLICATE_FLAGGED:     { key: "DUPLICATE_FLAGGED",     label: "중복 가능성",     points: 0, emoji: "⚠️" },
  LOW_EFFORT_FLAGGED:    { key: "LOW_EFFORT_FLAGGED",    label: "불성실 의심",     points: 0, emoji: "🚧" },
} as const;

export type ActivityBonusKey = keyof typeof ACTIVITY_BONUS_TYPES;
export const VALID_ACTIVITY_BONUS = Object.keys(ACTIVITY_BONUS_TYPES) as ActivityBonusKey[];
export const MAX_ACTIVITY_BONUS_PER_STUDENT = 15;

export function replaceActivityBonusCodes(text: string): string {
  let out = text;
  Object.entries(ACTIVITY_BONUS_TYPES).forEach(([code, def]) => {
    out = out.split(`AI_${code}`).join(def.label);
    out = out.split(code).join(def.label);
  });
  out = out
    .split("중복 가능성로").join("중복 가능성으로")
    .split("불성실 의심로").join("불성실 의심으로");
  return out;
}

/**
 * AI 근거 문장의 내부 id를 사람이 읽을 인용문으로 치환한다.
 * 분석 프롬프트가 질문·답변을 [Q:id]/[C:id] 형식으로 전달하므로 AI가 근거에서
 * 다른 작성물을 id로 지칭할 수 있는데(예: "…질문(cmpuifl5y…)과 거의 같습니다"),
 * 교사에게는 무의미한 문자열이라 해당 내용의 앞부분 인용으로 바꿔 보여준다.
 */
export function humanizeBonusReason(
  reason: string,
  contentById: ReadonlyMap<string, string>,
): string {
  let out = reason;
  contentById.forEach((content, id) => {
    if (!out.includes(id)) return;
    const trimmed = content.trim();
    const quote = `“${trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed}”`;
    out = out.split(id).join(quote);
  });
  return replaceActivityBonusCodes(out);
}
