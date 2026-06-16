/**
 * 가벼운 욕설·비속어 사전 검사 (댓글 1차 필터용).
 * 명백한 비속어를 비용 없이 즉시 검출한다. 맥락성 비방·혐오까지는 잡지 못하므로
 * 교사가 최종 판단(삭제/이상없음)하는 보조 신호로 사용한다.
 */
const PROFANITY_WORDS = [
  "씨발", "시발", "씨바", "시바", "씨팔", "쌍놈", "쌍년",
  "좆", "존나", "졸라", "개새끼", "개새기", "새끼", "개색기",
  "병신", "븅신", "ㅄ", "ㅂㅅ", "지랄", "ㅈㄹ", "ㅅㅂ", "ㅆㅂ",
  "꺼져", "닥쳐", "엿먹어", "etmek", "fuck", "shit", "bitch",
  "느금마", "니애미", "창녀", "걸레년", "후레",
];

/** 댓글 등 텍스트에 비속어가 포함됐는지 검사한다. */
export function checkProfanity(text: string): { flagged: boolean; reason: string } {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  for (const word of PROFANITY_WORDS) {
    if (normalized.includes(word)) {
      return { flagged: true, reason: "비속어·욕설 표현 포함 의심" };
    }
  }
  return { flagged: false, reason: "" };
}
