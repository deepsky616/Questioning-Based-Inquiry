// 사용자 언어 감지 + AI 프롬프트용 출력 언어 지시문.
// (Phase 1: DB 스키마 변경 없이 요청의 Accept-Language로 언어를 추정한다.
//  추후 User.locale을 추가하면 그것을 우선 사용하도록 확장하면 된다.)

/** 지원 언어 코드 → 프롬프트에 쓸 영어 언어명(코드 내 CJK 회피) */
const LANGUAGE_NAME: Record<string, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  vi: "Vietnamese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ru: "Russian",
  th: "Thai",
  id: "Indonesian",
  ar: "Arabic",
  pt: "Portuguese",
  hi: "Hindi",
};

export const DEFAULT_LOCALE = "ko";

/** "en-US,en;q=0.9,ko;q=0.8" → 지원하는 첫 언어 코드(없으면 기본 ko) */
export function parseAcceptLanguage(header?: string | null): string {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())
    .map((tag) => tag.split("-")[0]) // en-US → en
    .filter(Boolean);
  for (const c of candidates) {
    if (c in LANGUAGE_NAME) return c;
  }
  return DEFAULT_LOCALE;
}

/** 요청 헤더에서 사용자 언어 코드를 얻는다. */
export function getRequestLocale(req: Request): string {
  return parseAcceptLanguage(req.headers.get("accept-language"));
}

export function languageName(locale: string): string {
  return LANGUAGE_NAME[locale] ?? "Korean";
}

/**
 * AI 프롬프트 끝에 덧붙일 출력 언어 지시문.
 * 한국어면 빈 문자열(기존 동작 유지). 그 외 언어면 사람이 읽는 텍스트만 번역하고
 * JSON 키·고정 분류 코드는 그대로 두도록 지시한다.
 */
export function languageDirective(locale: string): string {
  if (!locale || locale === DEFAULT_LOCALE) return "";
  const name = languageName(locale);
  return `\n\n[OUTPUT LANGUAGE] Write ALL human-readable text in your response (explanations, feedback, questions, summaries, examples, titles) in ${name}. Keep JSON keys, field names, and fixed category codes such as "closed", "open", "factual", "conceptual", "controversial", "DUPLICATE_FLAGGED" exactly as given — never translate those. If the user's content is in another language, still write your explanations in ${name}.`;
}
