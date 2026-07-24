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
export const MYSTERY_V2_FACTS = [
  ...MYSTERY_ATTRIBUTES,
  "tree",
  "herbaceousPlant",
  "flower",
  "fruit",
  "plantDerived",
  "movesByItself",
  "writingTool",
  "musicalInstrument",
  "vehicle",
  "readingMaterial",
] as const;

export const MYSTERY_V3_FACTS = [
  ...MYSTERY_V2_FACTS,
  "berry",
  "imaginary",
] as const;

export const MYSTERY_V4_FACTS = [
  "mammal",
  "insect",
  "dogFamily",
  "catFamily",
  "electronicDevice",
  "usesElectricity",
  "tropicalFruit",
  "temperateFruit",
  "stationery",
  "naturalObject",
  "spaceObject",
  "hasSeeds",
  "madeOfPaper",
  "madeOfWood",
  "hasWheels",
  "makesSound",
  "pet",
] as const;

export const MYSTERY_FACTS = [
  ...MYSTERY_V3_FACTS,
  ...MYSTERY_V4_FACTS,
] as const;

export type MysteryFact = typeof MYSTERY_FACTS[number];
export type MysteryV4Fact = typeof MYSTERY_V4_FACTS[number];
export type MysteryFactValue = boolean | "unknown";
export type MysteryKnowledgeVersion = 1 | 2 | 3 | 4 | 5;
export const CURRENT_MYSTERY_KNOWLEDGE_VERSION: MysteryKnowledgeVersion = 5;
export type MysteryLocale = "ko" | "en";
export type MysteryAnswer = "yes" | "no" | "unknown";

export const MYSTERY_CATEGORIES = [
  "animal",
  "plant",
  "food",
  "object",
  "vehicle",
  "instrument",
  "nature",
  "imaginary",
] as const;
export type MysteryCategory = typeof MYSTERY_CATEGORIES[number];

export type MysteryQuestionAnalysis =
  | {
      answer: Exclude<MysteryAnswer, "unknown">;
      attribute: MysteryFact;
      negated: boolean;
    }
  | {
      answer: "unknown";
      attribute?: MysteryFact;
      negated?: boolean;
    };

export interface MysteryAnswerResolution {
  itemId: string;
  playerId: string;
  locale: MysteryLocale;
  question: string;
  answer: MysteryAnswer;
  knowledgeVersion: MysteryKnowledgeVersion;
  source?: "ai" | "fallback";
  evidence?: MysteryAnswerEvidence;
}

export interface MysteryCatalogAnswerEvidence {
  attribute: MysteryFact;
  negated: boolean;
  confidence: "high";
}

export interface MysteryDynamicAnswerEvidence {
  kind: "dynamic";
  question: string;
  predicate: string;
  answer: Exclude<MysteryAnswer, "unknown">;
  confidence: "high";
  verification: "independent-agreement";
}

export type MysteryAnswerEvidence =
  | MysteryCatalogAnswerEvidence
  | MysteryDynamicAnswerEvidence;

export interface MysteryItem {
  id: string;
  names: Record<MysteryLocale, string>;
  aliases: Record<MysteryLocale, string[]>;
  category: MysteryCategory;
  emoji: string;
  attributes: Record<MysteryAttribute, boolean>;
  facts: Record<MysteryFact, boolean>;
  factsV3: Record<MysteryFact, MysteryFactValue>;
  factsV4: Record<MysteryFact, MysteryFactValue>;
}

type LegacyMysteryItem = Omit<MysteryItem, "facts" | "factsV3" | "factsV4">;

type MysteryItemDefinition = LegacyMysteryItem & {
  factOverrides?: Partial<Record<MysteryFact, boolean>>;
  v4FactValues?: Partial<Record<MysteryV4Fact, MysteryFactValue>>;
};

function defineMysteryItem<const Id extends string>(input: {
  id: Id;
  names: Record<MysteryLocale, string>;
  aliases: Record<MysteryLocale, string[]>;
  category: MysteryCategory;
  emoji: string;
  trueAttributes: readonly MysteryAttribute[];
  factOverrides?: Partial<Record<MysteryFact, boolean>>;
  v4FactValues?: Partial<Record<MysteryV4Fact, MysteryFactValue>>;
}): MysteryItemDefinition & { id: Id } {
  const trueAttributes = new Set<MysteryAttribute>(input.trueAttributes);
  return {
    id: input.id,
    names: input.names,
    aliases: input.aliases,
    category: input.category,
    emoji: input.emoji,
    attributes: Object.fromEntries(
      MYSTERY_ATTRIBUTES.map((attribute) => [
        attribute,
        trueAttributes.has(attribute),
      ]),
    ) as Record<MysteryAttribute, boolean>,
    ...(input.factOverrides ? { factOverrides: input.factOverrides } : {}),
    ...(input.v4FactValues ? { v4FactValues: input.v4FactValues } : {}),
  };
}

