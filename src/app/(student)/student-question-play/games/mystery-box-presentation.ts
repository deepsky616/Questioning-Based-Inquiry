import {
  MYSTERY_ITEMS,
  type MysteryCategory,
} from "@/lib/mystery-box-rules";

const CATEGORY_LABELS: Record<
  MysteryCategory,
  { ko: string; en: string }
> = {
  animal: { ko: "동물", en: "animal" },
  plant: { ko: "식물", en: "plant" },
  food: { ko: "음식", en: "food" },
  object: { ko: "생활 물건", en: "everyday object" },
  vehicle: { ko: "탈것", en: "vehicle" },
  instrument: { ko: "악기", en: "instrument" },
  nature: { ko: "자연", en: "nature" },
  imaginary: { ko: "상상 속 대상", en: "imaginary subject" },
};

export const MYSTERY_PRESENTATION: Record<
  string,
  { emoji: string; category: { ko: string; en: string } }
> = Object.fromEntries(
  MYSTERY_ITEMS.map((item) => [
    item.id,
    {
      emoji: item.emoji,
      category: CATEGORY_LABELS[item.category],
    },
  ]),
);
