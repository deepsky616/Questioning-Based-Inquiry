// 미스터리 박스 물건 표현(이모지·분류) — 로케일별 분류명이 함께 정의된
// 이중언어 게임 콘텐츠 데이터. 화면 코드는 mysteryLocale로 골라 표시한다.
export const MYSTERY_PRESENTATION: Record<
  string,
  { emoji: string; category: { ko: string; en: string } }
> = {
  apple: { emoji: "🍎", category: { ko: "과일", en: "fruit" } },
  puppy: { emoji: "🐶", category: { ko: "동물", en: "animal" } },
  book: { emoji: "📚", category: { ko: "물건", en: "object" } },
  car: { emoji: "🚗", category: { ko: "탈것", en: "vehicle" } },
  butterfly: { emoji: "🦋", category: { ko: "동물", en: "animal" } },
  piano: { emoji: "🎹", category: { ko: "악기", en: "instrument" } },
  sun: { emoji: "☀️", category: { ko: "우주", en: "space" } },
  strawberry: { emoji: "🍓", category: { ko: "과일", en: "fruit" } },
  rocket: { emoji: "🚀", category: { ko: "탈것", en: "vehicle" } },
  sunflower: { emoji: "🌻", category: { ko: "식물", en: "plant" } },
  snowman: { emoji: "⛄", category: { ko: "만든 것", en: "made object" } },
  dragon: { emoji: "🐉", category: { ko: "상상 속 생물", en: "imaginary creature" } },
};
