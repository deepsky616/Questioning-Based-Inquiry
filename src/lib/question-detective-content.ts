/**
 * "질문 탐정단! 탐구의 열쇠를 찾아서" — 질문 유형 학습 콘텐츠.
 *
 * 근거 자료: 교사 제작 개념 기반 탐구 학습 가이드
 * (슬라이드 「질문 탐정단」 + 문서 「사실적-개념적-논쟁적 질문을 만드는 방법」).
 * 열린·닫힌 질문과 사실적→개념적→논쟁적 질문 체계는 교육부
 * 「질문기반 탐구수업」·「학생 질문 중심의 교과 수업 모델」과 동일한 틀.
 *
 * 콘텐츠는 한국어 고정(문항 은행·게임 콘텐츠와 동일 원칙), UI 라벨만 i18n.
 */

import type { Cognitive } from "@/lib/question-practice-data";

/** 질문 만들기 공식 — 쓰는 말·끝맺는 말·예시 */
export interface QuestionFormula {
  icon: string;
  title: string;
  /** 이 공식에서 사용하는 단어들 */
  words: string;
  /** 끝맺는 말 공식 */
  pattern: string;
  examples: string[];
}

/** 유형별 눈높이 정의 + 만들기 공식 3개 */
export interface QuestionTypeFormulaGuide {
  typeKey: Cognitive;
  /** 한 줄 소개 — "3가지 질문 열쇠" 슬라이드용 */
  tagline: string;
  /** 학생 눈높이 정의 */
  definition: string;
  formulas: QuestionFormula[];
}

export interface QuestionLearningCheck {
  id: string;
  prompt: string;
  answer: Cognitive;
  explanation: string;
}

export const QUESTION_ANSWER_RANGE_GUIDE = {
  closed: {
    title: "닫힌 질문",
    definition: "정해진 정보에서 한 가지 답을 찾아 확인할 수 있는 질문이에요.",
    example: "광합성에 필요한 기체는 무엇인가요?",
  },
  open: {
    title: "열린 질문",
    definition: "여러 생각과 근거를 연결해 다양한 답을 만들 수 있는 질문이에요.",
    example: "광합성이 생태계의 다른 생물에게 어떤 영향을 줄까요?",
  },
} as const;

export const QUESTION_CLASSIFICATION_AXES = [
  { key: "answerRange", title: "답의 범위", description: "닫힌 질문과 열린 질문을 구분해요." },
  {
    key: "thinkingPurpose",
    title: "생각의 목적과 깊이",
    description: "사실적, 개념적, 논쟁적 질문을 구분해요.",
  },
] as const;

export const QUESTION_WORD_HINT =
  "왜, 어떻게 같은 질문 낱말은 단서일 뿐이에요. 답할 때 필요한 사고와 근거를 보고 질문 유형을 판단해요.";

