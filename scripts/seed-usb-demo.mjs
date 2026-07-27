import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const STUDENT_NAMES = [
  "김질문",
  "이태하",
  "박서준",
  "최하윤",
  "정민준",
  "강서연",
  "조지호",
  "윤지아",
  "장도윤",
  "임수아",
  "한예준",
  "오채원",
  "서시우",
  "신유나",
  "권주원",
  "황예린",
  "안현우",
  "송다은",
  "전우진",
  "홍가은",
  "문준서",
  "양나연",
  "손도현",
  "배지민",
  "백하준",
  "허소율",
  "남건우",
  "고서아",
];

const DEMO = {
  school: "질문초등학교",
  grade: "4",
  className: "1",
  teacherId: "usb-demo-teacher",
  teacherEmail: "usb-demo-teacher@questionlab.invalid",
  unitDesignIds: {
    pastKorean: "usb-demo-unit-design-korean",
    pastSocial: "usb-demo-unit-design-local-community",
    past: "usb-demo-unit-design-water-states",
    pastMath: "usb-demo-unit-design-data",
    today: "usb-demo-unit-design-temperature",
    future: "usb-demo-unit-design-environment",
  },
  sessionIds: {
    pastKorean: "usb-demo-session-past-korean",
    pastSocial: "usb-demo-session-past-social",
    past: "usb-demo-session-past",
    pastMath: "usb-demo-session-past-math",
    today: "usb-demo-session-today",
    future: "usb-demo-session-future",
  },
};

export const DEMO_SESSION_BLUEPRINTS = [
  {
    key: "pastKorean",
    id: DEMO.sessionIds.pastKorean,
    offsetDays: -18,
    subject: "국어",
    topic: "주장과 근거의 적절성 판단하기",
    unitDesignId: DEMO.unitDesignIds.pastKorean,
  },
  {
    key: "pastSocial",
    id: DEMO.sessionIds.pastSocial,
    offsetDays: -12,
    subject: "사회",
    topic: "우리 지역의 문제와 해결 방법",
    unitDesignId: DEMO.unitDesignIds.pastSocial,
  },
  {
    key: "past",
    id: DEMO.sessionIds.past,
    offsetDays: -7,
    subject: "과학",
    topic: "물의 세 가지 상태",
    unitDesignId: DEMO.unitDesignIds.past,
  },
  {
    key: "pastMath",
    id: DEMO.sessionIds.pastMath,
    offsetDays: -3,
    subject: "수학",
    topic: "자료를 표와 그래프로 나타내기",
    unitDesignId: DEMO.unitDesignIds.pastMath,
  },
  {
    key: "today",
    id: DEMO.sessionIds.today,
    offsetDays: 0,
    subject: "과학",
    topic: "온도에 따른 상태 변화",
    unitDesignId: DEMO.unitDesignIds.today,
  },
  {
    key: "future",
    id: DEMO.sessionIds.future,
    offsetDays: 5,
    subject: "사회",
    topic: "환경을 위한 생활 속 선택",
    unitDesignId: DEMO.unitDesignIds.future,
  },
];

const ACTIVITY_SESSION_BLUEPRINTS = DEMO_SESSION_BLUEPRINTS.filter(
  ({ key }) => key !== "future",
);

function loadLocalDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return;
  const envPath = new URL("../.env.local", import.meta.url);
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  const match = contents.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
  if (match?.[1]) process.env.DATABASE_URL = match[1].trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function studentId(number) {
  return `usb-demo-student-${pad(number)}`;
}

function koreanDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function offsetDate(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
}

function inquiryQuestion(type, content, meaning, keywords, thinkingStart) {
  return {
    type,
    content,
    studentGuide: {
      meaning,
      keywords: keywords.map(([term, keywordMeaning]) => ({
        term,
        meaning: keywordMeaning,
      })),
      thinkingStart,
    },
  };
}

function learningGuide({
  explanation,
  lifeConnection,
  keywords,
  sentenceExplanations,
  essentialQuestionGuides,
}) {
  return {
    coreIdea: {
      explanation,
      lifeConnection,
      keywords: keywords.map(([term, keywordMeaning]) => ({
        term,
        meaning: keywordMeaning,
      })),
    },
    coreSentences: sentenceExplanations.map((sentenceExplanation, index) => ({
      index,
      explanation: sentenceExplanation,
    })),
    essentialQuestions: essentialQuestionGuides.map((guide, index) => ({
      index,
      thinkingFocus: guide.thinkingFocus,
      perspectives: guide.perspectives,
    })),
  };
}

