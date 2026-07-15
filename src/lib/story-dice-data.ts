/**
 * 이야기 주사위 놀이 — 단어 풀과 도우미
 * AI가 단어를 생성하지 못할 때 폴백으로 사용.
 */

import type { LocalizedText } from "@/lib/question-game-i18n";

export const STORY_DICE_FALLBACK = {
  protagonist: [
    "로봇", "탐정", "마법사", "발명가", "외계인", "초등학생", "강아지", "해적",
    "공룡", "요정", "기사", "고양이", "과학자", "우주비행사", "인어공주", "도깨비",
    "거북이", "사자", "원숭이", "유령", "닌자", "공주", "왕자", "거인",
  ],
  place: [
    "학교", "숲", "바다", "우주", "놀이공원", "무인도", "동굴", "미래도시",
    "도서관", "옛날 성", "지하 세계", "구름 위", "사막", "정글", "박물관", "외딴 섬",
    "비밀 기지", "마법 학교", "거대한 나무 위", "타임 터널", "고요한 호수", "용암 화산", "유령의 집", "북극",
  ],
  event: [
    "보물상자", "비밀지도", "열쇠", "타임머신", "마법책", "편지", "버튼", "알 수 없는 소리",
    "수상한 그림자", "이상한 상자", "반짝이는 돌", "사라진 시계", "낡은 일기장", "투명망토", "노래하는 새", "수수께끼의 거울",
    "갑작스러운 폭우", "이상한 발자국", "말하는 인형", "수수께끼 같은 메시지", "신비한 가루", "갑자기 켜진 불빛", "오래된 동전", "큰 그림자",
  ],
} as const;

export const STORY_DICE_FALLBACK_EN = {
  protagonist: [
    "robot", "detective", "wizard", "inventor", "alien", "student", "puppy", "pirate",
    "dinosaur", "fairy", "knight", "cat", "scientist", "astronaut", "mermaid", "dokkaebi",
    "turtle", "lion", "monkey", "ghost", "ninja", "princess", "prince", "giant",
  ],
  place: [
    "school", "forest", "ocean", "space", "amusement park", "deserted island", "cave", "future city",
    "library", "old castle", "underground world", "above the clouds", "desert", "jungle", "museum", "faraway island",
    "secret base", "magic school", "giant tree", "time tunnel", "quiet lake", "lava volcano", "haunted house", "North Pole",
  ],
  event: [
    "treasure chest", "secret map", "key", "time machine", "magic book", "letter", "button", "strange sound",
    "mysterious shadow", "odd box", "glowing stone", "missing clock", "old diary", "invisibility cloak", "singing bird", "mystery mirror",
    "sudden rainstorm", "strange footprints", "talking doll", "mystery message", "sparkling powder", "sudden light", "old coin", "huge shadow",
  ],
} as const;

export type DiceCategory = "protagonist" | "place" | "event";

export interface StoryDiceWords {
  protagonist: string[]; // 8개
  place: string[];
  event: string[];
  emojis?: Record<string, string>; // AI가 단어별로 함께 생성한 이모지 (선택)
  wordText?: Record<string, LocalizedText>;
}

export const STORY_DICE_LABEL: Record<DiceCategory, string> = {
  protagonist: "주인공",
  place: "장소",
  event: "사건/물건",
};

export const STORY_DICE_EMOJI: Record<DiceCategory, string> = {
  protagonist: "🦸",
  place: "🗺️",
  event: "✨",
};

export const STORY_DICE_COLOR: Record<DiceCategory, string> = {
  protagonist: "#EF4444",
  place: "#10B981",
  event: "#8B5CF6",
};

/** 폴백 단어 풀에서 카테고리당 N개 랜덤 선택 (중복 없음) */
export function pickFallbackWords(n = 8, locale = "ko"): StoryDiceWords {
  const source = locale === "en" ? STORY_DICE_FALLBACK_EN : STORY_DICE_FALLBACK;
  const pick = (arr: readonly string[]) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };
  return {
    protagonist: pick(source.protagonist),
    place: pick(source.place),
    event: pick(source.event),
  };
}

