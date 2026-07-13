export interface QuestionTeachingGuideItem {
  id: "twoAxes" | "openClosed" | "factual" | "conceptual" | "controversial" | "comparison";
  title: string;
  objective: string;
  misconception: string;
  prompt: string;
  followUp: string;
  focus: "closed" | "open" | "factual" | "conceptual" | "controversial" | null;
}

export const QUESTION_TEACHING_GUIDE: readonly QuestionTeachingGuideItem[] = [
  {
    id: "twoAxes",
    title: "질문의 두 분류 축",
    objective: "답의 범위와 답에 필요한 사고를 서로 다른 기준으로 분류한다.",
    misconception:
      "사실적 질문은 항상 닫혀 있고 논쟁적 질문은 항상 열려 있다고 생각한다. 질문의 첫 낱말만 보고 유형을 정한다.",
    prompt: "이 질문은 답의 범위와 답에 필요한 사고를 각각 어떻게 분류할 수 있을까요?",
    followUp: "두 기준 가운데 하나만 바꾸려면 질문과 근거가 어떻게 달라져야 할까요?",
    focus: null,
  },
  {
    id: "openClosed",
    title: "열린 질문과 닫힌 질문",
    objective: "받아들일 수 있는 답의 범위를 판단하고 사고의 깊이와 분리한다.",
    misconception:
      "왜, 어떻게가 있으면 모두 열린 질문이라고 생각한다. 닫힌 질문은 언제나 단순하다고 생각한다.",
    prompt: "이 질문의 답은 자료에서 하나로 확인되나요, 여러 근거 있는 답이 가능한가요?",
    followUp: "답이 여러 개라면 아무 답이나 가능한가요? 좋은 답에 필요한 근거는 무엇인가요?",
    focus: null,
  },
  {
    id: "factual",
    title: "사실적 질문",
    objective: "기억, 관찰, 조사, 계산이나 정해진 절차로 확인할 정보를 묻는다.",
    misconception:
      "사실적 질문은 답이 반드시 하나라고 생각한다. 어떻게와 왜가 들어가면 사실적 질문이 아니라고 생각한다.",
    prompt: "이 질문에 답하려면 어떤 자료, 관찰, 계산이나 절차가 필요한가요?",
    followUp: "답을 확인한 사람이 같은 방법으로 다시 확인할 수 있나요?",
    focus: "factual",
  },
  {
    id: "conceptual",
    title: "개념적 질문",
    objective: "여러 사실을 연결해 관계, 원리, 의미와 영향을 설명한다.",
    misconception:
      "왜가 들어간 모든 질문을 개념적 질문으로 분류한다. 근거 없는 느낌이나 의견도 개념적 설명이라고 생각한다.",
    prompt: "따로 알고 있는 어떤 사실들을 연결해야 이 질문에 답할 수 있나요?",
    followUp: "한 사실만 외워서 답할 수 있나요? 어떤 관계를 설명해야 하나요?",
    focus: "conceptual",
  },
  {
    id: "controversial",
    title: "논쟁적 질문",
    objective: "충돌하는 가치, 선택과 책임을 근거로 비교해 판단한다.",
    misconception:
      "사람마다 답이 다르면 모두 논쟁적 질문이라고 생각한다. 토론을 상대를 이기는 활동으로 생각한다.",
    prompt: "이 선택에서 서로 부딪히는 가치와 책임은 무엇인가요?",
    followUp: "반대 입장에서 가장 강한 근거는 무엇이며, 어떤 조건에서 판단이 달라질 수 있나요?",
    focus: "controversial",
  },
  {
    id: "comparison",
    title: "세 유형 비교와 즉석 확인",
    objective: "같은 질문 낱말을 써도 필요한 사고와 근거에 따라 유형이 달라짐을 설명한다.",
    misconception: "대표 낱말 목록을 정답표처럼 외우고 질문 전체가 요구하는 사고를 보지 않는다.",
    prompt: "세 질문이 모두 어떻게로 시작해도 서로 다른 유형인 까닭은 무엇인가요?",
    followUp: "한 질문을 다른 유형으로 바꾸려면 답에 필요한 사고와 근거를 어떻게 바꿔야 하나요?",
    focus: null,
  },
];

export const QUESTION_TEACHING_GUIDE_EN: readonly QuestionTeachingGuideItem[] = [
  {
    id: "twoAxes",
    title: "Two dimensions of question classification",
    objective:
      "Classify the range of acceptable answers and the thinking required to answer as separate dimensions.",
    misconception:
      "Assuming factual questions are always closed and debatable questions are always open. Classifying a question by its first word alone.",
    prompt:
      "How would you classify this question by the range of acceptable answers and by the thinking required to answer it?",
    followUp:
      "If you changed only one of the two dimensions, how would the question and its evidence need to change?",
    focus: null,
  },
  {
    id: "openClosed",
    title: "Open and closed questions",
    objective: "Determine the range of acceptable answers separately from the depth of thinking.",
    misconception:
      "Assuming every question that uses why or how is open. Assuming closed questions are always simple.",
    prompt:
      "Can the answer to this question be confirmed as one answer in the source, or are several evidence-based answers possible?",
    followUp:
      "If several answers are possible, does that mean any answer works? What evidence does a strong answer need?",
    focus: null,
  },
  {
    id: "factual",
    title: "Factual questions",
    objective:
      "Ask for information that can be verified through recall, observation, research, calculation, or a defined procedure.",
    misconception:
      "Assuming a factual question must have only one answer. Assuming a question is not factual if it includes how or why.",
    prompt:
      "What source, observation, calculation, or procedure would you need to answer this question?",
    followUp: "Could someone else verify the answer again using the same method?",
    focus: "factual",
  },
  {
    id: "conceptual",
    title: "Conceptual questions",
    objective: "Connect multiple facts to explain relationships, principles, meaning, and impact.",
    misconception:
      "Assuming every question that includes why is conceptual. Treating unsupported feelings or opinions as conceptual explanations.",
    prompt: "Which separate facts do you need to connect to answer this question?",
    followUp: "Can you answer it by recalling only one fact? What relationship do you need to explain?",
    focus: "conceptual",
  },
  {
    id: "controversial",
    title: "Debatable questions",
    objective:
      "Compare conflicting values, choices, and responsibilities and make an evidence-based judgment.",
    misconception:
      "Assuming any question with different personal answers is debatable. Treating discussion as an activity for defeating the other side.",
    prompt: "What values and responsibilities conflict in this choice?",
    followUp:
      "What is the strongest evidence for the opposing view, and under what conditions might your judgment change?",
    focus: "controversial",
  },
  {
    id: "comparison",
    title: "Comparing the three types and checking understanding",
    objective:
      "Explain why questions can use the same question word yet belong to different types based on the thinking and evidence they require.",
    misconception:
      "Memorizing a list of common question words as an answer key instead of considering the thinking the whole question requires.",
    prompt: "All three questions begin with how. Why do they still belong to different types?",
    followUp:
      "How would you change the thinking and evidence required to turn one question into another type?",
    focus: null,
  },
];

export function questionTeachingGuideForLocale(
  locale: string,
): readonly QuestionTeachingGuideItem[] {
  return locale.toLowerCase().startsWith("en")
    ? QUESTION_TEACHING_GUIDE_EN
    : QUESTION_TEACHING_GUIDE;
}
