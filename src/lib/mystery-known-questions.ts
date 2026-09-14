import { MYSTERY_REVIEWED_ANATOMY } from "./mystery-item-context";
import type { MysteryAnswer, MysteryItem, MysteryLocale } from "./mystery-box-rules";

const counts: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

const colors: Record<string, string> = {
  빨간: "red", 빨강: "red", 붉은: "red", 주황: "orange", 오렌지: "orange",
  노란: "yellow", 노랑: "yellow", 초록: "green", 녹색: "green", 초록색: "green",
  파란: "blue", 파랑: "blue", 남색: "indigo", 보라: "purple", 분홍: "pink",
  갈색: "brown", 검은: "black", 검정: "black", 까만: "black", 하얀: "white",
  흰: "white", 하양: "white", 회색: "gray", red: "red", orange: "orange",
  yellow: "yellow", green: "green", blue: "blue", indigo: "indigo", purple: "purple",
  pink: "pink", brown: "brown", black: "black", white: "white", gray: "gray", grey: "gray",
};

// 일반적으로 볼 수 있는 모습의 색만 사용한다. 품종·제품에 따라 다양한 것은 판정을 보류한다.
const typicalColors: Partial<Record<string, readonly string[]>> = {
  apple: ["red", "green"], strawberry: ["red"], banana: ["yellow"],
  carrot: ["orange"], watermelon: ["green", "red"], pineapple: ["yellow", "brown", "green"],
  "pine-tree": ["green", "brown"], cactus: ["green"], bamboo: ["green"],
  sunflower: ["yellow", "brown", "green"], elephant: ["gray"],
  penguin: ["black", "white"], dolphin: ["gray"], snowman: ["white"],
  iceberg: ["white", "blue"], cloud: ["white", "gray"], moon: ["white", "gray"],
  rainbow: ["red", "orange", "yellow", "green", "blue", "indigo", "purple"],
};

const claws: Partial<Record<string, boolean>> = {
  // 코끼리의 발톱: https://nationalzoo.si.edu/animals/news/happy-asian-elephant-awareness-month
  puppy: true, cat: true, elephant: true, penguin: true, dolphin: false,
};

function yesNo(value: boolean, negated = false): MysteryAnswer {
  return value !== negated ? "yes" : "no";
}

/** 완전한 한 가지 질문만 처리한다. 복합 질문이나 다른 문장이 붙으면 인공지능 경로에 맡긴다. */
export function resolveKnownMysteryQuestion(
  item: MysteryItem,
  question: string,
  locale: MysteryLocale,
): MysteryAnswer | null {
  const text = question.normalize("NFC").trim().toLowerCase().replace(/[?？]+$/u, "").trim();
  const nameMatch = locale === "ko"
    ? text.match(/^(?:정답(?:의)?\s*)?(?:이름(?:이|은)?\s*)?(?:한글(?:로)?\s*)?(\d{1,2}|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*글자(?:인가요|입니까|예요|인가|야|죠|가\s*아닌가요|가\s*아닙니까)$/u)
    : text.match(/^(?:does (?:its|the) name have|is (?:its|the) name) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) letters?(?: long)?$/u);
  if (nameMatch) {
    const count = counts[nameMatch[1]] ?? Number(nameMatch[1]);
    const name = item.names[locale].normalize("NFC").replace(/[\s-]/gu, "");
    return yesNo([...name].length === count, /아닌|아닙/u.test(text));
  }

  const colorMatch = locale === "ko"
    ? text.match(/^(?:(?:보통|주로)\s*)?(?:색(?:깔)?(?:이|은)\s*)?(빨간|빨강|붉은|주황|오렌지|노란|노랑|초록색|초록|녹색|파란|파랑|남색|보라|분홍|갈색|검은|검정|까만|하얀|흰|하양|회색)(?:색)?(?:인가요|입니까|이에요|예요|인가|이야|이\s*아닌가요|이\s*아닙니까)$/u)
    : text.match(/^is it (?:usually |mostly )?(red|orange|yellow|green|blue|indigo|purple|pink|brown|black|white|gr[ae]y)(?: in colou?r)?$/u);
  if (colorMatch) {
    const palette = typicalColors[item.id];
    return palette ? yesNo(palette.includes(colors[colorMatch[1]]), /아닌|아닙/u.test(text)) : "unknown";
  }

  const clawMatch = locale === "ko"
    ? text.match(/^(?:(?:그것|이것)(?:은|에|에는)?\s*)?발톱(?:이|은)?\s*(있나요|있습니까|있어요|있는가요|없나요|없습니까|없어요|없는가요)$/u)
    : text.match(/^(?:does it have|has it got) (?:any )?(claws|toenails)$/u);
  if (clawMatch) {
    if (locale === "en" && item.id === "elephant" && clawMatch[1] === "claws") return "no";
    const hasClaws = claws[item.id] ?? (
      item.category !== "animal" && item.category !== "imaginary" ? false : undefined
    );
    return hasClaws === undefined ? "unknown" : yesNo(hasClaws, /없/u.test(text));
  }
  return resolveMysteryAnatomyQuestion(item, question, locale);
}

/** 새로 검수한 몸 구조 질문은 별도 근거 버전으로 보관한다. */
export function resolveMysteryAnatomyQuestion(
  item: MysteryItem,
  question: string,
  locale: MysteryLocale,
): MysteryAnswer | null {
  const text = question.normalize("NFC").trim().toLowerCase().replace(/[?？]+$/u, "").trim();
  const wingMatch = locale === "ko"
    ? text.match(/^(?:(?:그것|이것)(?:은|에|에는)?\s*)?날개(?:가|는)?\s*(있나요|있습니까|있어요|있는가요|없나요|없습니까|없어요|없는가요)$/u)
    : text.match(/^(?:does it have|has it got) (?:any )?wings$/u);
  if (wingMatch) {
    const wings = MYSTERY_REVIEWED_ANATOMY[item.id]?.wings;
    if (wings !== undefined) return yesNo(wings, /없/u.test(text));
    // 비행기는 날개가 있지만 로켓·상상 속 물건은 모습에 따라 달라질 수 있다.
    if (item.id === "airplane") return yesNo(true, /없/u.test(text));
    if (item.category === "imaginary" || item.id === "rocket" || item.category === "animal") return "unknown";
    return yesNo(false, /없/u.test(text));
  }

  const legMatch = locale === "ko"
    ? text.match(/^다리(?:가|는)?\s*(\d{1,2}|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*개(?:인가요|입니까|예요|인가|야|죠|가\s*아닌가요)$/u)
    : text.match(/^does it have (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) legs$/u);
  if (legMatch) {
    const legs = MYSTERY_REVIEWED_ANATOMY[item.id]?.legs;
    const count = counts[legMatch[1]] ?? Number(legMatch[1]);
    if (legs !== undefined) return yesNo(legs === count, /아닌/u.test(text));
    // 가구·악기·상상 속 물건의 다리 수를 단정하지 않는다.
    if (["food", "plant", "nature"].includes(item.category)) return yesNo(count === 0, /아닌/u.test(text));
    return "unknown";
  }
  return null;
}