const MYSTERY_ITEM_DEFINITIONS = [
  {
    id: "apple",
    names: { ko: "사과", en: "apple" },
    aliases: { ko: ["풋사과"], en: ["green apple"] },
    category: "food",
    emoji: "🍎",
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
    category: "animal",
    emoji: "🐶",
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
    category: "object",
    emoji: "📚",
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
    category: "vehicle",
    emoji: "🚗",
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
    category: "animal",
    emoji: "🦋",
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
    category: "instrument",
    emoji: "🎹",
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
    category: "nature",
    emoji: "☀️",
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
    category: "food",
    emoji: "🍓",
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
    category: "vehicle",
    emoji: "🚀",
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
    category: "plant",
    emoji: "🌻",
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
    id: "pencil",
    names: { ko: "연필", en: "pencil" },
    aliases: { ko: ["색연필"], en: ["writing pencil"] },
    category: "object",
    emoji: "✏️",
    attributes: {
      living: false,
      animal: false,
      plant: false,
      edible: false,
      small: true,
      large: false,
      colorful: false,
      indoor: true,
      legs: false,
      fly: false,
      humanMade: true,
      hard: true,
      wet: false,
      round: false,
    },
  },
  {
    id: "snowman",
    names: { ko: "눈사람", en: "snowman" },
    aliases: { ko: ["눈 인형"], en: ["snow figure"] },
    category: "object",
    emoji: "⛄",
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
    category: "imaginary",
    emoji: "🐉",
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
  defineMysteryItem({
    id: "cat",
    names: { ko: "고양이", en: "cat" },
    aliases: { ko: ["집고양이"], en: ["house cat"] },
    category: "animal",
    emoji: "🐱",
    trueAttributes: ["living", "animal", "small", "colorful", "indoor", "legs"],
    factOverrides: { movesByItself: true },
    v4FactValues: {
      mammal: true,
      catFamily: true,
      naturalObject: true,
      makesSound: true,
      pet: true,
    },
  }),
  defineMysteryItem({
    id: "elephant",
    names: { ko: "코끼리", en: "elephant" },
    aliases: { ko: ["아프리카코끼리"], en: ["African elephant"] },
    category: "animal",
    emoji: "🐘",
    trueAttributes: ["living", "animal", "large", "legs"],
    factOverrides: { movesByItself: true },
    v4FactValues: {
      mammal: true,
      naturalObject: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "penguin",
    names: { ko: "펭귄", en: "penguin" },
    aliases: { ko: ["황제펭귄"], en: ["emperor penguin"] },
    category: "animal",
    emoji: "🐧",
    trueAttributes: ["living", "animal", "small", "colorful", "legs", "wet"],
    factOverrides: { movesByItself: true },
    v4FactValues: {
      naturalObject: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "dolphin",
    names: { ko: "돌고래", en: "dolphin" },
    aliases: { ko: ["큰돌고래"], en: ["bottlenose dolphin"] },
    category: "animal",
    emoji: "🐬",
    trueAttributes: ["living", "animal", "large", "wet"],
    factOverrides: { movesByItself: true },
    v4FactValues: {
      mammal: true,
      naturalObject: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "pine-tree",
    names: { ko: "소나무", en: "pine tree" },
    aliases: { ko: ["솔나무"], en: ["pine"] },
    category: "plant",
    emoji: "🌲",
    trueAttributes: ["living", "plant", "large", "hard"],
    factOverrides: { tree: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "cactus",
    names: { ko: "선인장", en: "cactus" },
    aliases: { ko: ["사막 선인장"], en: ["desert cactus"] },
    category: "plant",
    emoji: "🌵",
    trueAttributes: ["living", "plant", "small"],
    factOverrides: { herbaceousPlant: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "rose",
    names: { ko: "장미", en: "rose" },
    aliases: { ko: ["장미꽃"], en: ["rose flower"] },
    category: "plant",
    emoji: "🌹",
    trueAttributes: ["living", "plant", "small", "colorful"],
    factOverrides: { herbaceousPlant: true, flower: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "bamboo",
    names: { ko: "대나무", en: "bamboo" },
    aliases: { ko: ["왕대"], en: ["bamboo plant"] },
    category: "plant",
    emoji: "🎋",
    trueAttributes: ["living", "plant", "large", "hard"],
    factOverrides: { herbaceousPlant: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "water-lily",
    names: { ko: "수련", en: "water lily" },
    aliases: { ko: ["수련꽃"], en: ["water lily flower"] },
    category: "plant",
    emoji: "🪷",
    trueAttributes: ["living", "plant", "small", "colorful", "wet"],
    factOverrides: { herbaceousPlant: true, flower: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "banana",
    names: { ko: "바나나", en: "banana" },
    aliases: { ko: ["노란 바나나"], en: ["yellow banana"] },
    category: "food",
    emoji: "🍌",
    trueAttributes: ["plant", "edible", "small", "colorful"],
    factOverrides: { plant: false, fruit: true, plantDerived: true },
    v4FactValues: {
      tropicalFruit: true,
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "pineapple",
    names: { ko: "파인애플", en: "pineapple" },
    aliases: { ko: ["파인애플 열매"], en: ["pineapple fruit"] },
    category: "food",
    emoji: "🍍",
    trueAttributes: ["plant", "edible", "small", "colorful", "hard", "wet"],
    factOverrides: { plant: false, fruit: true, plantDerived: true },
    v4FactValues: {
      tropicalFruit: true,
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "watermelon",
    names: { ko: "수박", en: "watermelon" },
    aliases: { ko: ["통수박"], en: ["whole watermelon"] },
    category: "food",
    emoji: "🍉",
    trueAttributes: ["plant", "edible", "large", "colorful", "wet", "round"],
    factOverrides: { plant: false, fruit: true, plantDerived: true },
    v4FactValues: {
      naturalObject: true,
      hasSeeds: true,
    },
  }),
  defineMysteryItem({
    id: "carrot",
    names: { ko: "당근", en: "carrot" },
    aliases: { ko: ["홍당무"], en: ["root carrot"] },
    category: "food",
    emoji: "🥕",
    trueAttributes: ["plant", "edible", "small", "colorful", "hard"],
    factOverrides: { plant: false, plantDerived: true },
    v4FactValues: {
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "umbrella",
    names: { ko: "우산", en: "umbrella" },
    aliases: { ko: ["비 우산"], en: ["rain umbrella"] },
    category: "object",
    emoji: "☂️",
    trueAttributes: ["small", "colorful", "humanMade", "wet"],
  }),
  defineMysteryItem({
    id: "toothbrush",
    names: { ko: "칫솔", en: "toothbrush" },
    aliases: { ko: ["양치 칫솔"], en: ["tooth brush"] },
    category: "object",
    emoji: "🪥",
    trueAttributes: ["small", "colorful", "indoor", "humanMade", "hard", "wet"],
  }),
  defineMysteryItem({
    id: "clock",
    names: { ko: "시계", en: "clock" },
    aliases: { ko: ["벽시계"], en: ["wall clock"] },
    category: "object",
    emoji: "🕰️",
    trueAttributes: ["small", "indoor", "humanMade", "hard", "round"],
    v4FactValues: {
      electronicDevice: "unknown",
      usesElectricity: "unknown",
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "bicycle",
    names: { ko: "자전거", en: "bicycle" },
    aliases: { ko: ["두발자전거"], en: ["bike"] },
    category: "vehicle",
    emoji: "🚲",
    trueAttributes: ["large", "colorful", "humanMade", "hard"],
    factOverrides: { vehicle: true },
    v4FactValues: {
      hasWheels: true,
      makesSound: "unknown",
    },
  }),
  defineMysteryItem({
    id: "train",
    names: { ko: "기차", en: "train" },
    aliases: { ko: ["열차"], en: ["railway train"] },
    category: "vehicle",
    emoji: "🚆",
    trueAttributes: ["large", "humanMade", "hard"],
    factOverrides: { vehicle: true },
    v4FactValues: {
      usesElectricity: "unknown",
      hasWheels: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "airplane",
    names: { ko: "비행기", en: "airplane" },
    aliases: { ko: ["항공기"], en: ["aeroplane"] },
    category: "vehicle",
    emoji: "✈️",
    trueAttributes: ["large", "fly", "humanMade", "hard"],
    factOverrides: { vehicle: true },
    v4FactValues: {
      usesElectricity: true,
      hasWheels: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "ship",
    names: { ko: "배", en: "ship" },
    aliases: { ko: ["선박"], en: ["vessel"] },
    category: "vehicle",
    emoji: "🚢",
    trueAttributes: ["large", "humanMade", "hard", "wet"],
    factOverrides: { vehicle: true },
    v4FactValues: {
      usesElectricity: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "guitar",
    names: { ko: "기타", en: "guitar" },
    aliases: { ko: ["통기타"], en: ["acoustic guitar"] },
    category: "instrument",
    emoji: "🎸",
    trueAttributes: ["small", "indoor", "humanMade", "hard"],
    factOverrides: { musicalInstrument: true },
    v4FactValues: {
      madeOfWood: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "drum",
    names: { ko: "북", en: "drum" },
    aliases: { ko: ["큰북"], en: ["bass drum"] },
    category: "instrument",
    emoji: "🥁",
    trueAttributes: ["small", "indoor", "humanMade", "hard", "round"],
    factOverrides: { musicalInstrument: true },
    v4FactValues: {
      madeOfWood: "unknown",
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "violin",
    names: { ko: "바이올린", en: "violin" },
    aliases: { ko: ["현악 바이올린"], en: ["fiddle"] },
    category: "instrument",
    emoji: "🎻",
    trueAttributes: ["small", "colorful", "indoor", "humanMade", "hard"],
    factOverrides: { musicalInstrument: true },
    v4FactValues: {
      madeOfWood: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "flute",
    names: { ko: "플루트", en: "flute" },
    aliases: { ko: ["가로피리"], en: ["concert flute"] },
    category: "instrument",
    emoji: "🪈",
    trueAttributes: ["small", "indoor", "humanMade", "hard"],
    factOverrides: { musicalInstrument: true },
    v4FactValues: {
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "trumpet",
    names: { ko: "트럼펫", en: "trumpet" },
    aliases: { ko: ["나팔"], en: ["brass trumpet"] },
    category: "instrument",
    emoji: "🎺",
    trueAttributes: ["small", "colorful", "indoor", "humanMade", "hard"],
    factOverrides: { musicalInstrument: true },
    v4FactValues: {
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "moon",
    names: { ko: "달", en: "moon" },
    aliases: { ko: ["지구의 달"], en: ["the moon"] },
    category: "nature",
    emoji: "🌕",
    trueAttributes: ["large", "hard", "round"],
    v4FactValues: {
      naturalObject: true,
      spaceObject: true,
    },
  }),
  defineMysteryItem({
    id: "rainbow",
    names: { ko: "무지개", en: "rainbow" },
    aliases: { ko: ["일곱 빛깔 무지개"], en: ["rain bow"] },
    category: "nature",
    emoji: "🌈",
    trueAttributes: ["large", "colorful"],
    v4FactValues: {
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "volcano",
    names: { ko: "화산", en: "volcano" },
    aliases: { ko: ["활화산"], en: ["active volcano"] },
    category: "nature",
    emoji: "🌋",
    trueAttributes: ["large", "hard"],
    v4FactValues: {
      naturalObject: true,
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "iceberg",
    names: { ko: "빙산", en: "iceberg" },
    aliases: { ko: ["바다 빙산"], en: ["ice berg"] },
    category: "nature",
    emoji: "🧊",
    trueAttributes: ["large", "hard", "wet"],
    v4FactValues: {
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "cloud",
    names: { ko: "구름", en: "cloud" },
    aliases: { ko: ["하늘 구름"], en: ["sky cloud"] },
    category: "nature",
    emoji: "☁️",
    trueAttributes: ["large", "wet"],
    v4FactValues: {
      naturalObject: true,
    },
  }),
  defineMysteryItem({
    id: "unicorn",
    names: { ko: "유니콘", en: "unicorn" },
    aliases: { ko: ["뿔 달린 말"], en: ["horned horse"] },
    category: "imaginary",
    emoji: "🦄",
    trueAttributes: ["living", "animal", "large", "colorful", "legs"],
    factOverrides: { movesByItself: true, imaginary: true },
    v4FactValues: {
      mammal: true,
      makesSound: "unknown",
    },
  }),
  defineMysteryItem({
    id: "mermaid",
    names: { ko: "인어", en: "mermaid" },
    aliases: { ko: ["바다 인어"], en: ["sea mermaid"] },
    category: "imaginary",
    emoji: "🧜",
    trueAttributes: ["living", "animal", "large", "colorful", "wet"],
    factOverrides: { movesByItself: true, imaginary: true },
    v4FactValues: {
      mammal: "unknown",
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "fairy",
    names: { ko: "요정", en: "fairy" },
    aliases: { ko: ["날개 요정"], en: ["winged fairy"] },
    category: "imaginary",
    emoji: "🧚",
    trueAttributes: ["living", "small", "colorful", "legs", "fly"],
    factOverrides: { movesByItself: true, imaginary: true },
    v4FactValues: {
      makesSound: true,
    },
  }),
  defineMysteryItem({
    id: "magic-carpet",
    names: { ko: "마법 양탄자", en: "magic carpet" },
    aliases: { ko: ["날아다니는 양탄자"], en: ["flying carpet"] },
    category: "imaginary",
    emoji: "🪄",
    trueAttributes: ["colorful", "fly", "humanMade"],
    factOverrides: { vehicle: true, imaginary: true },
  }),
  defineMysteryItem({
    id: "giant",
    names: { ko: "거인", en: "giant" },
    aliases: { ko: ["큰 거인"], en: ["storybook giant"] },
    category: "imaginary",
    emoji: "🧌",
    trueAttributes: ["living", "large", "legs"],
    factOverrides: { movesByItself: true, imaginary: true },
    v4FactValues: {
      makesSound: true,
    },
  }),
] as const satisfies readonly MysteryItemDefinition[];

type BuiltInMysteryItemId = typeof MYSTERY_ITEM_DEFINITIONS[number]["id"];

const FACT_OVERRIDES: Record<string, Partial<Record<MysteryFact, boolean>>> = {
  apple: { plant: false, fruit: true, plantDerived: true },
  puppy: { movesByItself: true },
  book: { readingMaterial: true },
  car: { vehicle: true },
  butterfly: { movesByItself: true },
  piano: { musicalInstrument: true },
  strawberry: { plant: false, fruit: true, plantDerived: true, berry: true },
  rocket: { vehicle: true },
  sunflower: { herbaceousPlant: true, flower: true },
  pencil: { writingTool: true },
  dragon: { movesByItself: true, imaginary: true },
};

const V4_FACT_VALUES: Partial<Record<
  BuiltInMysteryItemId,
  Partial<Record<MysteryV4Fact, MysteryFactValue>>
>> = {
  apple: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: true,
    stationery: false,
    naturalObject: true,
    spaceObject: false,
    hasSeeds: true,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  puppy: {
    mammal: true,
    insect: false,
    dogFamily: true,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: true,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: true,
    pet: true,
  },
  book: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: true,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  car: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: true,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: true,
    makesSound: true,
    pet: false,
  },
  butterfly: {
    mammal: false,
    insect: true,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: true,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  piano: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: true,
    hasWheels: false,
    makesSound: true,
    pet: false,
  },
  sun: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: true,
    spaceObject: true,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  strawberry: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: true,
    stationery: false,
    naturalObject: true,
    spaceObject: false,
    hasSeeds: true,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  rocket: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: true,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: true,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: true,
    pet: false,
  },
  sunflower: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: true,
    spaceObject: false,
    hasSeeds: true,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  pencil: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: true,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: true,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  snowman: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: false,
    pet: false,
  },
  dragon: {
    mammal: false,
    insect: false,
    dogFamily: false,
    catFamily: false,
    electronicDevice: false,
    usesElectricity: false,
    tropicalFruit: false,
    temperateFruit: false,
    stationery: false,
    naturalObject: false,
    spaceObject: false,
    hasSeeds: false,
    madeOfPaper: false,
    madeOfWood: false,
    hasWheels: false,
    makesSound: "unknown",
    pet: false,
  },
};

function createFactProfile(
  item: MysteryItemDefinition,
): Record<MysteryFact, boolean> {
  const facts = Object.fromEntries(
    MYSTERY_FACTS.map((fact) => [
      fact,
      MYSTERY_ATTRIBUTES.includes(fact as MysteryAttribute)
        ? item.attributes[fact as MysteryAttribute]
        : false,
    ]),
  ) as Record<MysteryFact, boolean>;
  return {
    ...facts,
    ...FACT_OVERRIDES[item.id],
    ...item.factOverrides,
  };
}

function createV3FactProfile(
  facts: Record<MysteryFact, boolean>,
): Record<MysteryFact, MysteryFactValue> {
  return { ...facts };
}

function createV4FactProfile(
  itemId: BuiltInMysteryItemId,
  facts: Record<MysteryFact, boolean>,
  overrides?: Partial<Record<MysteryV4Fact, MysteryFactValue>>,
): Record<MysteryFact, MysteryFactValue> {
  const v4Facts = V4_FACT_VALUES[itemId];
  return { ...facts, ...v4Facts, ...overrides };
}

export const MYSTERY_ITEMS: readonly MysteryItem[] =
  MYSTERY_ITEM_DEFINITIONS.map((item) => {
    const facts = createFactProfile(item);
    const definition: MysteryItemDefinition = item;
    const {
      factOverrides: _factOverrides,
      v4FactValues,
      ...publicItem
    } = definition;
    return {
      ...publicItem,
      facts,
      factsV3: createV3FactProfile(facts),
      factsV4: createV4FactProfile(item.id, facts, v4FactValues),
    };
  });

export function mysteryItemsForVersion(
  knowledgeVersion: MysteryKnowledgeVersion,
): readonly MysteryItem[] {
  if (knowledgeVersion === 5) return MYSTERY_ITEMS;
  const originalIds = new Set([
    "apple",
    "puppy",
    "book",
    "car",
    "butterfly",
    "piano",
    "sun",
    "strawberry",
    "rocket",
    "sunflower",
    "pencil",
    "snowman",
    "dragon",
  ]);
  return MYSTERY_ITEMS.filter(
    ({ id }) => originalIds.has(id) && (knowledgeVersion !== 1 || id !== "pencil"),
  );
}

export interface MysteryItemSelectionInput {
  items?: readonly MysteryItem[];
  roomUsedItemIds?: readonly string[];
  recentItemIds?: readonly string[];
  recentCategories?: readonly MysteryCategory[];
  usageCounts?: Readonly<Record<string, number>>;
  random: () => number;
}

export interface MysterySelectionProfile {
  recentItemIds: string[];
  recentCategories: MysteryCategory[];
  usageCounts: Record<string, number>;
}

function preferMysteryCandidates(
  candidates: readonly MysteryItem[],
  predicate: (item: MysteryItem) => boolean,
): MysteryItem[] {
  const preferred = candidates.filter(predicate);
  return preferred.length > 0 ? preferred : [...candidates];
}

export function selectMysteryItem(
  input: MysteryItemSelectionInput,
): MysteryItem {
  const items = input.items ?? MYSTERY_ITEMS;
  if (items.length === 0) {
    throw new Error("미스터리 박스 정답 후보가 없습니다");
  }

  const used = new Set(input.roomUsedItemIds ?? []);
  let candidates = items.filter(({ id }) => !used.has(id));
  if (candidates.length === 0) candidates = [...items];

  const recentItems = new Set(input.recentItemIds ?? []);
  candidates = preferMysteryCandidates(
    candidates,
    ({ id }) => !recentItems.has(id),
  );

  const recentCategories = new Set(input.recentCategories ?? []);
  candidates = preferMysteryCandidates(
    candidates,
    ({ category }) => !recentCategories.has(category),
  );

  const usageCounts = input.usageCounts ?? {};
  const minimumUsage = Math.min(
    ...candidates.map(({ id }) => usageCounts[id] ?? 0),
  );
  candidates = candidates.filter(
    ({ id }) => (usageCounts[id] ?? 0) === minimumUsage,
  );

  const random = input.random();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new Error("미스터리 박스 난수값이 올바르지 않습니다");
  }
  const selected = candidates[Math.floor(random * candidates.length)];
  if (!selected) throw new Error("미스터리 박스 정답을 고를 수 없습니다");
  return selected;
}

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

const LEGACY_ATTRIBUTE_PATTERNS: Record<
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

const FACT_PATTERNS: Record<
  MysteryLocale,
  Record<MysteryFact, readonly RegExp[]>
> = {
  ko: {
    ...LEGACY_ATTRIBUTE_PATTERNS.ko,
    living: [
      koreanForm("살아\\s*있(?:나요|습니까|는|다|어요|어|지\\s*않(?:나요|습니까|는|다)?)?"),
      koreanNoun("생물"),
    ],
    plant: [
      koreanForm("식물(?:인가요|입니까|이에요|예요|인가|이야|이다|이|가|은|는|을|를|도|만)?"),
    ],
    tree: [
      koreanForm("나무(?:인가요|입니까|이에요|예요|인가|이야|이다|이|가|은|는|을|를|도|만)?"),
      koreanNoun("목본"),
    ],
    herbaceousPlant: [koreanNoun("풀"), koreanNoun("초본")],
    flower: [koreanNoun("꽃")],
    fruit: [koreanNoun("과일"), koreanNoun("열매")],
    plantDerived: [
      koreanForm("식물에서\\s*(?:자라(?:나요|는|다)?|나(?:나요|는|다)?|열리(?:나요|는|다)?)"),
      koreanForm("나무에서\\s*(?:자라(?:나요|는|다)?|나(?:나요|는|다)?|열리(?:나요|는|다)?)"),
    ],
    movesByItself: [
      koreanForm("(?:스스로|저절로|혼자)\\s*움직(?:이나요|입니까|여요|이나|인다|이는|일\\s*수\\s*있(?:나요|습니까)?|이지\\s*않(?:나요|습니까|는|다)?)?"),
    ],
    writingTool: [
      koreanNoun("필기도구"),
      koreanForm("(?:글씨를|글(?:을|를))\\s*쓰는\\s*도구(?:인가요|입니까|이에요|예요|인가|이야|이다|이|가|은|는|을|를|도|만)?"),
    ],
    musicalInstrument: [koreanNoun("악기")],
    vehicle: [koreanNoun("탈것"), koreanNoun("교통수단")],
    readingMaterial: [
      koreanForm("읽는\\s*(?:것|자료|도구)"),
      koreanForm("읽는\\s*데\\s*사용하는\\s*것(?:인가요|입니까|이에요|예요|인가|이야|이다)?"),
      koreanForm("읽을\\s*수\\s*있(?:나요|습니까)?"),
    ],
    berry: [koreanNoun("베리류"), koreanNoun("딸기류")],
    imaginary: [
      koreanForm("상상으로\\s*만든\\s*존재(?:인가요|입니까|이에요|예요|인가|이야|이다)?"),
    ],
    mammal: [koreanNoun("포유류"), koreanNoun("포유동물")],
    insect: [koreanNoun("곤충")],
    dogFamily: [koreanNoun("개과"), koreanNoun("갯과")],
    catFamily: [koreanNoun("고양이과"), koreanNoun("고양잇과")],
    electronicDevice: [
      koreanNoun("전자\\s*기기"),
      koreanNoun("전자\\s*제품"),
      koreanNoun("전자제품"),
    ],
    usesElectricity: [
      koreanForm("전기(?:를|가)?\\s*(?:쓰(?:나요|는|다)?|사용(?:하나요|합니까|하는|하다)?|필요(?:한가요|합니까|하다)?)"),
    ],
    tropicalFruit: [koreanNoun("열대\\s*과일")],
    temperateFruit: [koreanNoun("온대\\s*과일")],
    stationery: [koreanNoun("문구류"), koreanNoun("학용품")],
    naturalObject: [
      koreanForm("자연에서\\s*(?:생긴|생겨난|만들어진)"),
      koreanNoun("자연물"),
    ],
    spaceObject: [
      koreanNoun("우주\\s*물체"),
      koreanNoun("우주에\\s*있는\\s*물체"),
      koreanNoun("천체"),
    ],
    hasSeeds: [
      koreanForm("씨(?:가|앗이)?\\s*있(?:나요|습니까|는|다)?"),
      koreanForm("씨앗(?:이|을)?\\s*가지(?:나요|고\\s*있나요)?"),
    ],
    madeOfPaper: [
      koreanForm("종이로\\s*(?:만든|만들어졌(?:나요|습니까|다)?)"),
      koreanForm("종이로\\s*만들(?:었나요|었습니까|다)"),
      koreanForm("종이\\s*재질"),
    ],
    madeOfWood: [
      koreanForm("나무로\\s*(?:만든|만들어졌(?:나요|습니까|다)?)"),
      koreanForm("나무로\\s*만들(?:었나요|었습니까|다)"),
      koreanForm("나무\\s*재질"),
    ],
    hasWheels: [
      koreanForm("바퀴(?:가|를)?\\s*있(?:나요|습니까|는|다)?"),
      koreanNoun("바퀴"),
    ],
    makesSound: [
      koreanForm("소리(?:가|를)?\\s*(?:나(?:나요|는|다)?|내(?:나요|는|다)?)"),
    ],
    pet: [koreanNoun("반려동물"), koreanNoun("애완동물")],
  },
  en: {
    ...LEGACY_ATTRIBUTE_PATTERNS.en,
    plant: [/\bplant\b/u],
    tree: [/\btree\b/u, /\bwoody plant\b/u],
    herbaceousPlant: [
      /\bherbaceous plant\b/u,
      /\bnon-woody plant\b/u,
      /\bherb(?:aceous)?\b/u,
    ],
    flower: [/\bflower(?:ing plant)?\b/u],
    fruit: [/\bfruit\b/u],
    plantDerived: [
      /\b(?:grow|grows|grown|come|comes) (?:on|from) (?:a )?(?:plant|tree)\b/u,
    ],
    movesByItself: [
      /\bmove(?:s)? (?:by itself|on its own|without help)\b/u,
    ],
    writingTool: [/\bwriting (?:tool|instrument)\b/u, /\bstationery\b/u],
    musicalInstrument: [/\bmusical instrument\b/u, /\binstrument\b/u],
    vehicle: [/\bvehicle\b/u, /\btransport(?:ation)?\b/u],
    readingMaterial: [
      /\breading material\b/u,
      /\b(?:used for|something to) read(?:ing)?\b/u,
    ],
    berry: [/\bberry\b/u],
    imaginary: [/\bimaginary\b/u, /\bmythical\b/u],
    mammal: [/\bmammal\b/u],
    insect: [/\binsect\b/u],
    dogFamily: [/\b(?:dog|canine) family\b/u, /\bcanid\b/u],
    catFamily: [/\b(?:cat|feline) family\b/u, /\bfelid\b/u],
    electronicDevice: [/\belectronic (?:device|product)\b/u, /\belectronics?\b/u],
    usesElectricity: [
      /\b(?:use|uses|need|needs|require|requires) electricity\b/u,
      /\belectric(?:ally)? powered\b/u,
    ],
    tropicalFruit: [/\btropical fruit\b/u],
    temperateFruit: [/\btemperate fruit\b/u],
    stationery: [/\bstationery\b/u, /\bschool suppl(?:y|ies)\b/u],
    naturalObject: [/\bnatural object\b/u, /\boccurs? naturally\b/u],
    spaceObject: [/\b(?:space|celestial) object\b/u, /\bcelestial body\b/u],
    hasSeeds: [/\b(?:have|has|contain|contains) seeds?\b/u],
    madeOfPaper: [/\bmade (?:of|from) paper\b/u, /\bpaper material\b/u],
    madeOfWood: [/\bmade (?:of|from) wood\b/u, /\bwooden\b/u],
    hasWheels: [/\b(?:have|has) wheels?\b/u],
    makesSound: [/\b(?:make|makes|produce|produces) (?:a )?sounds?\b/u],
    pet: [/\bpet\b/u, /\bcompanion animal\b/u],
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

const MYSTERY_FACT_QUESTIONS: Record<
  MysteryLocale,
  Record<MysteryFact, string>
> = {
  ko: {
    ...MYSTERY_ATTRIBUTE_QUESTIONS.ko,
    tree: "나무인가요?",
    herbaceousPlant: "풀인가요?",
    flower: "꽃인가요?",
    fruit: "열매인가요?",
    plantDerived: "식물에서 자라나요?",
    movesByItself: "스스로 움직이나요?",
    writingTool: "필기도구인가요?",
    musicalInstrument: "악기인가요?",
    vehicle: "탈것인가요?",
    readingMaterial: "읽는 데 사용하는 것인가요?",
    berry: "베리류인가요?",
    imaginary: "상상으로 만든 존재인가요?",
    mammal: "포유류인가요?",
    insect: "곤충인가요?",
    dogFamily: "개과인가요?",
    catFamily: "고양이과인가요?",
    electronicDevice: "전자기기인가요?",
    usesElectricity: "전기를 사용하나요?",
    tropicalFruit: "열대과일인가요?",
    temperateFruit: "온대과일인가요?",
    stationery: "문구류인가요?",
    naturalObject: "자연에서 생긴 것인가요?",
    spaceObject: "우주에 있는 물체인가요?",
    hasSeeds: "씨가 있나요?",
    madeOfPaper: "종이로 만들었나요?",
    madeOfWood: "나무로 만들었나요?",
    hasWheels: "바퀴가 있나요?",
    makesSound: "소리를 내나요?",
    pet: "반려동물인가요?",
  },
  en: {
    ...MYSTERY_ATTRIBUTE_QUESTIONS.en,
    tree: "Is it a tree?",
    herbaceousPlant: "Is it an herbaceous plant?",
    flower: "Is it a flower?",
    fruit: "Is it a fruit?",
    plantDerived: "Does it grow on a plant?",
    movesByItself: "Does it move on its own?",
    writingTool: "Is it a writing tool?",
    musicalInstrument: "Is it a musical instrument?",
    vehicle: "Is it a vehicle?",
    readingMaterial: "Is it used for reading?",
    berry: "Is it a berry?",
    imaginary: "Is it imaginary?",
    mammal: "Is it a mammal?",
    insect: "Is it an insect?",
    dogFamily: "Is it in the dog family?",
    catFamily: "Is it in the cat family?",
    electronicDevice: "Is it an electronic device?",
    usesElectricity: "Does it use electricity?",
    tropicalFruit: "Is it a tropical fruit?",
    temperateFruit: "Is it a temperate fruit?",
    stationery: "Is it stationery?",
    naturalObject: "Does it occur naturally?",
    spaceObject: "Is it a space object?",
    hasSeeds: "Does it have seeds?",
    madeOfPaper: "Is it made of paper?",
    madeOfWood: "Is it made of wood?",
    hasWheels: "Does it have wheels?",
    makesSound: "Does it make a sound?",
    pet: "Is it a pet?",
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
  attribute: MysteryFact,
  locale: MysteryLocale,
): string {
  return MYSTERY_FACT_QUESTIONS[locale][attribute];
}

export function mysteryAttributesForVersion(
  knowledgeVersion: MysteryKnowledgeVersion,
): readonly MysteryFact[] {
  return knowledgeVersion === 1
    ? MYSTERY_ATTRIBUTES
    : knowledgeVersion === 2
      ? MYSTERY_V2_FACTS
      : knowledgeVersion === 3
        ? MYSTERY_V3_FACTS
        : MYSTERY_FACTS;
}

export function isMysteryAttributeForVersion(
  value: unknown,
  knowledgeVersion: MysteryKnowledgeVersion,
): value is MysteryFact {
  return typeof value === "string" &&
    mysteryAttributesForVersion(knowledgeVersion).includes(value as MysteryFact);
}

export function isMysteryAnswerEvidence(
  value: unknown,
  knowledgeVersion: MysteryKnowledgeVersion,
): value is MysteryAnswerEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const evidence = value as Record<string, unknown>;
  if (evidence.kind === "dynamic") {
    return knowledgeVersion >= 4 &&
      Object.keys(evidence).length === 6 &&
      typeof evidence.question === "string" &&
      [...evidence.question].length > 0 &&
      [...evidence.question].length <= 200 &&
      evidence.question === evidence.question.trim() &&
      typeof evidence.predicate === "string" &&
      [...evidence.predicate].length > 0 &&
      [...evidence.predicate].length <= 120 &&
      evidence.predicate === evidence.predicate.trim() &&
      (evidence.answer === "yes" || evidence.answer === "no") &&
      evidence.confidence === "high" &&
      evidence.verification === "independent-agreement";
  }
  return Object.keys(evidence).length === 3 &&
    isMysteryAttributeForVersion(evidence.attribute, knowledgeVersion) &&
    typeof evidence.negated === "boolean" &&
    evidence.confidence === "high";
}

export function resolveMysteryAnswerEvidence(
  item: MysteryItem,
  evidence: MysteryAnswerEvidence,
  question: string,
  knowledgeVersion: MysteryKnowledgeVersion,
): MysteryAnswer {
  if ("kind" in evidence) {
    return evidence.question === question ? evidence.answer : "unknown";
  }
  return resolveMysteryAttribute(
    item,
    evidence.attribute,
    evidence.negated,
    knowledgeVersion,
  );
}

export function resolveMysteryAttribute(
  item: MysteryItem,
  attribute: MysteryFact,
  negated: boolean,
  knowledgeVersion: MysteryKnowledgeVersion = CURRENT_MYSTERY_KNOWLEDGE_VERSION,
): MysteryAnswer {
  const value = knowledgeVersion === 1
    ? item.attributes[attribute as MysteryAttribute]
    : knowledgeVersion === 2
      ? item.facts[attribute]
      : knowledgeVersion === 3
        ? item.factsV3[attribute]
        : item.factsV4[attribute];
  if (value === "unknown") return "unknown";
  return (negated ? !value : value) ? "yes" : "no";
}

export function analyzeMysteryQuestion(
  question: string,
  item: MysteryItem,
  locale: MysteryLocale,
  knowledgeVersion: MysteryKnowledgeVersion = CURRENT_MYSTERY_KNOWLEDGE_VERSION,
): MysteryQuestionAnalysis {
  const normalized = normalizeText(question, locale);
  const attributes = mysteryAttributesForVersion(knowledgeVersion);
  const patterns = knowledgeVersion === 1
    ? LEGACY_ATTRIBUTE_PATTERNS[locale]
    : FACT_PATTERNS[locale];
  let detectedAttributes = attributes.map((attribute) => ({
    attribute,
    matches: findPatternMatches(
      normalized,
      patterns[attribute as keyof typeof patterns],
    ),
  })).filter(({ matches }) => matches.length > 0);
  if (
    knowledgeVersion >= 4 &&
    (/(?:무슨|어떤)\s*소리/gu.test(normalized) ||
      /\b(?:what|which) sound\b/gu.test(normalized))
  ) {
    detectedAttributes = detectedAttributes.filter(
      ({ attribute }) => attribute !== "makesSound",
    );
  }
  if (knowledgeVersion >= 2) {
    const specializedPlantMatches = detectedAttributes
      .filter(({ attribute }) => [
        "tree",
        "herbaceousPlant",
        "flower",
        "plantDerived",
      ].includes(attribute))
      .flatMap(({ matches }) => matches);
    detectedAttributes = detectedAttributes
      .map((detected) => detected.attribute !== "plant"
        ? detected
        : {
            ...detected,
            matches: detected.matches.filter((plantMatch) =>
              !specializedPlantMatches.some((specializedMatch) =>
                specializedMatch.start <= plantMatch.start &&
                specializedMatch.end >= plantMatch.end
              )
            ),
          })
      .filter(({ matches }) => matches.length > 0);
    const herbaceousMatches = detectedAttributes.find(
      ({ attribute }) => attribute === "herbaceousPlant",
    )?.matches ?? [];
    detectedAttributes = detectedAttributes
      .map((detected) => detected.attribute !== "tree"
        ? detected
        : {
            ...detected,
            matches: detected.matches.filter((treeMatch) =>
              !herbaceousMatches.some((herbaceousMatch) =>
                herbaceousMatch.start <= treeMatch.start &&
                herbaceousMatch.end >= treeMatch.end
              )
            ),
          })
      .filter(({ matches }) => matches.length > 0);
  }
  if (knowledgeVersion >= 4) {
    for (const [broadAttribute, specializedAttributes] of [
      ["fruit", ["tropicalFruit", "temperateFruit"]],
      ["humanMade", ["electronicDevice"]],
      ["writingTool", ["stationery"]],
    ] as const) {
      const specializedMatches = detectedAttributes
        .filter(({ attribute }) =>
          specializedAttributes.includes(attribute as never)
        )
        .flatMap(({ matches }) => matches);
      detectedAttributes = detectedAttributes
        .map((detected) => detected.attribute !== broadAttribute
          ? detected
          : {
              ...detected,
              matches: detected.matches.filter((broadMatch) =>
                !specializedMatches.some((specializedMatch) =>
                  specializedMatch.start <= broadMatch.start &&
                  specializedMatch.end >= broadMatch.end
                )
              ),
            })
        .filter(({ matches }) => matches.length > 0);
    }
  }
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
  const answer = resolveMysteryAttribute(
    item,
    attribute,
    negated,
    knowledgeVersion,
  );
  if (answer === "unknown") {
    return { answer, attribute, negated };
  }
  return {
    answer,
    attribute,
    negated,
  };
}

export function classifyMysteryQuestion(
  question: string,
  item: MysteryItem,
  locale: MysteryLocale,
  knowledgeVersion: MysteryKnowledgeVersion = CURRENT_MYSTERY_KNOWLEDGE_VERSION,
): MysteryAnswer {
  return analyzeMysteryQuestion(
    question,
    item,
    locale,
    knowledgeVersion,
  ).answer;
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
