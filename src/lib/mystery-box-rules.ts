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
    living: [/(?<![가-힣])살아\s*있/u, koreanNoun("생물")],
    animal: [koreanNoun("동물"), koreanNoun("짐승")],
    plant: [
      koreanNoun("식물"),
      koreanNoun("나무"),
      koreanNoun("꽃"),
      koreanNoun("풀"),
    ],
    edible: [
      /(?<![가-힣])먹을\s*수/u,
      /(?<![가-힣])먹는/u,
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
      /(?<![가-힣])알록달록/u,
      /(?<![가-힣])색(?:깔|이\s*다양)/u,
      /(?<![가-힣])화려/u,
    ],
    indoor: [/실내/u, /집\s*안/u, /방\s*안/u],
    legs: [koreanNoun("다리"), koreanNoun("발")],
    fly: [/(?<![가-힣])날\s*수/u, koreanNoun("날개"), koreanNoun("비행")],
    humanMade: [
      /사람이\s*만든/u,
      koreanNoun("인공"),
      koreanNoun("제품"),
      koreanNoun("발명"),
    ],
    hard: [/(?<![가-힣])딱딱/u, /(?<![가-힣])단단/u, /(?<![가-힣])굳은/u],
    wet: [/(?<![가-힣])젖/u, koreanNoun("물기"), /(?<![가-힣])축축/u],
    round: [
      /(?<![가-힣])동그/u,
      /(?<![가-힣])둥글/u,
      /(?<![가-힣])둥근/u,
      koreanNoun("원형"),
      /(?<![가-힣])공처럼/u,
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
    return /^\s*(?:(?:it|this|that|the (?:item|object|thing))\s+)?(?:(?:is|are|was|were|be|being|have|has|had)\s+)?$/u
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

export function classifyMysteryQuestion(
  question: string,
  item: MysteryItem,
  locale: MysteryLocale,
): MysteryAnswer {
  const normalized = normalizeText(question, locale);
  const detectedAttributes = MYSTERY_ATTRIBUTES.map((attribute) => ({
    attribute,
    matches: findPatternMatches(
      normalized,
      ATTRIBUTE_PATTERNS[locale][attribute],
    ),
  })).filter(({ matches }) => matches.length > 0);
  if (detectedAttributes.length !== 1) return "unknown";

  const negations = findNegations(normalized, locale);
  if (negations.length > 1) return "unknown";
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
    return "unknown";
  }

  const value = item.attributes[detectedAttributes[0].attribute];
  const answer = negations.length === 1 ? !value : value;
  return answer ? "yes" : "no";
}

export function isMysteryGuessCorrect(
  guess: string,
  item: MysteryItem,
  locale: MysteryLocale,
): boolean {
  const normalizedGuess = normalizeText(guess, locale);
  if (!normalizedGuess) return false;
  return [item.names[locale], ...item.aliases[locale]].some(
    (candidate) => normalizeText(candidate, locale) === normalizedGuess,
  );
}
