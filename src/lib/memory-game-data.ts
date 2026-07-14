/**
 * 질문-대답 짝 찾기 놀이 — 폴백 페어 풀과 도우미
 * AI가 페어 생성에 실패할 때 사용.
 */

import type { LocalizedText } from "@/lib/question-game-i18n";

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  questionText?: LocalizedText;
  answerText?: LocalizedText;
}

export const MEMORY_FALLBACK_PAIRS: ReadonlyArray<{ question: string; answer: string }> = [
  { question: "하늘은 왜 파랄까?", answer: "햇빛이 공기에 부딪혀 파란빛이 흩어지기 때문이에요." },
  { question: "비는 어떻게 만들어질까?", answer: "수증기가 차가운 곳에서 모여 물방울이 되면 비가 돼요." },
  { question: "왜 잠을 자야 할까?", answer: "몸과 뇌가 쉬면서 자라기 위해 필요해요." },
  { question: "지구는 어떻게 돌까?", answer: "지구는 태양 주위를 1년에 한 바퀴 돌아요." },
  { question: "씨앗은 어떻게 자랄까?", answer: "물·햇빛·흙 속 양분으로 천천히 자라나요." },
  { question: "왜 무지개가 생길까?", answer: "햇빛이 빗방울에 닿아 일곱 빛깔로 나뉘기 때문이에요." },
  { question: "달은 왜 모양이 변할까?", answer: "지구 주위를 돌면서 햇빛 받는 면이 달라지기 때문이에요." },
  { question: "왜 바다는 짤까?", answer: "땅에 있던 소금이 강물을 따라 바다로 모였기 때문이에요." },
  { question: "벌은 왜 꽃에 갈까?", answer: "꽃의 꿀을 모아 벌집에 저장해서 먹기 때문이에요." },
  { question: "북극은 왜 그렇게 추울까?", answer: "햇빛이 비스듬히 들어와 적게 데워지기 때문이에요." },
  { question: "왜 손을 자주 씻어야 할까?", answer: "보이지 않는 균을 닦아 병을 막기 위해서예요." },
  { question: "별은 왜 깜빡거릴까?", answer: "별빛이 지구 공기를 통과하면서 흔들리기 때문이에요." },
  { question: "공룡은 왜 사라졌을까?", answer: "큰 운석이 지구에 떨어져 환경이 크게 바뀌었기 때문이에요." },
  { question: "왜 바람이 불까?", answer: "공기가 따뜻한 곳에서 차가운 곳으로 움직이기 때문이에요." },
  { question: "고양이는 왜 그르렁거릴까?", answer: "기분이 좋거나 안정될 때 내는 소리예요." },
  { question: "물은 왜 얼면 부피가 커질까?", answer: "물 분자가 얼면서 더 큰 모양으로 배열되기 때문이에요." },
  { question: "왜 책을 읽으면 좋을까?", answer: "새로운 생각을 배우고 상상력을 키울 수 있어요." },
  { question: "사람은 왜 음식이 필요할까?", answer: "음식에서 힘과 영양을 얻어 자라기 때문이에요." },
  { question: "왜 신호등은 빨간색일까?", answer: "빨간색이 멀리서도 잘 보여서 '멈춰'라는 뜻을 알리기 좋아요." },
  { question: "왜 친구가 필요할까?", answer: "함께 놀고 도와주며 마음을 나눌 수 있어요." },
];

export const MEMORY_FALLBACK_PAIRS_EN: ReadonlyArray<{ question: string; answer: string }> = [
  { question: "Why is the sky blue?", answer: "Sunlight scatters in the air, and blue light spreads out the most." },
  { question: "How is rain made?", answer: "Water vapor cools, gathers into drops, and falls as rain." },
  { question: "Why do we need sleep?", answer: "Our body and brain rest, recover, and grow while we sleep." },
  { question: "How does Earth move?", answer: "Earth spins each day and travels around the sun each year." },
  { question: "How does a seed grow?", answer: "It uses water, sunlight, and nutrients from soil to grow slowly." },
  { question: "Why do rainbows appear?", answer: "Sunlight bends through raindrops and separates into colors." },
  { question: "Why does the moon change shape?", answer: "We see different sunlit parts of the moon as it moves around Earth." },
  { question: "Why is the ocean salty?", answer: "Minerals and salts from rocks travel through rivers into the ocean." },
  { question: "Why do bees visit flowers?", answer: "They collect nectar for food and help flowers make seeds." },
  { question: "Why is the North Pole so cold?", answer: "Sunlight reaches it at a low angle, so it warms the area less." },
  { question: "Why should we wash our hands?", answer: "Washing removes tiny germs and helps prevent sickness." },
  { question: "Why do stars twinkle?", answer: "Starlight shakes a little as it passes through Earth's moving air." },
  { question: "Why did dinosaurs disappear?", answer: "A huge space rock likely changed Earth's environment very quickly." },
  { question: "Why does wind blow?", answer: "Air moves from one place to another when temperatures and pressure change." },
  { question: "Why do cats purr?", answer: "Cats often purr when they feel calm, happy, or safe." },
  { question: "Why does ice take more space than water?", answer: "Water molecules spread into a wider pattern when they freeze." },
  { question: "Why is reading helpful?", answer: "Reading helps us learn new ideas and grow our imagination." },
  { question: "Why do people need food?", answer: "Food gives our bodies energy and nutrients to grow and move." },
  { question: "Why are stop lights red?", answer: "Red is easy to notice from far away and means stop." },
  { question: "Why do we need friends?", answer: "Friends help us share feelings, play together, and support each other." },
];