export function pickFallbackBilingualWords(n = 8): StoryDiceWords {
  const pickIndices = (length: number) => {
    const copy = Array.from({ length }, (_, i) => i);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };
  const wordText: Record<string, LocalizedText> = {};
  const build = (category: DiceCategory) => {
    const koSource = STORY_DICE_FALLBACK[category];
    const enSource = STORY_DICE_FALLBACK_EN[category];
    return pickIndices(koSource.length).map((index) => {
      const ko = koSource[index];
      const en = enSource[index] ?? enSource[index % enSource.length];
      wordText[ko] = { ko, en };
      return ko;
    });
  };
  return {
    protagonist: build("protagonist"),
    place: build("place"),
    event: build("event"),
    wordText,
  };
}

/** AI 응답 파싱: JSON 또는 텍스트 fallback */
export function parseAIWords(text: string): StoryDiceWords | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const valid = (v: unknown): v is string[] =>
      Array.isArray(v) && v.length >= 6 && v.every((s) => typeof s === "string");
    if (!valid(obj.protagonist) || !valid(obj.place) || !valid(obj.event)) return null;
    const words: StoryDiceWords = {
      protagonist: obj.protagonist.slice(0, 8),
      place: obj.place.slice(0, 8),
      event: obj.event.slice(0, 8),
    };
    if (obj.emojis && typeof obj.emojis === "object" && !Array.isArray(obj.emojis)) {
      const em: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj.emojis)) {
        if (typeof v === "string" && v.trim()) em[k.trim()] = v.trim();
      }
      if (Object.keys(em).length > 0) words.emojis = em;
    }
    return words;
  } catch {
    return null;
  }
}

function parseLocalizedWord(value: unknown): LocalizedText | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.ko !== "string" || typeof record.en !== "string") return null;
  const ko = record.ko.trim();
  const en = record.en.trim();
  return ko && en ? { ko, en } : null;
}

export function parseAIBilingualWords(text: string): StoryDiceWords | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const wordText: Record<string, LocalizedText> = {};
    const readCategory = (category: DiceCategory): string[] | null => {
      const values = obj[category];
      if (!Array.isArray(values) || values.length < 6) return null;
      const keys: string[] = [];
      for (const value of values.slice(0, 8)) {
        const localized = parseLocalizedWord(value);
        if (!localized) return null;
        wordText[localized.ko] = localized;
        keys.push(localized.ko);
      }
      return keys;
    };
    const protagonist = readCategory("protagonist");
    const place = readCategory("place");
    const event = readCategory("event");
    if (!protagonist || !place || !event) return null;
    const words: StoryDiceWords = { protagonist, place, event, wordText };
    if (obj.emojis && typeof obj.emojis === "object" && !Array.isArray(obj.emojis)) {
      const em: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj.emojis)) {
        if (typeof v === "string" && v.trim()) em[k.trim()] = v.trim();
      }
      if (Object.keys(em).length > 0) words.emojis = em;
    }
    return words;
  } catch {
    return null;
  }
}

export function getStoryDiceWordText(words: StoryDiceWords | null | undefined, word: string, locale: string) {
  if (locale !== "en") return word;
  return words?.wordText?.[word]?.en ?? word;
}

