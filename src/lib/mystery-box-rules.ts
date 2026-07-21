export const MYSTERY_ATTRIBUTES = [
  "living",
  "animal",
  "plant",
  "edible",
  "small",
  "large",
  "colorful",
  "indoor",
  "legs",
  "fly",
  "humanMade",
  "hard",
  "wet",
  "round",
] as const;

export type MysteryAttribute = typeof MYSTERY_ATTRIBUTES[number];
export type MysteryLocale = "ko" | "en";
export type MysteryAnswer = "yes" | "no" | "unknown";

export type MysteryQuestionAnalysis =
  | {
      answer: Exclude<MysteryAnswer, "unknown">;
      attribute: MysteryAttribute;
      negated: boolean;
    }
  | { answer: "unknown" };

export interface MysteryAnswerResolution {
  itemId: string;
  playerId: string;
  locale: MysteryLocale;
  question: string;
  answer: MysteryAnswer;
  source?: "ai" | "fallback";
}

export interface MysteryItem {
  id: string;
  names: Record<MysteryLocale, string>;
  aliases: Record<MysteryLocale, string[]>;
  attributes: Record<MysteryAttribute, boolean>;
}

export const MYSTERY_ITEMS: readonly MysteryItem[] = [
  {
    id: "apple",
    names: { ko: "사과", en: "apple" },
    aliases: { ko: ["풋사과"], en: ["green apple"] },
    attributes: {
      living: false,
      animal: false,
      plant: true,
      edible: true,
      small: true,
      large: false,
      colorful: true,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: false,
      hard: false,
      wet: false,
      round: true,
    },
  },
  {
    id: "puppy",
    names: { ko: "강아지", en: "puppy" },
    aliases: { ko: ["개"], en: ["dog"] },
    attributes: {
      living: true,
      animal: true,
      plant: false,
      edible: false,
      small: true,
      large: false,
      colorful: false,
      indoor: true,
      legs: true,
      fly: false,
      humanMade: false,
      hard: false,
      wet: false,
      round: false,
    },
  },
  {
    id: "book",
    names: { ko: "책", en: "book" },
    aliases: { ko: ["도서"], en: ["volume"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: true,
      large: false,
      colorful: true,
      indoor: true,
      legs: false,
      fly: false,
      humanMade: true,
      hard: false,
      wet: false,
      round: false,
    },
  },
  {
    id: "car",
    names: { ko: "자동차", en: "car" },
    aliases: { ko: ["승용차"], en: ["automobile"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: false,
      large: true,
      colorful: true,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: true,
      hard: true,
      wet: false,
      round: false,
    },
  },
  {
    id: "butterfly",
    names: { ko: "나비", en: "butterfly" },
    aliases: { ko: ["나비벌레"], en: ["butterfly insect"] },
    attributes: {
      living: true,
      animal: true,
      plant: false,
      edible: false,
      small: true,
      large: false,
      colorful: true,
      indoor: false,
      legs: true,
      fly: true,
      humanMade: false,
      hard: false,
      wet: false,
      round: false,
    },
  },
  {
    id: "piano",
    names: { ko: "피아노", en: "piano" },
    aliases: { ko: ["건반 악기"], en: ["keyboard instrument"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: false,
      large: true,
      colorful: false,
      indoor: true,
      legs: true,
      fly: false,
      humanMade: true,
      hard: true,
      wet: false,
      round: false,
    },
  },
  {
    id: "sun",
    names: { ko: "태양", en: "sun" },
    aliases: { ko: ["해"], en: ["the sun"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: false,
      large: true,
      colorful: true,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: false,
      hard: false,
      wet: false,
      round: true,
    },
  },
  {
    id: "strawberry",
    names: { ko: "딸기", en: "strawberry" },
    aliases: { ko: ["산딸기"], en: ["berry"] },
    attributes: {
      living: false,
      animal: false,
      plant: true,
      edible: true,
      small: true,
      large: false,
      colorful: true,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: false,
      hard: false,
      wet: true,
      round: true,
    },
  },
  {
    id: "rocket",
    names: { ko: "로켓", en: "rocket" },
    aliases: { ko: ["우주 로켓"], en: ["space rocket"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: false,
      large: true,
      colorful: false,
      indoor: false,
      legs: false,
      fly: true,
      humanMade: true,
      hard: true,
      wet: false,
      round: false,
    },
  },
  {
    id: "sunflower",
    names: { ko: "해바라기", en: "sunflower" },
    aliases: { ko: ["해바라기꽃"], en: ["sunflower plant"] },
    attributes: {
      living: true,
      animal: false,
      plant: true,
      edible: false,
      small: false,
      large: false,
      colorful: true,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: false,
      hard: false,
      wet: false,
      round: false,
    },
  },
  {
    id: "snowman",
    names: { ko: "눈사람", en: "snowman" },
    aliases: { ko: ["눈 인형"], en: ["snow figure"] },
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: false,
      large: false,
      colorful: false,
      indoor: false,
      legs: false,
      fly: false,
      humanMade: true,
      hard: false,
      wet: true,
      round: true,
    },
  },
  {
    id: "dragon",
    names: { ko: "드래곤", en: "dragon" },
    aliases: { ko: ["용"], en: ["dragon creature"] },
    attributes: {
      living: true,
      animal: true,
      plant: false,
      edible: false,
      small: false,
      large: true,
      colorful: true,
      indoor: false,
      legs: true,
      fly: true,
      humanMade: false,
      hard: true,
      wet: false,
      round: false,
    },
  },
] as const;

const KOREAN_NOUN_ENDING =
  "(?:인가요|입니까|이에요|예요|인가|이야|이다|이|가|은|는|을|를|도|만|의|에|에서|처럼)?";

function koreanNoun(term: string): RegExp {
  return new RegExp(
    `(?<![가-힣])${term}${KOREAN_NOUN_ENDING}(?=$|[^가-힣])`,
    "u",
  );
}

function koreanForm(source: string): RegExp {
  return new RegExp(
    `(?<![가-힣])(?:${source})(?=$|[^가-힣])`,
    "u",
  );
}

const ATTRIBUTE_PATTERNS: Record<
  MysteryLocale,
  Record<MysteryAttribute, readonly RegExp[]>
> = {
  ko: {
    living: [
      koreanForm("살아\\s*있(?:나요|습니까|는|다|어요|어)?"),
      koreanNoun("생물"),
    ],
    animal: [koreanNoun("동물"), koreanNoun("짐승")],
    plant: [
      koreanNoun("식물"),
      koreanNoun("나무"),
      koreanNoun("꽃"),
      koreanNoun("풀"),
    ],
    edible: [
      koreanForm("먹을\\s*수"),
      koreanForm("먹(?:는가요|나요|습니까|는다|는)"),
      koreanNoun("음식"),
      koreanNoun("식용"),
    ],
    small: [
      koreanForm("작(?:은가요|은|나요|습니까|다)"),
      koreanNoun("소형"),
      koreanNoun("주머니"),
    ],
    large: [
      koreanForm("크(?:나요|습니까|다고|다|고)"),
      koreanForm("큰(?:가요)?"),
      koreanNoun("대형"),
    ],
    colorful: [
      koreanForm("알록달록(?:한가요|한|하나요|합니까|하다)?"),
      koreanNoun("색깔"),
      koreanForm("색이\\s*다양(?:한가요|한|하나요|합니까|하다)?"),
      koreanForm("화려(?:한가요|한|하나요|합니까|하다)?"),
    ],
    indoor: [
      koreanNoun("실내"),
      koreanNoun("집\\s*안"),
      koreanNoun("방\\s*안"),
    ],
    legs: [koreanNoun("다리"), koreanNoun("발")],
    fly: [
      koreanForm("날\\s*수"),
      koreanNoun("날개"),
      koreanNoun("비행"),
      koreanForm("비행(?:하나요|합니까|하다|할\\s*수)"),
    ],
    humanMade: [
      koreanForm("사람이\\s*만든"),
      koreanNoun("인공"),
      koreanNoun("제품"),
      koreanNoun("발명"),
    ],
    hard: [
      koreanForm("딱딱(?:한가요|한|하나요|합니까|하다)?"),
      koreanForm("단단(?:한가요|한|하나요|합니까|하다)?"),
      koreanForm("굳(?:은가요|은|나요|습니까|다)"),
    ],
    wet: [
      koreanForm("젖(?:어|은|나요|습니까|었나요|다)"),
      koreanNoun("물기"),
      koreanForm("축축(?:한가요|한|하나요|합니까|하다)?"),
    ],
    round: [
      koreanForm("동그(?:란가요|란|랗나요|랗습니까|랗다)"),
      koreanForm("둥글(?:나요|습니까|다|고|게)"),
      koreanForm("둥근(?:가요|지)?"),
      koreanNoun("원형"),
      koreanForm("공처럼"),
    ],
  },
  en: {
    living: [/\balive\b/u, /\bliving\b/u],
    animal: [/\banimal\b/u],
    plant: [/\bplant\b/u, /\btree\b/u, /\bflower\b/u],
    edible: [/\bedible\b/u, /\binedible\b/u, /\beat(?:en|ing)?\b/u, /\bfood\b/u],
    small: [/\bsmall\b/u, /\btiny\b/u, /\bpocket(?:-sized)?\b/u],
    large: [/\bbig\b/u, /\blarge\b/u, /\bhuge\b/u],
    colorful: [/\bcolou?r(?:ful)?\b/u, /\bbrightly colored\b/u],
    indoor: [/\bindoor(?:s)?\b/u, /\binside\b/u],
    legs: [/\blegs?\b/u, /\bfeet\b/u],
    fly: [/\bfly\b/u, /\bflies\b/u, /\bwings?\b/u],
    humanMade: [/\bhuman[ -]made\b/u, /\bman[ -]made\b/u, /\bmade by (?:people|humans)\b/u],
    hard: [/\bhard\b/u, /\bsolid\b/u],
    wet: [/\bwet\b/u, /\bdamp\b/u],
    round: [/\bround\b/u, /\bcircular\b/u, /\bcircle(?:-shaped)?\b/u],
  },
};

const NEGATION_PATTERNS: Record<MysteryLocale, RegExp> = {
  ko: /없|않|아닌|아니|못/gu,
  en: /\b(?:not|never|no|without|cannot|can't|isn't|aren't|doesn't|don't|didn't|won't|wouldn't|couldn't|shouldn't|wasn't|weren't|hasn't|haven't|hadn't|inedible)\b/gu,
};

const MYSTERY_ATTRIBUTE_QUESTIONS: Record<
  MysteryLocale,
  Record<MysteryAttribute, string>
> = {
  ko: {
    living: "살아 있나요?",
    animal: "동물인가요?",
    plant: "식물인가요?",
    edible: "먹을 수 있나요?",
    small: "작은가요?",
    large: "큰가요?",
    colorful: "알록달록한가요?",
    indoor: "실내에 있나요?",
    legs: "다리가 있나요?",
    fly: "날 수 있나요?",
    humanMade: "사람이 만든 것인가요?",
    hard: "딱딱한가요?",
    wet: "젖어 있나요?",
    round: "둥근가요?",
  },
  en: {
    living: "Is it alive?",
    animal: "Is it an animal?",
    plant: "Is it a plant?",
    edible: "Is it edible?",
    small: "Is it small?",
    large: "Is it large?",
    colorful: "Is it colorful?",
    indoor: "Is it indoors?",
    legs: "Does it have legs?",
    fly: "Can it fly?",
    humanMade: "Is it human-made?",
    hard: "Is it hard?",
    wet: "Is it wet?",
    round: "Is it round?",
  },
};

function normalizeText(value: string, locale: MysteryLocale): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return locale === "en"
    ? normalized.replace(/’/gu, "'").toLocaleLowerCase("en")
    : normalized;
}

interface TextMatch {
  start: number;
  end: number;
}

function findPatternMatches(
  text: string,
  patterns: readonly RegExp[],
): TextMatch[] {
  const matches: TextMatch[] = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g")
      ? pattern.flags
      : `${pattern.flags}g`;
    for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
      const start = match.index;
      matches.push({ start, end: start + match[0].length });
    }
  }
  return matches.filter(
    (match, index) =>
      matches.findIndex(
        (candidate) =>
          candidate.start === match.start && candidate.end === match.end,
      ) === index,
  );
}

function findNegations(text: string, locale: MysteryLocale): TextMatch[] {
  return [...text.matchAll(NEGATION_PATTERNS[locale])].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function isAttachedNegation(
  text: string,
  locale: MysteryLocale,
  attribute: TextMatch,
  negation: TextMatch,
): boolean {
  if (
    negation.start < attribute.end &&
    attribute.start < negation.end
  ) {
    return true;
  }
  if (locale === "en" && negation.end <= attribute.start) {
    const between = text.slice(negation.end, attribute.start);
    return /^\s*(?:(?:it|this|that|the (?:item|object|thing))\s+)?(?:(?:is|are|was|were|be|being|have|has|had)\s+)?(?:(?:a|an|the)\s+)?$/u
      .test(between);
  }
  if (locale === "ko" && attribute.end <= negation.start) {
    const between = text.slice(attribute.end, negation.start);
    return /^\s*(?:(?:이|가|은|는|을|를)\s*)?$/u.test(between);
  }
  return false;
}

export function getMysteryItem(itemId: string): MysteryItem | null {
  return MYSTERY_ITEMS.find(({ id }) => id === itemId) ?? null;
}

export function mysteryQuestionForAttribute(
  attribute: MysteryAttribute,
  locale: MysteryLocale,
): string {
  return MYSTERY_ATTRIBUTE_QUESTIONS[locale][attribute];
}

export function analyzeMysteryQuestion(
  question: string,
  item: MysteryItem,
  locale: MysteryLocale,
): MysteryQuestionAnalysis {
  const normalized = normalizeText(question, locale);
  const detectedAttributes = MYSTERY_ATTRIBUTES.map((attribute) => ({
    attribute,
    matches: findPatternMatches(
      normalized,
      ATTRIBUTE_PATTERNS[locale][attribute],
    ),
  })).filter(({ matches }) => matches.length > 0);
  if (detectedAttributes.length !== 1) return { answer: "unknown" };

  const negations = findNegations(normalized, locale);
  if (negations.length > 1) return { answer: "unknown" };
  if (
    negations.length === 1 &&
    !detectedAttributes[0].matches.every((attributeMatch) =>
      isAttachedNegation(
        normalized,
        locale,
        attributeMatch,
        negations[0],
      )
    )
  ) {
    return { answer: "unknown" };
  }

  const attribute = detectedAttributes[0].attribute;
  const negated = negations.length === 1;
  const value = item.attributes[attribute];
  const answer = negated ? !value : value;
  return {
    answer: answer ? "yes" : "no",
    attribute,
    negated,
  };
}

export function classifyMysteryQuestion(
  question: string,
  item: MysteryItem,
  locale: MysteryLocale,
): MysteryAnswer {
  return analyzeMysteryQuestion(question, item, locale).answer;
}

export function isMysteryGuessCorrect(
  guess: string,
  item: MysteryItem,
  locale: MysteryLocale,
): boolean {
  return [item.names[locale], ...item.aliases[locale]].some(
    (candidate) => isMysteryNameMatch(guess, candidate, locale),
  );
}

export function isMysteryNameMatch(
  guess: string,
  answer: string,
  locale: MysteryLocale,
): boolean {
  const normalizedGuess = normalizeText(guess, locale);
  return Boolean(normalizedGuess) && normalizedGuess === normalizeText(answer, locale);
}
