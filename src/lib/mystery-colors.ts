import type { BuiltInMysteryItemId, MysteryAnswer, MysteryItem, MysteryLocale } from "./mystery-box-rules";

export const MYSTERY_COLOR_LABELS = {
  red: { ko: "빨간색", en: "red" }, orange: { ko: "주황색", en: "orange" },
  yellow: { ko: "노란색", en: "yellow" }, green: { ko: "초록색", en: "green" },
  blue: { ko: "파란색", en: "blue" }, indigo: { ko: "남색", en: "indigo" },
  purple: { ko: "보라색", en: "purple" }, pink: { ko: "분홍색", en: "pink" },
  brown: { ko: "갈색", en: "brown" }, black: { ko: "검은색", en: "black" },
  white: { ko: "흰색", en: "white" }, gray: { ko: "회색", en: "gray" },
} as const;
export type MysteryColor = keyof typeof MYSTERY_COLOR_LABELS;

// 놀이에서 정한 대표 모습이다. 실제 품종·제품의 모든 색을 뜻하지 않는다.
// 기기의 이모지 색에 의존하지 않으며, 같은 표를 학생 안내와 서버 판정에서 사용한다.
// 근거 버전 3으로 저장되므로 이 표를 바꾸려면 새 근거 버전이 필요하다.
export const MYSTERY_GAME_COLORS = {
  apple: ["red", "green"], puppy: ["brown", "white", "black"], book: ["blue", "white"],
  car: ["red", "black"], butterfly: ["blue", "black"], piano: ["black", "white"],
  sun: ["yellow", "orange"], strawberry: ["red"], rocket: ["white", "gray", "red"],
  sunflower: ["yellow", "brown", "green"], pencil: ["yellow", "brown", "black"],
  snowman: ["white"], dragon: ["green"], cat: ["orange", "white"], elephant: ["gray"],
  penguin: ["black", "white"], dolphin: ["gray"], "pine-tree": ["green", "brown"],
  cactus: ["green"], rose: ["red", "green"], bamboo: ["green"], "water-lily": ["pink", "green"],
  banana: ["yellow"], pineapple: ["yellow", "brown", "green"], watermelon: ["green", "red"],
  carrot: ["orange"], umbrella: ["purple"], toothbrush: ["blue", "white"],
  clock: ["brown", "white", "black"], bicycle: ["red", "black", "gray"],
  train: ["white", "blue", "gray"], airplane: ["white", "gray"], ship: ["white", "blue"],
  guitar: ["brown", "black"], drum: ["red", "white"], violin: ["brown", "black"],
  flute: ["gray"], trumpet: ["yellow"], moon: ["white", "gray"],
  rainbow: ["red", "orange", "yellow", "green", "blue", "indigo", "purple"],
  volcano: ["brown", "orange", "red"], iceberg: ["white", "blue"], cloud: ["white", "gray"],
  unicorn: ["white", "pink", "purple"], mermaid: ["green"], fairy: ["green", "yellow"],
  "magic-carpet": ["purple", "yellow"], giant: ["green", "brown"],
} as const satisfies Record<BuiltInMysteryItemId, readonly MysteryColor[]>;

const COLOR_ALIASES: Record<string, MysteryColor> = {
  빨갛: "red", 붉: "red", 노랗: "yellow", 파랗: "blue", 검: "black", 하얗: "white", 희: "white",
  빨간: "red", 빨강: "red", 붉은: "red", 주황: "orange", 오렌지: "orange",
  노란: "yellow", 노랑: "yellow", 초록: "green", 녹색: "green",
  파란: "blue", 파랑: "blue", 남색: "indigo", 보라: "purple", 분홍: "pink",
  갈색: "brown", 검은: "black", 검정: "black", 까만: "black",
  하얀: "white", 흰: "white", 하양: "white", 회색: "gray",
};
const KO_COLOR = "(빨간|빨강|붉은|주황|오렌지|노란|노랑|초록|녹색|파란|파랑|남색|보라|분홍|갈색|검은|검정|까만|하얀|흰|하양|회색)";
const KO_COLOR_PREFIX = "^(?:(?:그것|이것|정답)은)?(?:보통|주로)?(?:색(?:깔)?(?:이|은))?";
const KO_COLOR_QUESTION = new RegExp(
  KO_COLOR_PREFIX + KO_COLOR +
  "(?:색)?(인가요|입니까|이에요|예요|인가|이야|이죠|이니|이냐|일까|일까요|이아닌가요|이아닙니까|(?:이|은)?(?:있나요|있습니까|있어요|없나요|없습니까|없어요)|을가지고있나요)$", "u",
);

const KO_COLOR_ADJECTIVE_QUESTION = new RegExp(
  KO_COLOR_PREFIX + "(빨갛|붉|노랗|파랗|검|하얗|희)(나요|습니까|니|냐|지않나요)$", "u",
);
const KO_COLOR_ADNOMINAL_QUESTION = new RegExp(
  KO_COLOR_PREFIX + "(빨간|붉은|노란|파란|검은|하얀|흰)(가요)$", "u",
);

/** 한 가지 색의 포함 여부만 판정한다. 부위·비교·복합 조건은 자유 질문으로 남긴다. */
export function resolveMysteryColorQuestion(item: MysteryItem, question: string, locale: MysteryLocale): MysteryAnswer | null {
  const text = question.normalize("NFC").trim().toLowerCase().replace(/[?？]+$/u, "").trim();
  let color: MysteryColor;
  let negated: boolean;
  if (locale === "ko") {
    const compact = text.replace(/\s+/gu, "");
    const match = compact.match(KO_COLOR_QUESTION) ??
      compact.match(KO_COLOR_ADJECTIVE_QUESTION) ?? compact.match(KO_COLOR_ADNOMINAL_QUESTION);
    if (!match) return null;
    color = COLOR_ALIASES[match[1]];
    negated = /아닌|아닙|없|않/u.test(match[2]);
  } else {
    const match = text.match(/^(is it |is it not |isn't it )(?:usually |mostly )?(red|orange|yellow|green|blue|indigo|purple|pink|brown|black|white|gr[ae]y)(?: in colou?r)?$/u);
    if (!match) return null;
    color = (match[2] === "grey" ? "gray" : match[2]) as MysteryColor;
    negated = /^isn't|^is it not /u.test(text);
  }
  const palette: readonly MysteryColor[] | undefined = MYSTERY_GAME_COLORS[item.id as BuiltInMysteryItemId];
  if (!palette) return "unknown";
  return palette.includes(color) !== negated ? "yes" : "no";
}