/** 단어 → 이모지 매핑 (폴백 풀 단어 전체를 커버) */
export const STORY_DICE_WORD_EMOJI: Record<string, string> = {
  // 주인공
  "로봇": "🤖", "탐정": "🕵️", "마법사": "🧙", "발명가": "👨‍🔬", "외계인": "👽",
  "초등학생": "🧒", "강아지": "🐶", "해적": "🏴‍☠️", "공룡": "🦕", "요정": "🧚",
  "기사": "🛡️", "고양이": "🐱", "과학자": "🔬", "우주비행사": "👨‍🚀", "인어공주": "🧜‍♀️",
  "도깨비": "👹", "거북이": "🐢", "사자": "🦁", "원숭이": "🐵", "유령": "👻",
  "닌자": "🥷", "공주": "👸", "왕자": "🤴", "거인": "🗿",
  // 장소
  "학교": "🏫", "숲": "🌳", "바다": "🌊", "우주": "🌌", "놀이공원": "🎡",
  "무인도": "🏝️", "동굴": "🕳️", "미래도시": "🌆", "도서관": "📚", "옛날 성": "🏰",
  "지하 세계": "🌑", "구름 위": "☁️", "사막": "🏜️", "정글": "🌴", "박물관": "🏛️",
  "외딴 섬": "🏖️", "비밀 기지": "🛰️", "마법 학교": "🪄", "거대한 나무 위": "🌲",
  "타임 터널": "🌀", "고요한 호수": "🏞️", "용암 화산": "🌋", "유령의 집": "🏚️", "북극": "❄️",
  // 사건/물건
  "보물상자": "💰", "비밀지도": "🗺️", "열쇠": "🔑", "타임머신": "⏳", "마법책": "📖",
  "편지": "✉️", "버튼": "🔘", "알 수 없는 소리": "🔊", "수상한 그림자": "👤", "이상한 상자": "📦",
  "반짝이는 돌": "💎", "사라진 시계": "⏰", "낡은 일기장": "📔", "투명망토": "🧥", "노래하는 새": "🐦",
  "수수께끼의 거울": "🪞", "갑작스러운 폭우": "🌧️", "이상한 발자국": "👣", "말하는 인형": "🪆",
  "수수께끼 같은 메시지": "💬", "신비한 가루": "✨", "갑자기 켜진 불빛": "💡", "오래된 동전": "🪙", "큰 그림자": "👥",
};

/** 카테고리별 이모지 풀 — 매핑되지 않은 AI 단어를 단어마다 다르게 분산시키기 위함 */
export const STORY_DICE_EMOJI_POOL: Record<DiceCategory, string[]> = {
  protagonist: ["🦸", "🧙", "🧚", "🤖", "🐉", "🦊", "🦄", "🧛", "🧜", "🧞", "👻", "🐲", "🦅", "🐺", "🦁", "🐯", "🐱", "🐶", "👽", "🧟"],
  place: ["🗺️", "🏞️", "🏔️", "🏖️", "🌋", "🏰", "🌃", "🏝️", "🏟️", "⛩️", "🌉", "🏕️", "🗼", "🏜️", "🌅", "🏛️", "🌲", "🏚️", "🌌", "🌑"],
  event: ["✨", "🎁", "🔮", "💥", "🎆", "🪄", "🧩", "📜", "🎭", "🕯️", "🎯", "💫", "🧨", "🎟️", "🪅", "🔔", "💎", "🗝️", "📦", "🪞"],
};

/** 문자열 → 안정적인 해시(같은 단어는 항상 같은 값) */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 단어에 어울리는 이모지를 반환한다.
 * 1) AI가 준 이모지 → 2) 정확 매칭 → 3) 부분 매칭(수식어 대응)
 * → 4) 카테고리 이모지 풀에서 단어 해시로 선택(같은 카테고리 안에서도 단어마다 다름)
 */
export function getWordEmoji(
  word: string,
  category: DiceCategory,
  dynamicEmojis?: Record<string, string>,
): string {
  const trimmed = word.trim();
  if (dynamicEmojis && dynamicEmojis[trimmed]) return dynamicEmojis[trimmed];
  if (STORY_DICE_WORD_EMOJI[trimmed]) return STORY_DICE_WORD_EMOJI[trimmed];
  for (const [key, emoji] of Object.entries(STORY_DICE_WORD_EMOJI)) {
    if (trimmed.includes(key)) return emoji;
  }
  const pool = STORY_DICE_EMOJI_POOL[category];
  return pool[hashString(trimmed) % pool.length];
}