export const QUESTION_TYPE_FORMULA_GUIDE: QuestionTypeFormulaGuide[] = [
  {
    typeKey: "factual",
    tagline: "정답이 딱 정해진 기초가 되는 질문",
    definition:
      "기억한 내용이나 관찰한 결과, 자료 조사, 계산 또는 정해진 절차로 확인할 수 있는 정보를 묻는 질문이에요. 답이 한 가지로 정해져 있어 누구나 같은 방법으로 확인할 수 있어요.",
    formulas: [
      {
        icon: "❶",
        title: "'대상과 인물'을 묻는 말 (누가, 무엇)",
        words: "누구, 무엇, 어떤 것, 이름",
        pattern: "~은/는 누구인가요? / ~의 이름은 무엇인가요?",
        examples: [
          "조선을 건국한 왕은 누구인가요?",
          "글 속에서 주인공이 가장 아끼는 물건의 이름은 무엇인가요?",
        ],
      },
      {
        icon: "❷",
        title: "'시간과 공간'을 묻는 말 (언제, 어디서)",
        words: "언제, 어디, 어느 곳, 배경, 시대",
        pattern: "~이 일어난 때는 언제인가요? / ~이 있는 곳은 어디인가요?",
        examples: [
          "임진왜란이 일어난 해는 언제인가요?",
          "경주에서 석굴암이 있는 산의 이름은 무엇인가요?",
        ],
      },
      {
        icon: "❸",
        title: "'수량과 방법'을 묻는 말 (몇, 어떻게)",
        words: "몇 개, 몇 명, 어떤 방법(자료, 관찰, 조사 또는 정해진 절차로 확인할 수 있는 방법)",
        pattern: "~은 모두 몇 개인가요? / ~는 어떻게 작동하나요?",
        examples: [
          "우리나라 영해는 기준선으로부터 몇 해리까지인가요?",
          "식물이 광합성을 할 때 필요한 기체는 무엇인가요?",
        ],
      },
    ],
  },
  {
    typeKey: "conceptual",
    tagline: "지식을 연결하여 원리를 찾는 질문",
    definition:
      "책에 정답이 딱 한 단어로 적혀 있지 않아요. 머릿속으로 \"왜 그럴까?\", \"어떤 관계가 있을까?\" 하고 여러 사실을 선으로 연결해서 깨달은 원리를 설명해야 하는 질문이에요. 지식을 튼튼하게 엮어주는 생각의 열쇠랍니다.",
    formulas: [
      {
        icon: "❶",
        title: "'이유와 원인'을 파헤치는 말 (왜)",
        words: "왜, 어째서, 무엇 때문에, 까닭, 원인",
        pattern: "~은 왜 꼭 필요할까요? / ~이 일어난 원인은 무엇 때문일까요?",
        examples: [
          "우리는 왜 쓰레기를 분리배출해야 할까요?",
          "식물이 자라는 데 햇빛이 꼭 필요한 까닭은 무엇인가요?",
        ],
      },
      {
        icon: "❷",
        title: "'관계와 비교'를 탐구하는 말 (어떻게 다를까)",
        words: "차이점, 공통점, 어떤 관계, 어떻게 다를까",
        pattern: "~와/과 ~은 어떤 차이가 있나요? / ~은 ~에 어떤 영향을 주나요?",
        examples: [
          "조선 시대의 신분 제도와 오늘날의 민주주의 사회는 어떤 차이가 있나요?",
          "생태계에서 생산자와 소비자는 서로 어떤 관계를 맺고 있나요?",
        ],
      },
      {
        icon: "❸",
        title: "'의미와 영향'을 넓히는 말 (무슨 의미일까)",
        words: "어떤 영향, 무슨 의미, 어떤 역할, 만약 ~라면",
        pattern: "~은 우리에게 어떤 의미를 주나요? / 만약 ~이 없다면 어떻게 될까요?",
        examples: [
          "김홍도의 풍속화는 당시 서민들의 삶을 이해하는 데 어떤 역할을 하나요?",
          "만약 우리 주변에 미생물이 모두 사라진다면 생태계에는 어떤 일이 벌어질까요?",
        ],
      },
    ],
  },
  {
    typeKey: "controversial",
    tagline: "생각을 나누고 선택하는 질문",
    definition:
      "교과서나 책에 딱 하나의 정답이 정해져 있지 않은 질문이에요. 단순히 좋아하는 것을 고르는 질문이 아니라 어떤 가치와 선택이 더 중요한지, 누구에게 어떤 책임이 있는지를 여러 관점에서 따져야 해요. 서로의 타당한 근거를 듣고 생각을 나누며 판단하는 토론 질문이에요.",
    formulas: [
      {
        icon: "❶",
        title: "'선택과 찬반'을 이끄는 말 (과연 ~해야 할까)",
        words: "찬성, 반대, ~해야 할까, 허용해야 할까, 금지해야 할까",
        pattern: "~하는 것에 대해 찬성하나요, 반대하나요? / ~을 법으로 제한해야 할까요?",
        examples: [
          "학교 운동장에서 스마트폰을 사용하는 것을 완전히 금지해야 할까요?",
          "인공지능(AI)이 그린 그림을 예술 작품으로 인정해야 할까요?",
        ],
      },
      {
        icon: "❷",
        title: "'가치와 공정함'을 묻는 말 (정당한가, 옳은가)",
        words: "정당한가, 바람직한가, 공평한가, 정의로운가, 옳은 행동",
        pattern: "~의 행동은 과연 정의롭다고 할 수 있을까요? / ~은 공평한 방법인가요?",
        examples: [
          "모두의 안전을 위해 개인의 자유를 제한하는 것은 과연 정당한가요?",
          "학급 규칙을 어긴 친구에게 청소 벌을 주는 것은 바람직한 해결책인가요?",
        ],
      },
      {
        icon: "❸",
        title: "'책임과 대안'을 따지는 말 (누구의 책임일까)",
        words: "누구의 책임, 어떤 가치가 더 중요, 우선해야 할 것",
        pattern: "~와/과 ~ 중 우리 사회가 더 우선해야 할 가치는 무엇일까요?",
        examples: [
          "환경 보존과 과학 기술 개발 중 우리 인류가 더 우선해야 할 가치는 무엇일까요?",
          "기후 변화의 피해는 개발도상국과 선진국 중 누구에게 더 큰 책임이 있을까요?",
        ],
      },
    ],
  },
];