export const DEMO_UNIT_DESIGN_BLUEPRINTS = [
  {
    key: "pastKorean",
    id: DEMO.unitDesignIds.pastKorean,
    title: "주장과 근거를 살펴보아요",
    subject: "국어",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "읽기",
    coreIdea: "글쓴이의 주장을 바르게 이해하려면 주장을 뒷받침하는 근거가 알맞고 믿을 만한지 살펴보아야 한다.",
    selectedKeywords: ["주장", "근거", "적절성"],
    coreSentences: [
      "주장은 글쓴이가 다른 사람에게 전하고 싶은 생각이다.",
      "근거가 주장과 알맞게 이어지고 믿을 만할 때 주장의 힘이 커진다.",
    ],
    essentialQuestions: [
      "좋은 근거는 어떤 조건을 갖추어야 할까?",
      "주장과 근거를 살피면 글을 더 바르게 이해할 수 있을까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "글쓴이가 제시한 주장과 근거는 무엇일까?",
        "글에서 직접 확인할 수 있는 주장과 근거를 찾아보는 질문이에요.",
        [["주장", "글쓴이가 전하려는 생각"], ["근거", "주장을 뒷받침하는 까닭이나 자료"]],
        "글에서 생각을 나타낸 문장과 그 까닭을 나타낸 문장을 서로 다른 색으로 표시해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "알맞은 근거는 주장에 어떤 힘을 줄까?",
        "주장과 근거가 어떻게 이어지고 왜 중요한지 관계를 찾는 질문이에요.",
        [["적절성", "내용이나 상황에 알맞은 정도"], ["신뢰", "믿을 수 있다고 생각하는 마음"]],
        "근거가 있을 때와 없을 때 어느 주장이 더 믿음직한지 비교해 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "친구의 경험도 주장을 뒷받침하는 믿을 만한 근거가 될 수 있을까?",
        "경험을 근거로 쓸 수 있는 경우와 어려운 경우를 나누어 판단하는 질문이에요.",
        [["경험", "직접 보고 듣거나 해 본 일"], ["판단", "여러 내용을 살펴보고 생각을 정하는 것"]],
        "경험이 도움이 되는 경우와 다른 자료가 더 필요한 경우를 하나씩 떠올려 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "글을 읽을 때 글쓴이의 생각만 찾는 것이 아니라 그 생각을 받쳐 주는 까닭과 자료도 함께 살펴봐요.",
      lifeConnection: "친구에게 학급 규칙을 바꾸자고 말할 때도 까닭과 예를 들면 내 생각을 더 잘 이해시킬 수 있어요.",
      keywords: [["주장", "다른 사람에게 전하려는 생각"], ["근거", "주장을 받쳐 주는 까닭이나 자료"], ["적절성", "주장과 근거가 알맞게 이어지는 정도"]],
      sentenceExplanations: [
        "주장은 글의 중심이 되는 글쓴이의 생각이에요.",
        "근거가 주장과 잘 이어지고 믿을 만한지 확인해야 해요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "근거가 주장과 이어지는지, 사실을 바탕으로 하는지 살펴보세요.", perspectives: ["주장과의 관계", "자료의 믿음직함"] },
        { thinkingFocus: "근거를 확인하기 전과 확인한 뒤 내 생각이 어떻게 달라지는지 비교해 보세요.", perspectives: ["글쓴이의 생각", "읽는 사람의 판단"] },
      ],
    }),
  },
  {
    key: "pastSocial",
    id: DEMO.unitDesignIds.pastSocial,
    title: "우리 지역의 문제를 함께 해결해요",
    subject: "사회",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "우리가 사는 지역",
    coreIdea: "지역의 문제는 여러 사람의 생활과 이어져 있으므로 다양한 의견과 자료를 살펴보고 함께 해결 방법을 찾아야 한다.",
    selectedKeywords: ["지역 문제", "주민", "해결 방법"],
    coreSentences: [
      "지역 문제는 지역에 사는 사람들의 생활에 불편이나 어려움을 주는 일이다.",
      "서로 다른 의견을 듣고 실천할 수 있는 해결 방법을 함께 정해야 한다.",
    ],
    essentialQuestions: [
      "우리 지역의 문제를 누구의 눈으로 살펴봐야 할까?",
      "모두에게 도움이 되는 해결 방법은 어떻게 정할 수 있을까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "우리 지역에서 해결이 필요한 문제에는 무엇이 있을까?",
        "지역을 관찰하거나 자료를 조사해 실제 문제를 찾는 질문이에요.",
        [["지역", "사람들이 함께 생활하는 일정한 곳"], ["지역 문제", "지역 사람들에게 불편이나 어려움을 주는 일"]],
        "등굣길, 공원, 시장처럼 자주 가는 곳에서 불편했던 일을 떠올려 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "같은 지역 문제를 사람마다 다르게 바라보는 까닭은 무엇일까?",
        "생활 모습과 필요가 다르면 문제를 보는 생각도 어떻게 달라지는지 찾는 질문이에요.",
        [["관점", "어떤 일을 바라보는 생각이나 입장"], ["주민", "그 지역에 살고 있는 사람"]],
        "어린이, 어른, 가게 주인이 같은 문제를 어떻게 생각할지 비교해 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "지역 문제를 빨리 해결하려면 일부 주민의 불편을 받아들여도 될까?",
        "해결의 빠르기와 여러 사람의 권리를 함께 따져 판단하는 질문이에요.",
        [["권리", "사람이라면 마땅히 누릴 수 있는 것"], ["공동체", "함께 생활하며 이어진 사람들의 모임"]],
        "해결로 도움을 받는 사람과 불편을 겪는 사람이 누구인지 나누어 적어 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "지역 문제는 한 사람만의 일이 아니므로 여러 사람의 생각과 실제 자료를 함께 살펴보아야 해요.",
      lifeConnection: "학교 앞 안전, 공원 쓰레기, 도서관 이용처럼 우리 주변에서도 함께 해결할 문제를 찾을 수 있어요.",
      keywords: [["지역 문제", "지역 사람들에게 어려움을 주는 일"], ["주민", "그 지역에 사는 사람"], ["해결 방법", "문제를 줄이거나 없애기 위한 방법"]],
      sentenceExplanations: [
        "지역에서 여러 사람이 겪는 불편과 어려움을 지역 문제라고 해요.",
        "여러 의견을 듣고 실제로 할 수 있는 방법을 함께 골라야 해요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "문제로 영향을 받는 사람과 각자의 생활 모습을 살펴보세요.", perspectives: ["어린이", "주민", "지역에서 일하는 사람"] },
        { thinkingFocus: "도움이 되는 정도, 필요한 시간과 비용, 실천 가능성을 비교해 보세요.", perspectives: ["공정함", "실천 가능성", "오래 이어질 수 있는지"] },
      ],
    }),
  },
  {
    key: "past",
    id: DEMO.unitDesignIds.past,
    title: "물의 세 가지 상태",
    subject: "과학",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "물질",
    coreIdea: "물은 얼음, 물, 수증기의 모습으로 존재하며 온도가 달라지면 한 상태에서 다른 상태로 변할 수 있다.",
    selectedKeywords: ["고체", "액체", "기체", "상태 변화"],
    coreSentences: [
      "물은 얼음인 고체, 흐르는 물인 액체, 눈에 잘 보이지 않는 수증기인 기체로 존재한다.",
      "물이 얼거나 녹고 증발하는 동안 물질은 사라지지 않고 상태가 달라진다.",
    ],
    essentialQuestions: [
      "물은 상태가 달라져도 같은 물질이라고 할 수 있을까?",
      "물의 상태 변화는 우리 생활에서 어떻게 나타날까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "물이 얼 때 부피는 어떻게 달라질까?",
        "물이 얼기 전과 얼고 난 뒤의 모습을 관찰해 사실을 확인하는 질문이에요.",
        [["부피", "물체가 차지하는 공간의 크기"], ["얼음", "물이 얼어 고체가 된 것"]],
        "같은 양의 물을 얼리기 전과 후에 표시한 높이를 비교해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "물의 상태가 달라져도 물이라고 할 수 있는 까닭은 무엇일까?",
        "모습이 달라져도 같은 물질인지 공통점과 변화를 찾아보는 질문이에요.",
        [["상태", "물질이 고체, 액체, 기체로 나타나는 모습"], ["변화", "모양이나 성질이 달라지는 것"]],
        "얼음이 녹고 다시 어는 과정을 순서대로 그려 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "물을 아끼기 위해 학교에서 빗물을 모아 청소에 사용해야 할까?",
        "물 절약의 도움과 사용 과정에서 살펴볼 점을 근거로 판단하는 질문이에요.",
        [["물 절약", "필요한 만큼만 물을 사용하는 일"], ["빗물", "비가 내려 모인 물"]],
        "빗물을 사용했을 때 좋은 점과 깨끗하게 관리해야 하는 점을 비교해 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "물은 고체, 액체, 기체의 모습으로 달라질 수 있지만 모두 같은 물질인 물이에요.",
      lifeConnection: "얼음이 녹고, 주전자의 물이 줄고, 차가운 컵에 물방울이 맺히는 모습에서 물의 변화를 볼 수 있어요.",
      keywords: [["고체", "모양과 부피가 일정한 상태"], ["액체", "담긴 그릇에 따라 모양이 달라지는 상태"], ["기체", "공간에 널리 퍼지는 상태"], ["상태 변화", "물질의 상태가 달라지는 현상"]],
      sentenceExplanations: [
        "얼음, 물, 수증기는 모습은 달라도 모두 물이에요.",
        "물은 얼고 녹거나 증발해도 없어지는 것이 아니라 모습이 달라져요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "상태마다 달라지는 점과 그대로인 점을 나누어 찾아보세요.", perspectives: ["겉모습", "움직임", "같은 물질"] },
        { thinkingFocus: "집과 학교에서 볼 수 있는 물의 상태 변화를 찾아보세요.", perspectives: ["요리", "날씨", "생활 도구"] },
      ],
    }),
  },
  {
    key: "pastMath",
    id: DEMO.unitDesignIds.pastMath,
    title: "자료를 표와 그래프로 나타내요",
    subject: "수학",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "자료와 가능성",
    coreIdea: "자료를 기준에 따라 분류하고 표와 그래프로 나타내면 수의 크기와 변화를 쉽게 비교하고 알맞은 결론을 찾을 수 있다.",
    selectedKeywords: ["자료", "표", "그래프", "눈금"],
    coreSentences: [
      "표는 자료를 항목과 수에 따라 가지런히 정리한 것이다.",
      "그래프는 자료의 크기와 차이를 한눈에 비교하도록 나타낸 것이다.",
    ],
    essentialQuestions: [
      "자료에 알맞은 표와 그래프는 어떻게 고를 수 있을까?",
      "같은 자료를 나타내는 방법이 달라지면 생각도 달라질 수 있을까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "표와 그래프에서 가장 많고 가장 적은 항목은 무엇일까?",
        "표와 그래프에 나타난 수를 직접 읽어 확인하는 질문이에요.",
        [["항목", "자료를 나누는 각각의 종류"], ["눈금", "수의 크기를 나타내려고 일정하게 표시한 선이나 점"]],
        "각 항목의 수를 읽고 가장 큰 수와 가장 작은 수에 표시해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "표와 그래프는 자료를 이해하는 데 각각 어떤 도움을 줄까?",
        "두 표현 방법의 특징과 쓰임을 비교해 관계를 찾는 질문이에요.",
        [["표", "자료를 칸에 맞추어 정리한 것"], ["그래프", "자료의 크기나 변화를 그림처럼 나타낸 것"]],
        "정확한 수를 찾을 때와 크기를 빠르게 비교할 때 무엇이 편한지 살펴보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "자료의 차이를 크게 보이게 하려고 그래프의 눈금을 바꾸어도 될까?",
        "그래프를 알아보기 쉽게 만드는 것과 자료를 바르게 전달하는 것을 함께 판단하는 질문이에요.",
        [["왜곡", "사실과 다르게 보이도록 바꾸는 것"], ["공정한 표현", "자료를 치우치지 않게 나타내는 것"]],
        "같은 자료를 서로 다른 눈금으로 그린 뒤 보는 사람의 생각이 어떻게 달라지는지 비교해 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "자료를 표로 정리하면 정확한 수를 찾기 쉽고, 그래프로 나타내면 크기와 차이를 빠르게 비교할 수 있어요.",
      lifeConnection: "우리 반이 좋아하는 운동이나 한 주 동안의 날씨를 조사해 표와 그래프로 나타낼 수 있어요.",
      keywords: [["자료", "조사하거나 관찰해 모은 내용"], ["표", "자료를 칸에 맞추어 정리한 것"], ["그래프", "자료의 크기와 변화를 쉽게 비교하도록 나타낸 것"], ["눈금", "수의 간격을 일정하게 표시한 것"]],
      sentenceExplanations: [
        "표는 항목별 수를 정확하게 찾아보기 좋게 정리한 것이에요.",
        "그래프는 어느 항목이 크거나 작은지 빠르게 비교하게 도와줘요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "자료의 종류와 알고 싶은 내용을 먼저 정해 보세요.", perspectives: ["정확한 수", "크기 비교", "시간에 따른 변화"] },
        { thinkingFocus: "같은 자료를 표와 여러 그래프로 나타내고 느낌을 비교해 보세요.", perspectives: ["보기 쉬움", "정확함", "공정한 표현"] },
      ],
    }),
  },
  {
    key: "today",
    id: DEMO.unitDesignIds.today,
    title: "온도에 따라 달라지는 물질의 상태",
    subject: "과학",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "물질",
    coreIdea: "물질은 온도에 따라 상태가 달라지며 상태가 변할 때 부피, 모양, 움직임처럼 관찰할 수 있는 변화가 나타난다.",
    selectedKeywords: ["물질", "온도", "상태 변화"],
    coreSentences: [
      "물질에 열을 더하거나 빼면 고체, 액체, 기체 사이에서 상태가 달라질 수 있다.",
      "상태 변화가 일어나는 조건과 모습을 관찰하면 생활 속 현상을 설명할 수 있다.",
    ],
    essentialQuestions: [
      "온도는 물질의 상태 변화에 어떤 영향을 줄까?",
      "상태 변화를 이용해 생활 속 문제를 어떻게 해결할 수 있을까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "얼음은 어느 조건에서 가장 빨리 녹을까?",
        "조건을 다르게 해 얼음이 녹는 시간을 관찰하고 비교하는 질문이에요.",
        [["조건", "실험에서 다르게 하거나 같게 하는 것"], ["녹는 시간", "고체가 액체로 변하는 데 걸리는 시간"]],
        "햇빛과 그늘처럼 한 가지 조건만 다르게 하고 나머지는 같게 정해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "물질의 상태 변화와 온도는 어떤 관계가 있을까?",
        "온도가 달라질 때 물질의 상태가 변하는 까닭과 관계를 찾는 질문이에요.",
        [["온도", "차갑고 뜨거운 정도를 나타내는 값"], ["관계", "두 가지가 서로 이어지는 방식"]],
        "얼음, 물, 수증기가 되는 때의 온도와 모습을 순서대로 떠올려 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "상태 변화를 이용하는 생활 도구는 편리함보다 에너지 절약을 먼저 생각해야 할까?",
        "생활의 편리함과 에너지 사용을 함께 비교해 판단하는 질문이에요.",
        [["에너지 절약", "필요하지 않은 에너지 사용을 줄이는 일"], ["생활 도구", "생활을 편리하게 하려고 사용하는 물건"]],
        "냉장고나 에어컨이 주는 도움과 사용하는 에너지의 양을 함께 살펴보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "물질은 온도가 달라지면 고체, 액체, 기체의 상태가 변하고 그 과정에서 눈으로 확인할 수 있는 변화가 나타나요.",
      lifeConnection: "얼음이 녹고 젖은 빨래가 마르며 냉동실에서 물이 어는 일에서 상태 변화를 찾을 수 있어요.",
      keywords: [["물질", "주변의 물건을 이루는 재료"], ["온도", "차갑고 뜨거운 정도"], ["상태 변화", "고체, 액체, 기체 사이에서 모습이 달라지는 현상"]],
      sentenceExplanations: [
        "물질에 열을 더하거나 빼면 고체, 액체, 기체의 모습이 달라질 수 있어요.",
        "어떤 조건에서 어떻게 변했는지 관찰하면 생활 속 현상의 까닭을 설명할 수 있어요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "온도가 달라질 때 물질의 모습과 변하는 시간을 함께 살펴보세요.", perspectives: ["온도", "시간", "물질의 모습"] },
        { thinkingFocus: "상태 변화를 사용하는 물건이 어떤 도움을 주는지 찾아보세요.", perspectives: ["생활의 편리함", "안전", "에너지 절약"] },
      ],
    }),
  },
  {
    key: "future",
    id: DEMO.unitDesignIds.future,
    title: "환경을 생각하는 생활 속 선택",
    subject: "사회",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "지속 가능한 생활",
    coreIdea: "생활 속 작은 선택도 자연과 다른 사람에게 영향을 주므로 필요한 것과 환경에 미치는 영향을 함께 생각하고 행동해야 한다.",
    selectedKeywords: ["환경", "자원", "생활 습관"],
    coreSentences: [
      "우리가 사용하는 물건과 에너지는 자연에서 얻은 자원과 이어져 있다.",
      "덜 쓰고 다시 쓰며 올바르게 나누어 버리는 행동은 환경을 지키는 데 도움이 된다.",
    ],
    essentialQuestions: [
      "나의 생활 습관은 환경과 어떻게 이어져 있을까?",
      "편리함과 환경 보호를 함께 지키는 선택은 무엇일까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "학교에서 하루 동안 가장 많이 버리는 물건은 무엇일까?",
        "학교에서 나온 쓰레기를 종류와 양에 따라 조사하는 질문이에요.",
        [["쓰레기", "쓰고 난 뒤 버리는 물건"], ["분류", "같은 특징에 따라 나누는 것"]],
        "교실과 급식실에서 버려진 물건을 종류별로 안전하게 조사해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "우리의 소비 습관은 환경에 어떤 영향을 줄까?",
        "물건을 사고 쓰고 버리는 과정이 자연과 어떻게 이어지는지 찾는 질문이에요.",
        [["소비", "필요한 물건이나 서비스를 사서 사용하는 일"], ["자원", "생활에 필요한 것을 만들 때 사용하는 자연의 재료"]],
        "물건 하나가 만들어져 버려질 때까지 필요한 재료와 에너지를 생각해 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "환경을 지키기 위해 조금 불편한 생활도 받아들여야 할까?",
        "환경에 주는 도움과 생활의 불편을 비교해 내 생각을 정하는 질문이에요.",
        [["환경 보호", "자연과 생활 터전을 건강하게 지키는 일"], ["실천", "생각한 것을 직접 행동으로 옮기는 일"]],
        "텀블러 사용처럼 불편하지만 도움이 되는 행동과 더 쉬운 방법을 함께 찾아보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "우리가 물건과 에너지를 사용하는 방법은 자연에서 얻는 자원의 양과 버려지는 쓰레기의 양에 영향을 줘요.",
      lifeConnection: "물을 아껴 쓰고, 일회용품을 줄이고, 쓰지 않는 전등을 끄는 행동부터 시작할 수 있어요.",
      keywords: [["환경", "사람과 생물이 살아가는 주변"], ["자원", "생활에 필요한 것을 만드는 자연의 재료"], ["생활 습관", "생활 속에서 되풀이하는 행동"]],
      sentenceExplanations: [
        "우리가 쓰는 물건과 전기는 자연에서 얻은 재료와 에너지로 만들어져요.",
        "적게 쓰고 다시 쓰며 바르게 버리면 자원과 환경을 지킬 수 있어요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "하루 동안 무엇을 사고 쓰고 버리는지 차례로 살펴보세요.", perspectives: ["물건", "에너지", "쓰레기"] },
        { thinkingFocus: "환경에 주는 도움과 내가 겪을 불편을 함께 비교해 보세요.", perspectives: ["환경 보호", "생활의 편리함", "계속 실천할 수 있는지"] },
      ],
    }),
  },
];

