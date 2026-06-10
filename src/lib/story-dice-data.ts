/**
 * 이야기 주사위 놀이 — 단어 풀과 도우미
 * AI가 단어를 생성하지 못할 때 폴백으로 사용.
 */

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

export type DiceCategory = "protagonist" | "place" | "event";

export interface StoryDiceWords {
  protagonist: string[]; // 8개
  place: string[];
  event: string[];
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
export function pickFallbackWords(n = 8): StoryDiceWords {
  const pick = (arr: readonly string[]) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };
  return {
    protagonist: pick(STORY_DICE_FALLBACK.protagonist),
    place: pick(STORY_DICE_FALLBACK.place),
    event: pick(STORY_DICE_FALLBACK.event),
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
    return {
      protagonist: obj.protagonist.slice(0, 8),
      place: obj.place.slice(0, 8),
      event: obj.event.slice(0, 8),
    };
  } catch {
    return null;
  }
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
  "지하 세계": "🕳️", "구름 위": "☁️", "사막": "🏜️", "정글": "🌴", "박물관": "🏛️",
  "외딴 섬": "🏝️", "비밀 기지": "🛰️", "마법 학교": "🪄", "거대한 나무 위": "🌲",
  "타임 터널": "🌀", "고요한 호수": "🏞️", "용암 화산": "🌋", "유령의 집": "🏚️", "북극": "❄️",
  // 사건/물건
  "보물상자": "💰", "비밀지도": "🗺️", "열쇠": "🔑", "타임머신": "⏳", "마법책": "📖",
  "편지": "✉️", "버튼": "🔘", "알 수 없는 소리": "🔊", "수상한 그림자": "👤", "이상한 상자": "📦",
  "반짝이는 돌": "💎", "사라진 시계": "⏰", "낡은 일기장": "📔", "투명망토": "🧥", "노래하는 새": "🐦",
  "수수께끼의 거울": "🪞", "갑작스러운 폭우": "🌧️", "이상한 발자국": "👣", "말하는 인형": "🪆",
  "수수께끼 같은 메시지": "💬", "신비한 가루": "✨", "갑자기 켜진 불빛": "💡", "오래된 동전": "🪙", "큰 그림자": "👥",
};

/**
 * 단어에 어울리는 이모지를 반환한다.
 * 1) 정확히 매칭 → 2) 부분 매칭(수식어가 붙은 AI 단어 대응) → 3) 카테고리 기본 이모지
 */
export function getWordEmoji(word: string, category: DiceCategory): string {
  const trimmed = word.trim();
  if (STORY_DICE_WORD_EMOJI[trimmed]) return STORY_DICE_WORD_EMOJI[trimmed];
  for (const [key, emoji] of Object.entries(STORY_DICE_WORD_EMOJI)) {
    if (trimmed.includes(key)) return emoji;
  }
  return STORY_DICE_EMOJI[category];
}
