/**
 * 질문·답변 텍스트 정규화 (중복 감지용)
 * - 공백·줄바꿈·구두점 제거
 * - 소문자 변환
 * 의미는 보존하지 않고, 표기 변형 중복만 식별합니다.
 */
export function normalizeContent(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, "");
}

// 자동 부여 기본 점수 (수업세션 질문/답변)
export const ACTIVITY_BASE_POINTS = {
  QUESTION_WRITE: 2,
  COMMENT_WRITE: 1,
} as const;