const SESSION_QUESTION_BANKS = {
  pastKorean: [
    "글쓴이가 제시한 근거는 주장과 어떻게 이어질까요?",
    "근거가 믿을 만한지 확인하려면 무엇을 살펴봐야 할까요?",
    "같은 자료를 보고 서로 다른 주장을 할 수 있을까요?",
    "주장에 어울리지 않는 근거는 어떻게 찾을 수 있을까요?",
    "경험을 근거로 사용할 때 주의할 점은 무엇일까요?",
  ],
  pastSocial: [
    "우리 지역에서 어린이가 가장 불편해하는 문제는 무엇일까요?",
    "지역 문제의 원인은 누구의 관점에서 살펴봐야 할까요?",
    "주민들의 의견이 다르면 해결 방법을 어떻게 정해야 할까요?",
    "지역 문제를 해결하는 데 학생도 참여할 수 있을까요?",
    "한 가지 해결 방법이 모든 주민에게 도움이 될까요?",
  ],
  past: [
    "물이 얼면 왜 부피가 달라질까요?",
    "얼음은 어떤 온도에서 가장 빨리 녹을까요?",
    "물방울은 차가운 컵 표면에 어떻게 생길까요?",
    "같은 물질도 상태에 따라 성질이 달라질까요?",
    "물이 수증기가 되면 무게도 달라질까요?",
  ],
  pastMath: [
    "같은 자료도 표와 그래프에서 다르게 보일 수 있을까요?",
    "어떤 그래프가 자료의 차이를 가장 잘 보여 줄까요?",
    "자료가 많아지면 표를 어떻게 정리해야 알아보기 쉬울까요?",
    "그래프의 눈금이 달라지면 자료가 다르게 느껴질까요?",
    "우리 반의 생활 모습을 어떤 자료로 나타내면 좋을까요?",
  ],
  today: [
    "온도가 높아지면 물의 모습은 어떻게 달라질까요?",
    "젖은 빨래는 바람이 불면 왜 빨리 마를까요?",
    "겨울철 수도관은 왜 얼어서 터질 수 있을까요?",
    "그늘과 햇빛 아래에서 얼음이 녹는 속도는 얼마나 다를까요?",
    "상태 변화를 이용하면 생활 속 어떤 문제를 해결할 수 있을까요?",
  ],
};