/** 질문 3형제 비교표 — 유형 라벨은 표시 시점에 i18n으로 해석한다 */
export interface QuestionTrioRow {
  typeKey: Cognitive;
  /** 질문의 도구가 되는 말 */
  tools: string;
  /** 탐구에서의 목적 */
  purpose: string;
  /** 예시 (주제: 환경) */
  example: string;
}

export const QUESTION_TRIO_TABLE: QuestionTrioRow[] = [
  {
    typeKey: "factual",
    tools: "누가, 언제, 어디서, 무엇",
    purpose: "지식 쌓기 (재료 준비)",
    example: "쓰레기 분리배출 방법은 무엇인가요?",
  },
  {
    typeKey: "conceptual",
    tools: "어떻게, 왜, 어떤 관계",
    purpose: "이해 넓히기 (연결하기)",
    example: "쓰레기 문제는 지구에 어떤 영향을 주나요?",
  },
  {
    typeKey: "controversial",
    tools: "~해야 할까?, 당신의 생각은?",
    purpose: "판단하기 (선택하기)",
    example: "플라스틱 사용을 완전히 금지해야 할까요?",
  },
];

/** 멋진 탐구자가 되는 3단계 */
export interface InquiryStep {
  step: number;
  title: string;
  description: string;
}

export const INQUIRY_STEPS: InquiryStep[] = [
  { step: 1, title: "사실 수집!", description: "궁금한 주제에 대해 정확한 정보를 모아요." },
  { step: 2, title: "연결 고리 찾기!", description: "정보들이 어떻게 연결되는지 개념을 찾아봐요." },
  { step: 3, title: "나만의 의견!", description: "다양한 관점에서 생각하고 나의 생각을 정리해요." },
];

export const QUESTION_LEARNING_CHECKS: QuestionLearningCheck[] = [
  {
    id: "check-factual",
    prompt: "우리 반에서 오늘 출석한 학생은 몇 명인가요?",
    answer: "factual",
    explanation: "관찰하거나 세어 확인할 수 있는 정해진 정보를 묻기 때문에 사실적 질문이에요.",
  },
  {
    id: "check-conceptual",
    prompt: "숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?",
    answer: "conceptual",
    explanation: "여러 사실을 연결해 숲과 기후의 관계를 설명해야 하므로 개념적 질문이에요.",
  },
  {
    id: "check-controversial",
    prompt: "환경 보호를 위해 일회용품 사용을 법으로 제한해야 할까요?",
    answer: "controversial",
    explanation: "환경 보호와 선택의 자유라는 가치를 근거로 판단해야 하므로 논쟁적 질문이에요.",
  },
];
