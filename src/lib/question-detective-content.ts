/**
 * "질문 탐정단! 탐구의 열쇠를 찾아서" — 질문 유형 학습 콘텐츠.
 *
 * 근거 자료: 교사 제작 개념 기반 탐구 학습 가이드
 * (슬라이드 「질문 탐정단」 + 문서 「사실적-개념적-논쟁적 질문을 만드는 방법」).
 * 열린·닫힌 질문과 사실적→개념적→논쟁적 질문 체계는 교육부
 * 「질문기반 탐구수업」·「학생 질문 중심의 교과 수업 모델」과 동일한 틀.
 *
 * 학습 콘텐츠는 현재 로케일에 맞춰 한국어/영어를 선택한다.
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
    tagline: "기억, 관찰, 조사, 계산, 절차로 정보를 확인하는 질문",
    definition:
      "기억한 내용이나 관찰한 결과, 자료 조사, 계산 또는 정해진 절차로 확인할 수 있는 정보를 묻는 질문이에요. 무엇을 확인해야 하는지가 중심이며, 답의 범위가 한 가지인지 여러 가지인지는 닫힌 질문과 열린 질문을 가르는 별도 기준이에요.",
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
  /** 답할 때 필요한 사고와 근거 */
  thinkingGuide: string;
  /** 탐구에서의 목적 */
  purpose: string;
  /** 예시 (주제: 환경) */
  example: string;
}