const KIM_QUESTION_PLANS = [
  {
    sessionKey: "pastKorean",
    content: "글쓴이의 주장을 믿으려면 어떤 근거를 먼저 살펴봐야 할까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "pastKorean",
    content: "같은 근거를 보고도 서로 다른 주장을 할 수 있을까요?",
    closure: "open",
    cognitive: "controversial",
  },
  {
    sessionKey: "pastSocial",
    content: "우리 지역에서 어린이가 가장 불편해하는 문제는 무엇일까요?",
    closure: "open",
    cognitive: "factual",
  },
  {
    sessionKey: "pastSocial",
    content: "지역 문제를 해결할 때 주민의 의견이 다르면 어떻게 정해야 할까요?",
    closure: "open",
    cognitive: "controversial",
  },
  {
    sessionKey: "past",
    content: "물이 얼 때 부피가 커지는 까닭은 무엇일까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "past",
    content: "얼음이 녹은 물의 양은 녹기 전과 같을까요?",
    closure: "closed",
    cognitive: "factual",
  },
  {
    sessionKey: "pastMath",
    content: "같은 자료도 표와 그래프에서 다르게 보일 수 있을까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "pastMath",
    content: "어떤 그래프를 써야 자료의 차이가 가장 잘 보일까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "today",
    content: "온도가 높아질수록 물은 언제나 더 빨리 증발할까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "today",
    content: "겨울철 수도관이 얼면 왜 터질 수 있을까요?",
    closure: "open",
    cognitive: "factual",
  },
  {
    sessionKey: "today",
    content: "생활의 편리함을 위해 상태 변화를 이용할 때 환경도 고려해야 할까요?",
    closure: "open",
    cognitive: "controversial",
  },
];

