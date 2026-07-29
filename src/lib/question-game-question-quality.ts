export type QuestionInputLocale = "ko" | "en";

const QUALITY_MESSAGES: Record<QuestionInputLocale, string> = {
  ko: "주제에 맞는 궁금한 내용을 넣어 질문을 한 문장으로 써 주세요",
  en: "Write one specific question about the topic.",
};

function normalizeQuestion(value: string, locale: QuestionInputLocale): string {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/[.!?！？。]+$/gu, "")
    .replace(/\s+/gu, " ");
  return locale === "en"
    ? normalized.toLocaleLowerCase("en")
    : normalized;
}

function isLowEffortKoreanQuestion(value: string): boolean {
  const compact = value.replace(/\s+/gu, "");
  if (/^(?:[ㅇㄴㅋㅎ]+|패스|대충|모름)(?:요)?$/u.test(compact)) return true;
  return /^(?:(?:잘)?모르겠(?:어|어요|습니다)?|몰라(?:요)?|그냥(?:요)?|아무거나(?:요)?|글쎄(?:요)?|뭐(?:예요|에요|요)?|무엇(?:인가요|이예요|이에요)?|왜(?:요)?|누구(?:예요|인가요|요)?|언제(?:예요|인가요|요)?|어디(?:예요|인가요|요)?|어떻게(?:요)?|질문(?:이예요|이에요|인가요|이요)?)$/u
    .test(compact);
}

function isLowEffortEnglishQuestion(value: string): boolean {
  return /^(?:i\s*(?:do\s*not|don't)\s*know|idk|dunno|no\s+idea|whatever|anything|maybe|why|what|who|when|where|how|question|pass|skip|shrug)$/iu
    .test(value);
}

export function getQuestionInputQualityIssue(
  question: string,
  locale: QuestionInputLocale,
): string | null {
  const normalized = normalizeQuestion(question, locale);
  if (!normalized) return QUALITY_MESSAGES[locale];
  const lowEffort = locale === "en"
    ? isLowEffortEnglishQuestion(normalized)
    : isLowEffortKoreanQuestion(normalized);
  return lowEffort ? QUALITY_MESSAGES[locale] : null;
}
