export type StoryAnswerQualityDecision = "accept" | "retry" | "review";

export interface StoryAnswerQualityEvaluation {
  decision: StoryAnswerQualityDecision;
  intent: "feeling" | "reason" | "place" | "time" | "person" | "yes-no" | "other";
  message: string;
}

function normalize(value: string, locale: "ko" | "en"): string {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/[.!?！？。]+$/gu, "")
    .replace(/\s+/gu, " ");
  return locale === "en"
    ? normalized.toLocaleLowerCase("en")
    : normalized;
}

function isLowEffortAnswer(answer: string, locale: "ko" | "en"): boolean {
  if (locale === "en") {
    return /^(?:i\s*(?:do\s*not|don't)\s*know|idk|dunno|no\s+idea|whatever|anything|maybe|shrug)$/iu
      .test(answer);
  }
  return /^(?:그냥(?:요)?|몰라(?:요)?|모름|(?:잘\s*)?모르겠(?:어|어요|습니다|음)?|아무거나|글쎄(?:요)?|대충|패스|ㅇ+|ㄴㄴ|[ㅋㅎ]+)$/u
    .test(answer);
}

function questionIntent(
  question: string,
  locale: "ko" | "en",
): StoryAnswerQualityEvaluation["intent"] {
  if (locale === "en") {
    if (/\b(?:feel|feeling|mood)\b/iu.test(question)) return "feeling";
    if (/^\s*why\b/iu.test(question)) return "reason";
    if (/^\s*where\b/iu.test(question)) return "place";
    if (/^\s*when\b/iu.test(question)) return "time";
    if (/^\s*who\b/iu.test(question)) return "person";
    if (/^\s*(?:is|are|was|were|do|does|did|can|could|will|would|has|have|had)\b/iu.test(question)) {
      return "yes-no";
    }
    return "other";
  }
  if (/(?:기분|느낌|어떤\s*마음|마음이\s*어)/u.test(question)) return "feeling";
  if (/(?:왜|이유|까닭)/u.test(question)) return "reason";
  if (/(?:어디|어느\s*곳)/u.test(question)) return "place";
  if (/(?:언제|몇\s*시|어느\s*때)/u.test(question)) return "time";
  if (/(?:누가|누구)/u.test(question)) return "person";
  if (/(?:무엇|뭐|어떤|무슨|어떻게)/u.test(question)) return "other";
  if (/(?:나요|인가요|했나요|있나요|없나요|일까요|했을까요)\s*[?？]?$/u.test(question)) {
    return "yes-no";
  }
  return "other";
}

function hasFeeling(answer: string, locale: "ko" | "en"): boolean {
  if (locale === "en") {
    return /\b(?:happy|glad|excited|sad|upset|scared|afraid|worried|angry|calm|relieved|surprised|lonely|nervous|good|bad)\b/iu
      .test(answer);
  }
  return /(?:기쁘|즐거|신나|행복|좋았|좋아|슬프|슬퍼|속상|아쉽|무섭|두렵|놀랐|놀라|걱정|화가|화났|짜증|편안|안심|답답|당황|우울|떨렸|떨려|설렜|설레|재미있|부끄|외롭|싫었|싫어)/u
    .test(answer);
}

function hasAvoidancePhrase(answer: string, locale: "ko" | "en"): boolean {
  if (locale === "en") {
    return /\b(?:whatever|anything|just\s+something|do\s+not\s+know|don't\s+know|no\s+idea)\b/iu
      .test(answer);
  }
  return /(?:그냥|아무\s*말|아무거나|대충|모르겠|몰라)/u.test(answer);
}

function hasQuestionPredicateOverlap(
  question: string,
  answer: string,
  locale: "ko" | "en",
): boolean {
  const ignored = locale === "en"
    ? new Set(["what", "when", "where", "which", "who", "whose", "why", "how", "does", "did", "were", "was"])
    : new Set(["무엇", "뭐가", "뭐를", "어떤", "무슨", "어디", "언제", "누가", "누구", "왜", "어떻게"]);
  const chunks = question.match(
    locale === "en" ? /[a-z]{3,}/giu : /[가-힣]{2,}/gu,
  ) ?? [];
  const predicate = [...chunks].reverse().find((chunk) => {
    const lowered = locale === "en" ? chunk.toLocaleLowerCase("en") : chunk;
    return !ignored.has(lowered);
  });
  if (!predicate) return false;
  const lowered = locale === "en"
    ? predicate.toLocaleLowerCase("en")
    : predicate;
  const stem = lowered.slice(0, locale === "en" ? 3 : 2);
  return stem.length >= 2 && answer.includes(stem);
}

function reviewMessage(
  intent: StoryAnswerQualityEvaluation["intent"],
  locale: "ko" | "en",
): string {
  if (locale === "en") {
    if (intent === "feeling") return "Use a feeling word to answer the question in one sentence.";
    if (intent === "reason") return "Explain the reason in one sentence.";
    if (intent === "yes-no") return "Add a short reason or detail after yes or no.";
    return "Answer what the question asks in one short sentence.";
  }
  if (intent === "feeling") {
    return "기분을 묻는 질문이에요. 기분을 나타내는 말을 넣어 한 문장으로 답해 보세요.";
  }
  if (intent === "reason") return "이유를 묻는 질문이에요. 까닭을 넣어 한 문장으로 답해 보세요.";
  if (intent === "place") return "장소를 묻는 질문이에요. 어디인지 알 수 있게 한 문장으로 답해 보세요.";
  if (intent === "time") return "때를 묻는 질문이에요. 언제인지 알 수 있게 한 문장으로 답해 보세요.";
  if (intent === "person") return "사람을 묻는 질문이에요. 누구인지 알 수 있게 한 문장으로 답해 보세요.";
  if (intent === "yes-no") return "예 또는 아니오 뒤에 이유나 내용을 짧게 덧붙여 보세요.";
  return "질문에서 묻는 내용을 한 문장으로 답해 보세요.";
}

export function evaluateStoryDiceAnswerQuality(
  question: string,
  answer: string,
  locale: "ko" | "en",
): StoryAnswerQualityEvaluation {
  const normalizedQuestion = normalize(question, locale);
  const normalizedAnswer = normalize(answer, locale);
  const intent = questionIntent(normalizedQuestion, locale);
  if (isLowEffortAnswer(normalizedAnswer, locale)) {
    return {
      decision: "retry",
      intent,
      message: reviewMessage(intent, locale),
    };
  }
  if (hasAvoidancePhrase(normalizedAnswer, locale)) {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  if (intent === "feeling" && !hasFeeling(normalizedAnswer, locale)) {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  if (intent === "reason") {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  if (intent === "place" || intent === "time" || intent === "person") {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  if (intent === "yes-no") {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  if (
    intent === "other" &&
    !hasQuestionPredicateOverlap(normalizedQuestion, normalizedAnswer, locale)
  ) {
    return { decision: "review", intent, message: reviewMessage(intent, locale) };
  }
  return {
    decision: "accept",
    intent,
    message: "",
  };
}