const STUDENT_ANALYSIS_COPY = {
  pastKorean: {
    summary: "주장과 근거가 어떻게 이어지는지 살피는 질문 두 개를 만들고 친구의 생각에도 적극적으로 반응했습니다.",
    insights: "근거의 출처와 믿을 만한 정도를 비교하면 주장 판단이 더욱 탄탄해집니다.",
    relevanceInsights: "두 질문 모두 수업의 핵심인 주장과 근거의 관계에 알맞게 집중했습니다.",
    growthInsights: "사실을 확인하는 데서 그치지 않고 같은 근거에 다른 주장이 가능한지 생각의 범위를 넓혔습니다.",
    rewriteExample: "\"어떤 근거를 먼저 살펴봐야 할까요?\" → \"주장을 믿을 만하다고 판단하려면 근거의 출처와 내용을 어떤 순서로 살펴봐야 할까요?\"",
  },
  pastSocial: {
    summary: "지역 문제를 어린이와 주민의 관점에서 살피고 해결 과정의 기준을 묻는 질문을 만들었습니다.",
    insights: "문제의 원인과 영향을 받는 사람을 나누어 조사하면 해결 방법을 더 공정하게 비교할 수 있습니다.",
    relevanceInsights: "지역 문제와 주민 의견이라는 수업 주제를 구체적으로 담은 질문을 작성했습니다.",
    growthInsights: "앞선 수업보다 여러 사람의 관점을 비교하고 선택 기준을 찾는 힘이 좋아졌습니다.",
    rewriteExample: "\"의견이 다르면 어떻게 정해야 할까요?\" → \"주민의 의견이 다를 때 모두에게 도움이 되는 해결 방법을 어떤 기준으로 정해야 할까요?\"",
  },
  past: {
    summary: "물이 얼고 녹을 때 나타나는 변화를 부피와 양을 중심으로 관찰하는 질문을 만들었습니다.",
    insights: "예상한 내용과 실제 관찰 결과를 표로 비교하면 상태 변화의 특징을 더 분명히 설명할 수 있습니다.",
    relevanceInsights: "물의 세 가지 상태와 직접 이어지는 질문을 작성해 수업 내용에 잘 집중했습니다.",
    growthInsights: "원인을 묻는 열린 질문과 관찰로 확인할 수 있는 질문을 함께 사용해 질문의 균형이 좋아졌습니다.",
    rewriteExample: "\"얼음이 녹은 물의 양은 같을까요?\" → \"같은 양의 얼음을 녹였을 때 녹기 전과 후의 부피와 무게는 각각 어떻게 달라질까요?\"",
  },
  pastMath: {
    summary: "표와 그래프의 표현 차이를 살피고 자료에 알맞은 그래프를 선택하는 질문을 만들었습니다.",
    insights: "자료의 종류, 비교할 항목, 눈금 간격을 기준으로 그래프를 고르면 까닭을 분명히 말할 수 있습니다.",
    relevanceInsights: "자료를 표와 그래프로 나타내는 수업 목표에 맞는 비교 질문을 작성했습니다.",
    growthInsights: "자료를 읽는 것에서 한 걸음 나아가 표현 방법에 따라 해석이 달라지는지 탐구했습니다.",
    rewriteExample: "\"어떤 그래프를 써야 잘 보일까요?\" → \"항목별 수의 차이를 가장 쉽게 비교하려면 어떤 그래프를 써야 하며 그 까닭은 무엇일까요?\"",
  },
  today: {
    summary: "온도와 증발의 관계, 겨울철 수도관, 환경까지 연결한 질문 세 개를 만들고 친구의 질문에도 활발히 참여했습니다.",
    insights: "온도뿐 아니라 바람, 넓이 같은 조건도 함께 비교하면 증발 현상을 더 정확하게 설명할 수 있습니다.",
    relevanceInsights: "상태 변화의 원리와 생활 속 활용을 모두 다룬 성의 있는 질문을 작성했습니다.",
    growthInsights: "개념을 생활 문제와 환경에 연결하고 여러 조건을 따져 보는 질문으로 발전했습니다.",
    rewriteExample: "\"온도가 높으면 언제나 빨리 증발할까요?\" → \"물의 양과 넓이가 같을 때 온도가 높아질수록 증발 속도는 어떻게 달라질까요?\"",
  },
};

const COMMENT_CONTENTS = [
  "질문에 답하려면 어떤 자료를 먼저 찾아야 할지 함께 정해 보면 좋겠어요.",
  "두 가지 경우를 표로 비교하면 차이와 까닭이 더 잘 보일 것 같아요.",
  "다른 사람의 관점에서는 어떻게 생각할지도 덧붙여 보면 좋겠어요.",
  "생활 속 예를 하나 넣으면 질문의 뜻을 더 쉽게 이해할 수 있을 것 같아요.",
  "관찰할 조건을 같게 정하면 결과를 더 정확하게 비교할 수 있어요.",
  "왜 그렇게 생각했는지 근거까지 물어보는 질문으로 넓혀 보면 좋겠어요.",
];

function questionTypeFor(index) {
  return ["factual", "conceptual", "controversial"][index % 3];
}

function pickUniqueQuestion(candidates, usedQuestionIds, startIndex) {
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(startIndex + offset) % candidates.length];
    if (!usedQuestionIds.has(candidate.id)) return candidate;
  }
  throw new Error("좋아요를 배치할 질문이 부족합니다.");
}