export const QUESTION_TRIO_TABLE: QuestionTrioRow[] = [
  {
    typeKey: "factual",
    thinkingGuide: "자료에 제시된 절차를 찾아 순서대로 확인하기",
    purpose: "지식 쌓기 (재료 준비)",
    example: "자료에 제시된 쓰레기 분리배출 절차는 어떻게 되나요?",
  },
  {
    typeKey: "conceptual",
    thinkingGuide: "여러 사실을 연결해 관계와 영향을 설명하기",
    purpose: "이해 넓히기 (연결하기)",
    example: "쓰레기 분리배출은 환경에 어떻게 영향을 주나요?",
  },
  {
    typeKey: "controversial",
    thinkingGuide: "가치와 책임을 따져 타당한 근거로 판단하기",
    purpose: "판단하기 (선택하기)",
    example: "플라스틱 쓰레기를 줄일 책임을 개인과 기업에 어떻게 나누는 것이 바람직할까요?",
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

interface AnswerRangeGuide {
  closed: { title: string; definition: string; example: string };
  open: { title: string; definition: string; example: string };
}

interface ClassificationAxis {
  key: string;
  title: string;
  description: string;
}

export interface QuestionDetectiveContent {
  answerRangeGuide: AnswerRangeGuide;
  classificationAxes: readonly ClassificationAxis[];
  wordHint: string;
  typeFormulaGuide: QuestionTypeFormulaGuide[];
  trioTable: QuestionTrioRow[];
  inquirySteps: InquiryStep[];
  checks: QuestionLearningCheck[];
  cover: {
    eyebrow: string;
    title: string;
    description: string;
    badge: string;
  };
  whyQuestions: {
    eyebrow: string;
    title: string;
    description: string;
    aiStatement: string;
    humanStatement: string;
    strengths: string[];
  };
  twoAxes: {
    eyebrow: string;
    title: string;
    axisLabel: string;
    closedLabel: string;
    openLabel: string;
    factualShort: string;
    conceptualShort: string;
    controversialShort: string;
  };
  openClosed: {
    eyebrow: string;
    title: string;
    description: string;
    compare: string;
  };
  inquiryDepth: {
    eyebrow: string;
    title: string;
    description: string;
    descriptions: Record<Cognitive, string>;
  };
  factualDefinition: {
    action: string;
    eyebrow: string;
    title: string;
    exampleLabel: string;
  };
  factualFormulas: {
    eyebrow: string;
    title: string;
    formulaLabel: string;
    exampleLabel: string;
  };
  conceptualDefinition: {
    factOne: string;
    factTwo: string;
    relation: string;
    eyebrow: string;
    title: string;
  };
  conceptualFormulas: {
    eyebrow: string;
    title: string;
  };
  controversialDefinition: {
    valueChoice: string;
    responsibilityImpact: string;
    eyebrow: string;
    title: string;
    note: string;
  };
  controversialFormulas: {
    eyebrow: string;
    title: string;
    judgmentLabel: string;
  };
  comparison: {
    eyebrow: string;
    title: string;
    typeHeader: string;
    thinkingHeader: string;
    purposeHeader: string;
    exampleHeader: string;
  };
  check: {
    eyebrow: string;
    title: string;
    correct: string;
    answerPrefix: string;
    answerSuffix: string;
  };
  synthesis: {
    eyebrow: string;
    title: string;
    description: string;
    finalPrompt: string;
  };
}

const QUESTION_DETECTIVE_KO: QuestionDetectiveContent = {
  answerRangeGuide: QUESTION_ANSWER_RANGE_GUIDE,
  classificationAxes: QUESTION_CLASSIFICATION_AXES,
  wordHint: QUESTION_WORD_HINT,
  typeFormulaGuide: QUESTION_TYPE_FORMULA_GUIDE,
  trioTable: QUESTION_TRIO_TABLE,
  inquirySteps: INQUIRY_STEPS,
  checks: QUESTION_LEARNING_CHECKS,
  cover: {
    eyebrow: "탐구의 열쇠를 찾아서",
    title: "질문 탐정단",
    description: "사실을 찾고, 관계를 연결하고, 근거 있는 선택을 만드는 질문의 힘을 발견해 봐요.",
    badge: "무엇을 물을지 정하는 힘",
  },
  whyQuestions: {
    eyebrow: "질문의 힘",
    title: "답을 찾는 시대에도 질문은 사람이 정해요",
    description: "빠른 답보다 먼저 필요한 것은 무엇을 알아야 하는지 정하는 일이에요.",
    aiStatement: "인공지능은 답을 빠르게 찾을 수 있어요.",
    humanStatement: "하지만 어떤 답이 필요한지, 무엇을 더 살펴봐야 하는지는 질문하는 사람이 정해요.",
    strengths: ["모르는 것을 정확히 발견해요", "흩어진 사실의 관계를 찾아요", "근거를 비교해 더 나은 선택을 해요"],
  },
  twoAxes: {
    eyebrow: "분류의 출발점",
    title: "질문에는 두 개의 분류 기준이 있어요",
    axisLabel: "기준",
    closedLabel: "닫힌 질문",
    openLabel: "열린 질문",
    factualShort: "사실적",
    conceptualShort: "개념적",
    controversialShort: "논쟁적",
  },
  openClosed: {
    eyebrow: "답의 범위",
    title: "닫힌 질문은 확인하고 열린 질문은 생각을 넓혀요",
    description: "같은 광합성 주제도 답의 범위에 따라 질문이 달라져요.",
    compare: "대조",
  },
  inquiryDepth: {
    eyebrow: "생각의 목적과 깊이",
    title: "탐구는 사실에서 관계와 판단으로 깊어져요",
    description: "세 질문은 우열이 아니라 서로 이어지는 탐구의 단계예요.",
    descriptions: {
      factual: "확인할 정보를 모아요",
      conceptual: "사실의 관계를 설명해요",
      controversial: "가치와 근거를 판단해요",
    },
  },
  factualDefinition: {
    action: "정확하게 확인하기",
    eyebrow: "첫 번째 질문 열쇠",
    title: "확인 가능한 정보를 정확하게 찾아요",
    exampleLabel: "예시",
  },
  factualFormulas: {
    eyebrow: "질문 만들기 공식",
    title: "{label}은 대상, 때와 곳, 수량과 방법을 물어요",
    formulaLabel: "공식",
    exampleLabel: "예시",
  },
  conceptualDefinition: {
    factOne: "사실 하나",
    factTwo: "사실 둘",
    relation: "관계와\n원리",
    eyebrow: "두 번째 질문 열쇠",
    title: "사실을 연결해 원리를 찾아요",
  },
  conceptualFormulas: {
    eyebrow: "질문 만들기 공식",
    title: "{label}은 이유, 비교, 의미와 영향을 물어요",
  },
  controversialDefinition: {
    valueChoice: "가치와 선택",
    responsibilityImpact: "책임과 영향",
    eyebrow: "세 번째 질문 열쇠",
    title: "충돌하는 가치를 근거로 판단해요",
    note: "단순히 좋아하는 것을 고르는 질문과 달라요. 여러 관점을 살피고 타당한 근거로 선택해야 해요.",
  },
  controversialFormulas: {
    eyebrow: "질문 만들기 공식",
    title: "{label}은 선택, 공정함, 책임과 대안을 물어요",
    judgmentLabel: "판단",
  },
  comparison: {
    eyebrow: "한눈에 비교하기",
    title: "같은 환경 주제도 세 깊이로 물을 수 있어요",
    typeHeader: "질문 유형",
    thinkingHeader: "답에 필요한 사고와 근거",
    purposeHeader: "탐구 목적",
    exampleHeader: "환경 주제 예시",
  },
  check: {
    eyebrow: "즉석 확인",
    title: "어떤 질문인지 직접 찾아보세요",
    correct: "정답이에요!",
    answerPrefix: "이 질문은 ",
    answerSuffix: "이에요.",
  },
  synthesis: {
    eyebrow: "탐구를 시작할 시간",
    title: "사실을 모으고 연결한 뒤 근거 있는 의견을 만들어요",
    description: "좋은 탐구는 하나의 멋진 질문에서 시작해요.",
    finalPrompt: "이제 질문연습에서 나만의 질문을 직접 만들어 보세요.",
  },
};

const QUESTION_DETECTIVE_EN: QuestionDetectiveContent = {
  ...QUESTION_DETECTIVE_KO,
  answerRangeGuide: {
    closed: {
      title: "Closed question",
      definition: "A question you can answer by finding one fixed piece of information.",
      example: "What gas do plants need for photosynthesis?",
    },
    open: {
      title: "Open question",
      definition: "A question that can have different answers when you connect ideas and reasons.",
      example: "How might photosynthesis affect other living things in an ecosystem?",
    },
  },
  classificationAxes: [
    { key: "answerRange", title: "Answer range", description: "Sort questions into closed and open questions." },
    { key: "thinkingPurpose", title: "Thinking purpose and depth", description: "Sort questions into factual, conceptual, and debatable questions." },
  ],
  wordHint: "Words like why and how are clues, but they are not enough. Decide the type by looking at the thinking and evidence needed to answer.",
  typeFormulaGuide: [
    {
      typeKey: "factual",
      tagline: "Questions that check information through memory, observation, research, calculation, or steps",
      definition: "Factual questions ask for information that can be checked through memory, observation, research, calculation, or a known procedure. The focus is what information must be confirmed.",
      formulas: [
        { icon: "1", title: "Ask about people or things", words: "who, what, which thing, name", pattern: "Who is ...? / What is the name of ...?", examples: ["Who founded Joseon?", "What is the name of the object the main character values most?"] },
        { icon: "2", title: "Ask about time or place", words: "when, where, place, setting, period", pattern: "When did ... happen? / Where is ... located?", examples: ["When did the Imjin War begin?", "What is the name of the mountain where Seokguram is located?"] },
        { icon: "3", title: "Ask about amount or method", words: "how many, how much, method, procedure", pattern: "How many ... are there? / How does ... work?", examples: ["How many nautical miles from the baseline does a country's territorial sea usually extend?", "What gas do plants need for photosynthesis?"] },
      ],
    },
    {
      typeKey: "conceptual",
      tagline: "Questions that connect knowledge to find principles",
      definition: "Conceptual questions are not answered by one copied word. You connect facts and explain reasons, relationships, meanings, or effects.",
      formulas: [
        { icon: "1", title: "Dig into reasons and causes", words: "why, because, cause, reason", pattern: "Why is ... necessary? / What caused ...?", examples: ["Why should we sort our waste?", "Why do plants need sunlight to grow?"] },
        { icon: "2", title: "Explore relationships and comparisons", words: "difference, similarity, relationship, effect", pattern: "How are ... and ... different? / How does ... affect ...?", examples: ["How was the Joseon status system different from democracy today?", "How are producers and consumers connected in an ecosystem?"] },
        { icon: "3", title: "Expand meaning and impact", words: "meaning, role, impact, if ... then", pattern: "What meaning does ... have for us? / What would happen if ... disappeared?", examples: ["What role do genre paintings play in understanding ordinary people's lives?", "What would happen to an ecosystem if all microbes disappeared?"] },
      ],
    },
    {
      typeKey: "controversial",
      tagline: "Questions that invite discussion and choice",
      definition: "Debatable questions do not have one fixed answer. You compare values, choices, responsibilities, and alternatives from more than one point of view.",
      formulas: [
        { icon: "1", title: "Lead choice or pro/con thinking", words: "agree, disagree, should, allow, ban", pattern: "Do you agree or disagree with ...? / Should ... be limited by law?", examples: ["Should smartphones be completely banned on the school playground?", "Should AI-generated paintings be accepted as artworks?"] },
        { icon: "2", title: "Ask about value and fairness", words: "fair, right, just, desirable, equal", pattern: "Can ... be called fair? / Is ... a good solution?", examples: ["Is it fair to limit personal freedom for everyone's safety?", "Is giving cleaning duty a good solution when a class rule is broken?"] },
        { icon: "3", title: "Examine responsibility and alternatives", words: "responsibility, priority, important value", pattern: "Which value should society prioritize, ... or ...?", examples: ["Should humanity prioritize environmental protection or technology development?", "Who has more responsibility for climate change damage, developing countries or developed countries?"] },
      ],
    },
  ],
  trioTable: [
    { typeKey: "factual", thinkingGuide: "Find the procedure in the material and check it step by step", purpose: "Build knowledge", example: "What are the waste sorting steps shown in the material?" },
    { typeKey: "conceptual", thinkingGuide: "Connect facts to explain relationships and effects", purpose: "Deepen understanding", example: "How does sorting waste affect the environment?" },
    { typeKey: "controversial", thinkingGuide: "Judge with reasons by considering values and responsibility", purpose: "Make a reasoned choice", example: "How should responsibility for reducing plastic waste be shared between individuals and companies?" },
  ],
  inquirySteps: [
    { step: 1, title: "Collect facts", description: "Gather accurate information about the topic you wonder about." },
    { step: 2, title: "Find connections", description: "Look for concepts that connect the information." },
    { step: 3, title: "Build your opinion", description: "Think from different viewpoints and organize your own idea." },
  ],
  checks: [
    { id: "check-factual", prompt: "How many students are present in our class today?", answer: "factual", explanation: "This asks for fixed information that can be counted or observed, so it is a factual question." },
    { id: "check-conceptual", prompt: "How might a shrinking forest affect the local climate?", answer: "conceptual", explanation: "This asks you to connect facts and explain the relationship between forests and climate, so it is a conceptual question." },
    { id: "check-controversial", prompt: "Should the law limit single-use products to protect the environment?", answer: "controversial", explanation: "This asks you to judge using values such as environmental protection and freedom of choice, so it is a debatable question." },
  ],
  cover: {
    eyebrow: "Find the key to inquiry",
    title: "Question Detectives",
    description: "Discover the power of questions that find facts, connect relationships, and build reasoned choices.",
    badge: "The power to decide what to ask",
  },
  whyQuestions: {
    eyebrow: "The power of questions",
    title: "Even in an age of quick answers, people decide the questions",
    description: "Before a fast answer, we first need to decide what we need to know.",
    aiStatement: "AI can find answers quickly.",
    humanStatement: "But people decide which answers are needed and what should be examined next.",
    strengths: ["Find exactly what you do not know", "Discover relationships among scattered facts", "Compare reasons and make better choices"],
  },
  twoAxes: {
    eyebrow: "Starting the classification",
    title: "Questions have two classification axes",
    axisLabel: "Axis",
    closedLabel: "Closed question",
    openLabel: "Open question",
    factualShort: "Factual",
    conceptualShort: "Conceptual",
    controversialShort: "Debatable",
  },
  openClosed: {
    eyebrow: "Answer range",
    title: "Closed questions check; open questions expand thinking",
    description: "The same photosynthesis topic can lead to different questions depending on the answer range.",
    compare: "Compare",
  },
  inquiryDepth: {
    eyebrow: "Thinking purpose and depth",
    title: "Inquiry deepens from facts to relationships and judgment",
    description: "The three question types are not ranked; they are connected steps in inquiry.",
    descriptions: {
      factual: "Gather information to check",
      conceptual: "Explain relationships among facts",
      controversial: "Judge values and reasons",
    },
  },
  factualDefinition: {
    action: "Check accurately",
    eyebrow: "First question key",
    title: "Find checkable information accurately",
    exampleLabel: "Example",
  },
  factualFormulas: {
    eyebrow: "Question-making formula",
    title: "{label} ask about objects, time, place, amount, and method",
    formulaLabel: "Formula",
    exampleLabel: "Example",
  },
  conceptualDefinition: {
    factOne: "Fact one",
    factTwo: "Fact two",
    relation: "Relationship\nand principle",
    eyebrow: "Second question key",
    title: "Connect facts to find principles",
  },
  conceptualFormulas: {
    eyebrow: "Question-making formula",
    title: "{label} ask about reasons, comparisons, meanings, and effects",
  },
  controversialDefinition: {
    valueChoice: "Values and choices",
    responsibilityImpact: "Responsibility and impact",
    eyebrow: "Third question key",
    title: "Judge conflicting values with reasons",
    note: "This is different from simply choosing what you like. You need to examine different viewpoints and choose with sound reasons.",
  },
  controversialFormulas: {
    eyebrow: "Question-making formula",
    title: "{label} ask about choice, fairness, responsibility, and alternatives",
    judgmentLabel: "Judgment",
  },
  comparison: {
    eyebrow: "Compare at a glance",
    title: "The same environmental topic can be asked at three depths",
    typeHeader: "Question type",
    thinkingHeader: "Thinking and evidence needed",
    purposeHeader: "Inquiry purpose",
    exampleHeader: "Environmental topic example",
  },
  check: {
    eyebrow: "Quick check",
    title: "Find the question type yourself",
    correct: "Correct!",
    answerPrefix: "This question is ",
    answerSuffix: ".",
  },
  synthesis: {
    eyebrow: "Time to start inquiry",
    title: "Gather facts, connect them, and build a reasoned opinion",
    description: "Good inquiry begins with one strong question.",
    finalPrompt: "Now try making your own question in Question Practice.",
  },
};

export function getQuestionDetectiveContent(locale: string): QuestionDetectiveContent {
  return locale === "en" ? QUESTION_DETECTIVE_EN : QUESTION_DETECTIVE_KO;
}