/** 카드 수 → 쌍 수 */
export const MEMORY_DIFFICULTY = {
  easy:   { cards: 12, pairs: 6,  label: "쉬움" },
  normal: { cards: 20, pairs: 10, label: "보통" },
  hard:   { cards: 30, pairs: 15, label: "어려움" },
} as const;

export type MemoryDifficulty = keyof typeof MEMORY_DIFFICULTY;

export function isMemoryRollRoundId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value
  );
}

export function resolveMemoryRollRoundId(
  room: { code: string; createdAt: number },
  stored: unknown,
): string | null {
  if (stored === undefined) {
    return ["legacy", room.code, room.createdAt].join(":");
  }
  return isMemoryRollRoundId(stored) ? stored : null;
}

export function shuffleWithRandom<T>(a: readonly T[], random: () => number): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("random must be between zero and one");
    }
    const j = Math.floor(value * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export function shuffle<T>(a: T[]): T[] {
  return shuffleWithRandom(a, Math.random);
}

export function pickFallbackPairs(n: number, locale = "ko"): QAPair[] {
  const source = locale === "en" ? MEMORY_FALLBACK_PAIRS_EN : MEMORY_FALLBACK_PAIRS;
  const shuffled = shuffle([...source]);
  return shuffled.slice(0, n).map((p, idx) => ({
    id: `p${idx}`, question: p.question, answer: p.answer,
  }));
}

export function pickFallbackLocalizedPairs(n: number): QAPair[] {
  const indices = shuffle(Array.from({ length: MEMORY_FALLBACK_PAIRS.length }, (_, i) => i));
  return indices.slice(0, n).map((sourceIndex, idx) => {
    const ko = MEMORY_FALLBACK_PAIRS[sourceIndex];
    const en = MEMORY_FALLBACK_PAIRS_EN[sourceIndex] ?? MEMORY_FALLBACK_PAIRS_EN[idx % MEMORY_FALLBACK_PAIRS_EN.length];
    return {
      id: `p${idx}`,
      question: ko.question,
      answer: ko.answer,
      questionText: { ko: ko.question, en: en.question },
      answerText: { ko: ko.answer, en: en.answer },
    };
  });
}

export function parseAIPairs(text: string, expected: number): QAPair[] | null {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    const valid = arr.filter((x) =>
      x && typeof x.question === "string" && typeof x.answer === "string"
      && x.question.length > 0 && x.answer.length > 0
    );
    if (valid.length < expected) return null;
    return valid.slice(0, expected).map((p, idx) => ({
      id: `p${idx}`, question: p.question.trim(), answer: p.answer.trim(),
    }));
  } catch {
    return null;
  }
}

function localizedTextFrom(value: unknown): LocalizedText | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.ko !== "string" || typeof record.en !== "string") return null;
  const ko = record.ko.trim();
  const en = record.en.trim();
  return ko && en ? { ko, en } : null;
}

export function parseAIBilingualPairs(text: string, expected: number): QAPair[] | null {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    const valid = arr.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const questionText = localizedTextFrom(record.question);
      const answerText = localizedTextFrom(record.answer);
      if (!questionText || !answerText) return [];
      return [{
        question: questionText.ko,
        answer: answerText.ko,
        questionText,
        answerText,
      }];
    });
    if (valid.length < expected) return null;
    return valid.slice(0, expected).map((pair, idx) => ({
      id: `p${idx}`,
      ...pair,
    }));
  } catch {
    return null;
  }
}