export function buildDemoLearningActivityPlans(studentIds) {
  if (studentIds.length !== STUDENT_NAMES.length) {
    throw new Error(`시연 학생은 ${STUDENT_NAMES.length}명이어야 합니다.`);
  }

  const sessionByKey = new Map(
    ACTIVITY_SESSION_BLUEPRINTS.map((blueprint) => [blueprint.key, blueprint]),
  );
  const questions = [];

  for (const [index, plan] of KIM_QUESTION_PLANS.entries()) {
    const session = sessionByKey.get(plan.sessionKey);
    questions.push({
      id: `usb-demo-question-01-${pad(index + 1)}`,
      authorId: studentIds[0],
      sessionId: session.id,
      content: plan.content,
      context: session.topic,
      closure: plan.closure,
      cognitive: plan.cognitive,
      inquiryType: plan.cognitive,
      createdDays: session.offsetDays + 1,
    });
  }

  for (let studentIndex = 1; studentIndex < studentIds.length; studentIndex += 1) {
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      const session = ACTIVITY_SESSION_BLUEPRINTS[
        (studentIndex + questionIndex) % ACTIVITY_SESSION_BLUEPRINTS.length
      ];
      const bank = SESSION_QUESTION_BANKS[session.key];
      const content = bank[(studentIndex + questionIndex * 2) % bank.length];
      questions.push({
        id: `usb-demo-question-${pad(studentIndex + 1)}-${pad(questionIndex + 1)}`,
        authorId: studentIds[studentIndex],
        sessionId: session.id,
        content,
        context: session.topic,
        closure: questionIndex === 0 && studentIndex % 4 === 0 ? "closed" : "open",
        cognitive: questionTypeFor(studentIndex + questionIndex),
        inquiryType: questionTypeFor(studentIndex + questionIndex),
        createdDays: session.offsetDays + 1 + (studentIndex % 2),
      });
    }
  }

  const kimQuestions = questions.filter(({ authorId }) => authorId === studentIds[0]);
  const comments = [];
  for (let studentIndex = 0; studentIndex < studentIds.length; studentIndex += 1) {
    const authorId = studentIds[studentIndex];
    const count = studentIndex === 0 ? 12 : 3;
    const otherQuestions = questions.filter((question) => question.authorId !== authorId);
    for (let commentIndex = 0; commentIndex < count; commentIndex += 1) {
      const target = studentIndex > 0 && commentIndex === 0
        ? kimQuestions[(studentIndex - 1) % kimQuestions.length]
        : otherQuestions[
          (studentIndex * 7 + commentIndex * 11) % otherQuestions.length
        ];
      const content = COMMENT_CONTENTS[(studentIndex + commentIndex) % COMMENT_CONTENTS.length];
      comments.push({
        id: `usb-demo-comment-${pad(studentIndex + 1)}-${pad(commentIndex + 1)}`,
        authorId,
        questionId: target.id,
        content,
        createdDays: Math.min(0, target.createdDays + 1 + (commentIndex % 2)),
      });
    }
  }

  const likes = [];
  for (let studentIndex = 0; studentIndex < studentIds.length; studentIndex += 1) {
    const userId = studentIds[studentIndex];
    const count = studentIndex === 0 ? 18 : 5;
    const otherQuestions = questions.filter((question) => question.authorId !== userId);
    const usedQuestionIds = new Set();
    for (let likeIndex = 0; likeIndex < count; likeIndex += 1) {
      const preferred = studentIndex > 0 && likeIndex === 0
        ? kimQuestions[(studentIndex - 1) % kimQuestions.length]
        : pickUniqueQuestion(
          otherQuestions,
          usedQuestionIds,
          studentIndex * 5 + likeIndex * 13,
        );
      const target = usedQuestionIds.has(preferred.id)
        ? pickUniqueQuestion(otherQuestions, usedQuestionIds, likeIndex)
        : preferred;
      usedQuestionIds.add(target.id);
      likes.push({
        id: `usb-demo-like-${pad(studentIndex + 1)}-${pad(likeIndex + 1)}`,
        userId,
        questionId: target.id,
        createdDays: Math.min(0, target.createdDays + 2 + (likeIndex % 2)),
      });
    }
  }

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const analyses = ACTIVITY_SESSION_BLUEPRINTS.map((session, index) => {
    const totalQuestions = questions.filter(
      ({ authorId, sessionId }) => authorId === studentIds[0] && sessionId === session.id,
    ).length;
    const totalComments = comments.filter(({ authorId, questionId }) => (
      authorId === studentIds[0] && questionById.get(questionId)?.sessionId === session.id
    )).length;
    const totalLikes = likes.filter(({ userId, questionId }) => (
      userId === studentIds[0] && questionById.get(questionId)?.sessionId === session.id
    )).length;
    return {
      id: `usb-demo-analysis-student-01-${pad(index + 1)}`,
      sessionId: session.id,
      studentId: studentIds[0],
      result: {
        ...STUDENT_ANALYSIS_COPY[session.key],
        totalQuestions,
        totalComments,
        totalLikes,
        analyzedAt: offsetDate(0).toISOString(),
        analysisModel: "gemini-2.5-flash",
      },
    };
  });

  return { questions, comments, likes, analyses };
}

const CLASS_INQUIRY_FLOW = [
  { type: "factual", contentGroup: "사실 확인" },
  { type: "conceptual", contentGroup: "관계와 까닭" },
  { type: "controversial", contentGroup: "판단과 토론" },
];

export function buildDemoClassInquiryQuestions(
  design,
  sessionId,
  studentQuestions,
) {
  const questionsInSession = studentQuestions.filter(
    (question) => question.sessionId === sessionId,
  );
  const designQuestionByType = new Map(
    design.inquiryQuestions.map((question) => [question.type, question]),
  );

  return CLASS_INQUIRY_FLOW.map(({ type, contentGroup }, index) => {
    const question = designQuestionByType.get(type);
    const sameTypeQuestions = questionsInSession.filter(
      (studentQuestion) => studentQuestion.inquiryType === type,
    );
    const mergedFrom = (sameTypeQuestions.length > 0
      ? sameTypeQuestions
      : questionsInSession
    )
      .slice(0, 4)
      .map((studentQuestion) => studentQuestion.content);

    return {
      ...question,
      contentGroup,
      priority: index + 1,
      source: "student",
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : [question.content],
    };
  });
}

async function removePreviousDemoData(tx, studentIds) {
  const sessionIds = Object.values(DEMO.sessionIds);
  const questionIds = (
    await tx.question.findMany({
      where: {
        OR: [
          { authorId: { in: studentIds } },
          { sessionId: { in: sessionIds } },
        ],
      },
      select: { id: true },
    })
  ).map(({ id }) => id);

  await tx.appNotification.deleteMany({
    where: {
      OR: [
        { recipientId: { in: studentIds } },
        { senderId: DEMO.teacherId },
        { sessionId: { in: sessionIds } },
      ],
    },
  });
  await tx.translation.deleteMany({
    where: { sourceId: { in: questionIds } },
  });
  await tx.questionLike.deleteMany({
    where: {
      OR: [
        { userId: { in: studentIds } },
        { questionId: { in: questionIds } },
      ],
    },
  });
  await tx.activityAwardClaim.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await tx.pointLog.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await tx.gameRun.deleteMany({
    where: { ownerId: { in: studentIds } },
  });
  await tx.mysteryAnswerUse.deleteMany({
    where: { userId: { in: studentIds } },
  });
  await tx.practiceAttempt.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await tx.comment.deleteMany({
    where: {
      OR: [
        { authorId: { in: studentIds } },
        { questionId: { in: questionIds } },
      ],
    },
  });
  await tx.question.deleteMany({
    where: {
      OR: [
        { authorId: { in: studentIds } },
        { sessionId: { in: sessionIds } },
      ],
    },
  });
  await tx.sessionAnalysis.deleteMany({
    where: { sessionId: { in: sessionIds } },
  });
  await tx.questionSession.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.practiceCustomItem.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.questionGameCustom.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.questionGameVisibility.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.questionGameOrder.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.unitDesign.deleteMany({
    where: { teacherId: DEMO.teacherId },
  });
  await tx.demoAiDailyUsage.deleteMany({
    where: { userId: { in: studentIds } },
  });
}

