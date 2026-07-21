import {
  isQuestionFormForLocale,
  KABA_SENTENCES,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";

type KabaLocale = "ko" | "en";
type MeaningGroup = readonly RegExp[];
type KabaMeaningRule = readonly MeaningGroup[];

function koreanTerm(source: string): RegExp {
  return new RegExp(
    `(?<![가-힣])(?:${source})(?:이|가|은|는|을|를|에|에서|에게|도|만|의)?(?=$|[^가-힣])`,
    "u",
  );
}

const KO_RULES: readonly KabaMeaningRule[] = [
  [[koreanTerm("고양이")], [/(?:자나요|잡니까|자니|자냐|자는지요|자고\s*있나요)\s*[?？]?$/u]],
  [[koreanTerm("개미")], [/(?:걷나요|걷습니까|걷니|걷냐|걷는지요|걷고\s*있나요)\s*[?？]?$/u]],
  [[koreanTerm("토끼")], [/(?:뛰나요|뜁니까|뛰니|뛰냐|뛰는지요|뛰고\s*있나요)\s*[?？]?$/u]],
  [[koreanTerm("꽃")], [/(?:예쁜가요|예쁘나요|예쁩니까|예쁘니|예쁜지요|아름다운가요)\s*[?？]?$/u]],
  [[koreanTerm("사과")], [/(?:빨간가요|빨갛나요|빨갛습니까|빨갑니까|빨간지요|붉은가요)\s*[?？]?$/u]],
  [[koreanTerm("하늘")], [/(?:파란가요|파랗나요|파랗습니까|파랍니까|파란지요|푸른가요)\s*[?？]?$/u]],
  [[koreanTerm("비")], [/(?:오나요|옵니까|오니|오는지요|내리나요|내립니까)\s*[?？]?$/u]],
  [[koreanTerm("새")], [/(?:날아가나요|날아갑니까|날아가니|날아가는지요|비행하나요)\s*[?？]?$/u]],
  [[koreanTerm("강아지|개")], [/(?:짖나요|짖습니까|짖니|짖는지요)\s*[?？]?$/u]],
  [[koreanTerm("물고기")], [/(?:헤엄치나요|헤엄칩니까|헤엄치니|헤엄치는지요|수영하나요)\s*[?？]?$/u]],
  [[koreanTerm("아이")], [/(?:웃나요|웃습니까|웃니|웃는지요|미소를?\s*짓나요)\s*[?？]?$/u]],
  [[koreanTerm("나무")], [/(?:흔들리나요|흔들립니까|흔들리니|흔들리는지요|흔드나요)\s*[?？]?$/u]],
  [[koreanTerm("별")], [/(?:빛나나요|빛납니까|빛나니|빛나는지요|반짝이나요|반짝입니까)\s*[?？]?$/u]],
  [[koreanTerm("바람")], [/(?:부나요|붑니까|부니|부는지요|불고\s*있나요)\s*[?？]?$/u]],
  [[koreanTerm("눈")], [/(?:내리나요|내립니까|내리니|내리는지요|오나요|옵니까)\s*[?？]?$/u]],
  [[koreanTerm("나비")], [koreanTerm("날개")], [/(?:펴나요|펴는지요|펼치나요|펼칩니까|펼치는지요)\s*[?？]?$/u]],
  [[koreanTerm("달")], [/(?:밝은가요|밝나요|밝습니까|밝은지요)\s*[?？]?$/u]],
  [[koreanTerm("파도")], [/(?:치나요|칩니까|치는지요|밀려오나요|부서지나요)\s*[?？]?$/u]],
  [[koreanTerm("벌")], [koreanTerm("꿀")], [/(?:모으나요|모읍니까|모으니|모으는지요|모아\s*오나요)\s*[?？]?$/u]],
  [[koreanTerm("원숭이")], [koreanTerm("나무")], [/(?:오르나요|오릅니까|오르는지요|올라가나요|올라갑니까)\s*[?？]?$/u]],
  [[koreanTerm("햇빛|햇살")], [/(?:따뜻한가요|따뜻하나요|따뜻합니까|따뜻한지요)\s*[?？]?$/u]],
  [[koreanTerm("구름")], [/(?:하얀가요|하얗나요|하얗습니까|하얍니까|하얀지요|흰가요)\s*[?？]?$/u]],
  [[koreanTerm("고래")], [koreanTerm("바다")], [/(?:사나요|삽니까|사는지요|살고\s*있나요)\s*[?？]?$/u]],
  [[koreanTerm("개구리")], [/(?:우나요|웁니까|우니|우는지요|울까요|울고\s*있나요|개굴(?:거리나요|거립니까|대나요))\s*[?？]?$/u]],
  [[koreanTerm("아기\\s*새|새끼\\s*새")], [koreanTerm("둥지")], [/(?:있나요|있습니까|있는지요|사나요|살고\s*있나요)\s*[?？]?$/u]],
];

const EN_RULES: readonly KabaMeaningRule[] = [
  [[/\bcat\b/i], [/\b(?:sleep|sleeps|sleeping|asleep)\b/i]],
  [[/\bant\b/i], [/\b(?:walk|walks|walking)\b/i]],
  [[/\brabbit\b/i], [/\b(?:jump|jumps|jumping|hop|hops|hopping)\b/i]],
  [[/\bflower\b/i], [/\b(?:pretty|beautiful)\b/i]],
  [[/\bapple\b/i], [/\bred\b/i]],
  [[/\bsky\b/i], [/\bblue\b/i]],
  [[/\b(?:(?:does|did|will|can|could|may|might)\s+it\s+rain|(?:is|was)\s+it\s+raining)\b/i]],
  [[/\bbird\b/i], [/\b(?:fly|flies|flying|flew)\b/i]],
  [[/\b(?:dog|puppy)\b/i], [/\b(?:bark|barks|barking)\b/i]],
  [[/\bfish\b/i], [/\b(?:swim|swims|swimming)\b/i]],
  [[/\bchild\b/i], [/\b(?:smile|smiles|smiling|laugh|laughs|laughing)\b/i]],
  [[/\btree\b/i], [/\b(?:shake|shakes|shaking|sway|sways|swaying)\b/i]],
  [[/\bstar\b/i], [/\b(?:shine|shines|shining|sparkle|sparkles|twinkle|twinkles)\b/i]],
  [[/\bwind\b/i], [/\b(?:blow|blows|blowing)\b/i]],
  [[/\bsnow\b/i], [/\b(?:fall|falls|falling|snow|snows|snowing)\b/i]],
  [[/\bbutterfly\b/i], [/\bwings?\b/i], [/\b(?:open|opens|opening|spread|spreads|spreading)\b/i]],
  [[/\bmoon\b/i], [/\bbright\b/i]],
  [[/\bwave\b/i], [/\b(?:crash|crashes|crashing|break|breaks|breaking)\b/i]],
  [[/\bbee\b/i], [/\b(?:nectar|honey)\b/i], [/\b(?:collect|collects|collecting|gather|gathers|gathering)\b/i]],
  [[/\bmonkey\b/i], [/\btree\b/i], [/\b(?:climb|climbs|climbing)\b/i]],
  [[/\bsunlight\b/i], [/\bwarm\b/i]],
  [[/\bclouds?\b/i], [/\bwhite\b/i]],
  [[/\bwhale\b/i], [/\b(?:ocean|sea)\b/i], [/\b(?:live|lives|living)\b/i]],
  [[/\bfrog\b/i], [/\b(?:croak|croaks|croaking)\b/i]],
  [[/\b(?:is|was|will)\s+(?:the\s+)?baby\s+bird\s+(?:still\s+)?(?:in|inside|at)\s+(?:the\s+)?nest\b/i]],
];

const RULES: Record<KabaLocale, readonly KabaMeaningRule[]> = {
  ko: KO_RULES,
  en: EN_RULES,
};

function normalize(value: string, locale: KabaLocale): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return locale === "en" ? normalized.toLocaleLowerCase("en") : normalized;
}

function ruleForSentence(sentence: string, locale: KabaLocale) {
  const normalized = normalize(sentence, locale);
  const index = KABA_SENTENCES[locale].findIndex(
    (candidate) => normalize(candidate, locale) === normalized,
  );
  return index < 0 ? null : RULES[locale][index] ?? null;
}

export function isKabaQuestionRewrite(
  sentence: string,
  question: string,
  locale: string,
): boolean {
  const resolvedLocale = resolveQuestionGameLocale(locale);
  if (!isQuestionFormForLocale(question, resolvedLocale)) return false;
  const rule = ruleForSentence(sentence, resolvedLocale);
  if (!rule) return false;
  const normalizedQuestion = normalize(question, resolvedLocale);
  return rule.every((alternatives) =>
    alternatives.some((pattern) => pattern.test(normalizedQuestion))
  );
}