async function createClassAccounts(tx, passwordHash) {
  await tx.user.upsert({
    where: { id: DEMO.teacherId },
    create: {
      id: "usb-demo-teacher",
      email: DEMO.teacherEmail,
      password: passwordHash,
      name: "김교사",
      role: "TEACHER",
      school: DEMO.school,
      isDemo: true,
    },
    update: {
      email: DEMO.teacherEmail,
      name: "김교사",
      role: "TEACHER",
      school: DEMO.school,
      grade: null,
      className: null,
      studentNumber: null,
      isDemo: true,
      totalPoints: 0,
    },
  });
  await tx.teacherClass.upsert({
    where: {
      teacherId_grade_className: {
        teacherId: DEMO.teacherId,
        grade: DEMO.grade,
        className: DEMO.className,
      },
    },
    create: {
      id: "usb-demo-teacher-class-4-1",
      teacherId: DEMO.teacherId,
      grade: DEMO.grade,
      className: DEMO.className,
    },
    update: {},
  });

  for (const [index, name] of STUDENT_NAMES.entries()) {
    const number = index + 1;
    await tx.user.upsert({
      where: { id: studentId(number) },
      create: {
        id: number === 1 ? "usb-demo-student-01" : studentId(number),
        password: passwordHash,
        name,
        role: "STUDENT",
        school: DEMO.school,
        grade: DEMO.grade,
        className: DEMO.className,
        studentNumber: String(number),
        isDemo: true,
      },
      update: {
        name,
        role: "STUDENT",
        school: DEMO.school,
        grade: DEMO.grade,
        className: DEMO.className,
        studentNumber: String(number),
        isDemo: true,
        totalPoints: 0,
      },
    });
  }
}

async function createInquiryLearningData(tx, studentIds) {
  const sessionByKey = new Map(
    DEMO_SESSION_BLUEPRINTS.map((blueprint) => [blueprint.key, blueprint]),
  );
  for (const design of DEMO_UNIT_DESIGN_BLUEPRINTS) {
    const session = sessionByKey.get(design.key);
    await tx.unitDesign.create({
      data: {
        id: design.id,
        teacherId: DEMO.teacherId,
        title: design.title,
        subject: design.subject,
        gradeRange: design.gradeRange,
        grade: design.grade,
        sessionDate: koreanDate(offsetDate(session.offsetDays)),
        area: design.area,
        coreIdea: design.coreIdea,
        selectedKeywords: design.selectedKeywords,
        coreSentences: design.coreSentences,
        essentialQuestions: design.essentialQuestions,
        inquiryQuestions: design.inquiryQuestions,
        learningGuides: design.learningGuides,
        targetClassValue: "4-1",
        targetStudentIds: studentIds,
      },
    });
  }

  const designById = new Map(
    DEMO_UNIT_DESIGN_BLUEPRINTS.map((design) => [design.id, design]),
  );
  const activityPlans = buildDemoLearningActivityPlans(studentIds);
  for (const blueprint of DEMO_SESSION_BLUEPRINTS) {
    const design = designById.get(blueprint.unitDesignId);
    const publishedAt = offsetDate(blueprint.offsetDays).toISOString();
    const sharedQuestions = buildDemoClassInquiryQuestions(
      design,
      blueprint.id,
      activityPlans.questions,
    ).map((question) => ({
      ...question,
      publishedAt,
    }));
    await tx.questionSession.create({
      data: {
        id: blueprint.id,
        date: koreanDate(offsetDate(blueprint.offsetDays)),
        subject: blueprint.subject,
        topic: blueprint.topic,
        unitDesignId: blueprint.unitDesignId,
        teacherId: DEMO.teacherId,
        targetType: "CLASS",
        targetGrade: DEMO.grade,
        targetClassName: DEMO.className,
        targetStudentIds: studentIds,
        sharedQuestions,
        defaultQuestionPublic: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
        isActive: true,
      },
    });

    for (const [index, question] of sharedQuestions.entries()) {
      const id = `usb-demo-shared-question-${blueprint.key}-${pad(index + 1)}`;
      await tx.question.create({
        data: {
          id,
          content: question.content,
          normalizedContent: question.content,
          dedupeKey: id,
          closure: "open",
          cognitive: question.type,
          closureScore: 0.95,
          cognitiveScore: 0.95,
          context: blueprint.topic,
          source: "TEACHER_SHARED",
          inquiryType: question.type,
          sessionId: blueprint.id,
          authorId: DEMO.teacherId,
          isPublic: true,
          createdAt: offsetDate(blueprint.offsetDays),
        },
      });
    }
  }

  for (const question of activityPlans.questions) {
    await tx.question.create({
      data: {
        id: question.id,
        content: question.content,
        normalizedContent: question.content,
        dedupeKey: question.id,
        closure: question.closure,
        cognitive: question.cognitive,
        closureScore: 0.9,
        cognitiveScore: 0.78,
        context: question.context,
        source: "STUDENT",
        inquiryType: question.inquiryType,
        sessionId: question.sessionId,
        authorId: question.authorId,
        isPublic: true,
        createdAt: offsetDate(question.createdDays),
      },
    });
  }

  for (const comment of activityPlans.comments) {
    await tx.comment.create({
      data: {
        id: comment.id,
        content: comment.content,
        normalizedContent: comment.content,
        dedupeKey: comment.id,
        authorId: comment.authorId,
        questionId: comment.questionId,
        createdAt: offsetDate(comment.createdDays),
      },
    });
  }

  for (const like of activityPlans.likes) {
    await tx.questionLike.create({
      data: {
        id: like.id,
        questionId: like.questionId,
        userId: like.userId,
        createdAt: offsetDate(like.createdDays),
      },
    });
  }

  for (const analysis of activityPlans.analyses) {
    await tx.sessionAnalysis.create({
      data: {
        id: analysis.id,
        sessionId: analysis.sessionId,
        scope: "student",
        studentId: analysis.studentId,
        result: analysis.result,
        locale: "ko",
      },
    });
  }

  for (const [index, student] of studentIds.entries()) {
    const attemptCount = 2 + (index % 3);
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      await tx.practiceAttempt.create({
        data: {
          id: `usb-demo-practice-${pad(index + 1)}-${attempt + 1}`,
          studentId: student,
          mode: ["quiz", "transform", "create"][attempt % 3],
          itemId: `demo-practice-item-${attempt + 1}`,
          quizType: attempt % 2 === 0 ? "closure" : "cognitive",
          correct: (index + attempt) % 4 !== 0,
          createdAt: offsetDate(-10 + ((index + attempt) % 9)),
        },
      });
    }
  }

  await tx.appNotification.create({
    data: {
      id: "usb-demo-notification-today",
      recipientId: studentIds[0],
      senderId: DEMO.teacherId,
      sessionId: DEMO.sessionIds.today,
      type: "SESSION_REMINDER",
      title: "오늘 질문수업이 있어요",
      message: "과학 수업의 탐구 질문을 읽고 나만의 질문을 준비해 보세요.",
      href: "/student-ask",
      metadata: { demo: true },
    },
  });
}

async function createQuestionGameData(tx, studentIds) {
  const gameIds = ["dice", "relay", "mystery-box", "kaba"];
  const pointTotals = new Map(studentIds.map((id) => [id, 0]));

  for (const [index, ownerId] of studentIds.entries()) {
    const number = index + 1;
    for (const mode of ["SOLO", "AI"]) {
      const modeKey = mode.toLowerCase();
      const runId = `usb-demo-run-${modeKey}-${pad(number)}`;
      const gameId = gameIds[(index + (mode === "AI" ? 1 : 0)) % gameIds.length];
      const validQuestions = 1 + ((index + (mode === "AI" ? 1 : 0)) % 3);
      const participationPoints = 3;
      const activityPoints = validQuestions;
      const completedAt = offsetDate(-13 + ((index * 2 + (mode === "AI" ? 1 : 0)) % 13));

      await tx.gameRun.create({
        data: {
          id: runId,
          gameId,
          mode,
          ownerId,
          creationRequestId: `usb-demo-request-${modeKey}-${pad(number)}`,
          creationRequestFingerprint: `usb-demo-fingerprint-${modeKey}-${pad(number)}`,
          participants: [ownerId],
          status: "SETTLED",
          state: {
            demo: true,
            result: {
              awarded: participationPoints + activityPoints,
              dailyLimit: mode === "SOLO" ? 20 : 15,
              dailyRemaining: 0,
              cappedByLimit: false,
              preview: false,
            },
          },
          version: 2,
          scoreDate: koreanDate(completedAt),
          completedAt,
          settledAt: completedAt,
          expiresAt: new Date(completedAt.getTime() + 60 * 60 * 1_000),
          createdAt: new Date(completedAt.getTime() - 10 * 60 * 1_000),
        },
      });
      await tx.gameActivity.create({
        data: {
          id: `usb-demo-activity-${modeKey}-${pad(number)}`,
          runId,
          actorId: ownerId,
          requestId: `usb-demo-activity-request-${modeKey}-${pad(number)}`,
          requestFingerprint: `usb-demo-activity-fingerprint-${modeKey}-${pad(number)}`,
          sequence: 1,
          type: "QUESTION",
          payload: { demo: true },
          validQuestionCount: validQuestions,
          scoreValue: activityPoints,
          responseSnapshot: { completed: true },
          createdAt: completedAt,
        },
      });
      await tx.pointLog.create({
        data: {
          id: `usb-demo-point-${modeKey}-participation-${pad(number)}`,
          studentId: ownerId,
          gameId,
          bonusType: "PARTICIPATION",
          points: participationPoints,
          reason: "질문놀이 완료",
          status: "APPROVED",
          gameRunId: runId,
          createdAt: completedAt,
        },
      });
      await tx.pointLog.create({
        data: {
          id: `usb-demo-point-${modeKey}-activity-${pad(number)}`,
          studentId: ownerId,
          gameId,
          bonusType: "VALID_QUESTIONS",
          points: activityPoints,
          reason: `유효 질문 ${validQuestions}개`,
          status: "APPROVED",
          gameRunId: runId,
          createdAt: completedAt,
        },
      });
      pointTotals.set(
        ownerId,
        (pointTotals.get(ownerId) ?? 0) + participationPoints + activityPoints,
      );
    }

    const friendGameId = gameIds[(index + 2) % gameIds.length];
    const roomCode = `room:usb-demo:${pad(number)}`;
    const friendQuestions = 1 + (index % 3);
    const friendCompletedAt = offsetDate(-((index % 12) + 1));
    await tx.pointLog.create({
      data: {
        id: `usb-demo-point-friend-participation-${pad(number)}`,
        studentId: ownerId,
        gameId: friendGameId,
        roomCode,
        bonusType: "PARTICIPATION",
        points: 4,
        reason: "친구와 질문놀이 완료",
        status: "APPROVED",
        createdAt: friendCompletedAt,
      },
    });
    await tx.pointLog.create({
      data: {
        id: `usb-demo-point-friend-activity-${pad(number)}`,
        studentId: ownerId,
        gameId: friendGameId,
        roomCode,
        bonusType: "VALID_QUESTIONS",
        points: friendQuestions,
        reason: `유효 질문 ${friendQuestions}개`,
        status: "APPROVED",
        createdAt: friendCompletedAt,
      },
    });
    pointTotals.set(
      ownerId,
      (pointTotals.get(ownerId) ?? 0) + 4 + friendQuestions,
    );
  }

  for (const [id, totalPoints] of pointTotals) {
    await tx.user.update({
      where: { id },
      data: { totalPoints },
    });
  }
}

export async function seedUsbDemo() {
  loadLocalDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL이 필요합니다.");
  }

  const prisma = new PrismaClient();
  try {
    const conflictingUsers = await prisma.user.count({
      where: { school: DEMO.school, isDemo: false },
    });
    if (conflictingUsers > 0) {
      throw new Error(
        "질문초등학교 이름을 사용하는 일반 계정이 있어 시연 자료를 만들지 않았습니다.",
      );
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const studentIds = STUDENT_NAMES.map((_, index) => studentId(index + 1));

    await prisma.$transaction(async (tx) => {
      await removePreviousDemoData(tx, studentIds);
      await createClassAccounts(tx, passwordHash);
      await createInquiryLearningData(tx, studentIds);
      await createQuestionGameData(tx, studentIds);
    }, { timeout: 120_000 });

    const [
      count,
      sessionCount,
      unitDesignCount,
      sharedQuestionCount,
      questionCount,
      commentCount,
      likeCount,
      analysisCount,
      kimQuestionCount,
      kimCommentCount,
      kimLikeCount,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          role: "STUDENT",
          school: DEMO.school,
          grade: DEMO.grade,
          className: DEMO.className,
          isDemo: true,
        },
      }),
      prisma.questionSession.count({ where: { teacherId: DEMO.teacherId } }),
      prisma.unitDesign.count({ where: { teacherId: DEMO.teacherId } }),
      prisma.question.count({
        where: { authorId: DEMO.teacherId, source: "TEACHER_SHARED" },
      }),
      prisma.question.count({ where: { authorId: { in: studentIds } } }),
      prisma.comment.count({ where: { authorId: { in: studentIds } } }),
      prisma.questionLike.count({ where: { userId: { in: studentIds } } }),
      prisma.sessionAnalysis.count({
        where: { scope: "student", studentId: studentIds[0] },
      }),
      prisma.question.count({ where: { authorId: studentIds[0] } }),
      prisma.comment.count({ where: { authorId: studentIds[0] } }),
      prisma.questionLike.count({ where: { userId: studentIds[0] } }),
    ]);
    if (count !== STUDENT_NAMES.length) {
      throw new Error(`시연 학생 수가 ${count}명으로 확인되었습니다.`);
    }
    if (
      sessionCount !== DEMO_SESSION_BLUEPRINTS.length
      || unitDesignCount !== DEMO_UNIT_DESIGN_BLUEPRINTS.length
      || sharedQuestionCount !== DEMO_SESSION_BLUEPRINTS.length * 3
      || questionCount !== 92
      || commentCount !== 93
      || likeCount !== 153
      || analysisCount !== ACTIVITY_SESSION_BLUEPRINTS.length
      || kimQuestionCount !== 11
      || kimCommentCount !== 12
      || kimLikeCount !== 18
    ) {
      throw new Error(
        `시연 자료 수가 예상과 다릅니다: 수업 ${sessionCount}, 참고자료 ${unitDesignCount}, 배포 질문 ${sharedQuestionCount}, 학생 질문 ${questionCount}, 댓글 ${commentCount}, 좋아요 ${likeCount}, 분석 ${analysisCount}`,
      );
    }

    console.log(
      `시연 학급 생성 완료: 김교사, 학생 ${count}명, 질문수업 ${sessionCount}개, 참고자료 ${unitDesignCount}개, 김질문 질문 ${kimQuestionCount}개, 댓글 ${kimCommentCount}개, 좋아요 ${kimLikeCount}개, 수업 분석 ${analysisCount}개`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  seedUsbDemo().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
