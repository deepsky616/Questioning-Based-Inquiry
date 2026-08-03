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
    exploreKorean: "usb-demo-unit-design-explore-korean",
    exploreMath: "usb-demo-unit-design-explore-math",
    future: "usb-demo-unit-design-environment",
  },
  sessionIds: {
    pastKorean: "usb-demo-session-past-korean",
    pastSocial: "usb-demo-session-past-social",
    past: "usb-demo-session-past",
    pastMath: "usb-demo-session-past-math",
    today: "usb-demo-session-today",
    exploreKorean: "usb-demo-session-explore-korean",
    exploreMath: "usb-demo-session-explore-math",
    future: "usb-demo-session-future",
  },
};

export const DEMO_RANKING_CLASS_BLUEPRINTS = [
  { school: "질문초등학교", grade: "4", className: "2", studentCount: 23, averagePoints: 37 },
  { school: "질문초등학교", grade: "4", className: "3", studentCount: 25, averagePoints: 32 },
  { school: "질문초등학교", grade: "4", className: "4", studentCount: 27, averagePoints: 24 },
  { school: "질문초등학교", grade: "4", className: "5", studentCount: 30, averagePoints: 19.5 },
  { school: "대답초등학교", grade: "4", className: "1", studentCount: 24, averagePoints: 38.5 },
  { school: "대답초등학교", grade: "4", className: "2", studentCount: 26, averagePoints: 35.5 },
  { school: "대답초등학교", grade: "4", className: "3", studentCount: 28, averagePoints: 30.5 },
  { school: "대답초등학교", grade: "4", className: "4", studentCount: 29, averagePoints: 23 },
  { school: "대답초등학교", grade: "4", className: "5", studentCount: 30, averagePoints: 18.5 },
  { school: "탐구초등학교", grade: "4", className: "1", studentCount: 25, averagePoints: 37 },
  { school: "탐구초등학교", grade: "4", className: "2", studentCount: 26, averagePoints: 36.5 },
  { school: "탐구초등학교", grade: "4", className: "3", studentCount: 27, averagePoints: 25 },
  { school: "탐구초등학교", grade: "4", className: "4", studentCount: 28, averagePoints: 21.5 },
  { school: "탐구초등학교", grade: "4", className: "5", studentCount: 29, averagePoints: 17 },
];

const RANKING_STUDENT_SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤",
  "장", "임", "한", "오", "서", "신", "권", "황",
  "안", "송", "전", "홍", "문", "양", "손", "배",
];
const RANKING_STUDENT_GIVEN_NAMES = [
  "가온", "나윤", "다온", "라희", "민재", "서윤", "예준", "지우",
  "하린", "도현", "수빈", "채민", "유진", "시온", "주아", "현준",
];

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
    key: "exploreKorean",
    id: DEMO.sessionIds.exploreKorean,
    offsetDays: 1,
    subject: "국어",
    topic: "질문을 만들며 글 읽기",
    semester: "1",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.exploreKorean,
  },
  {
    key: "exploreMath",
    id: DEMO.sessionIds.exploreMath,
    offsetDays: 3,
    subject: "수학",
    topic: "각도를 비교하고 재기",
    semester: "1",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.exploreMath,
  },
  {
    key: "future",
    id: DEMO.sessionIds.future,
    offsetDays: 5,
    subject: "사회",
    topic: "환경을 위한 생활 속 선택",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.future,
  },
];

const ACTIVITY_SESSION_BLUEPRINTS = DEMO_SESSION_BLUEPRINTS.filter(
  ({ key, studentExplore }) => key !== "future" && !studentExplore,
);
const STUDENT_EXPLORE_SESSION_BLUEPRINTS = DEMO_SESSION_BLUEPRINTS.filter(
  ({ key, studentExplore }) => key !== "future" && studentExplore,
);
const ANALYSIS_SESSION_BLUEPRINTS = [
  ...ACTIVITY_SESSION_BLUEPRINTS,
  ...STUDENT_EXPLORE_SESSION_BLUEPRINTS,
];

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

function buildRankingPointTotals(studentCount, averagePoints) {
  const points = Array.from(
    { length: studentCount },
    (_, index) => Math.round(averagePoints) + (index % 11) - 5,
  );
  const targetTotal = Math.round(studentCount * averagePoints);
  let difference = targetTotal - points.reduce((sum, value) => sum + value, 0);
  let index = 0;
  while (difference !== 0) {
    const adjustment = difference > 0 ? 1 : -1;
    points[index % points.length] += adjustment;
    difference -= adjustment;
    index += 1;
  }
  return points;
}

export function buildDemoRankingStudents() {
  let studentIndex = 0;
  return DEMO_RANKING_CLASS_BLUEPRINTS.flatMap((blueprint, classIndex) => {
    const pointTotals = buildRankingPointTotals(
      blueprint.studentCount,
      blueprint.averagePoints,
    );
    return pointTotals.map((totalPoints, index) => {
      const number = index + 1;
      const name = `${
        RANKING_STUDENT_SURNAMES[studentIndex % RANKING_STUDENT_SURNAMES.length]
      }${
        RANKING_STUDENT_GIVEN_NAMES[
          Math.floor(studentIndex / RANKING_STUDENT_SURNAMES.length)
          % RANKING_STUDENT_GIVEN_NAMES.length
        ]
      }`;
      studentIndex += 1;
      return {
        id: `usb-demo-rank-${pad(classIndex + 1)}-${pad(number)}`,
        name,
        school: blueprint.school,
        grade: blueprint.grade,
        className: blueprint.className,
        studentNumber: String(number),
        totalPoints,
      };
    });
  });
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
  achievementExplanations,
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
    achievements: achievementExplanations.map((achievementExplanation, index) => ({
      index,
      explanation: achievementExplanation,
    })),
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
    achievements: [{
      code: "[4국02-05]",
      content: "글이나 자료의 출처가 믿을 만한지 판단한다.",
    }],
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
        "factual",
        "글이나 자료의 출처를 확인할 때 살펴볼 정보는 무엇일까?",
        "자료가 어디에서 왔는지 확인하는 데 필요한 정보를 찾아보는 질문이에요.",
        [["출처", "글이나 자료가 나온 곳"], ["작성자", "글이나 자료를 만든 사람"]],
        "자료에 적힌 작성자, 만든 날짜, 기관 이름을 찾아 표시해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "알맞은 근거는 주장에 어떤 힘을 줄까?",
        "주장과 근거가 어떻게 이어지고 왜 중요한지 관계를 찾는 질문이에요.",
        [["적절성", "내용이나 상황에 알맞은 정도"], ["신뢰", "믿을 수 있다고 생각하는 마음"]],
        "근거가 있을 때와 없을 때 어느 주장이 더 믿음직한지 비교해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "근거의 출처가 믿을 만한지는 주장의 설득력과 어떤 관계가 있을까?",
        "자료의 믿음직함이 주장을 받아들이는 생각에 어떤 영향을 주는지 살펴보는 질문이에요.",
        [["설득력", "다른 사람이 생각을 받아들이게 하는 힘"], ["신뢰성", "내용을 믿을 수 있는 정도"]],
        "같은 주장을 개인의 말과 전문 기관의 자료로 뒷받침했을 때 느낌을 비교해 보세요.",
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
      achievementExplanations: ["글과 자료가 어디에서 왔는지 살펴보고 믿을 만한 내용인지 판단할 수 있어야 한다는 뜻이에요."],
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
    achievements: [{
      code: "[4사09-01]",
      content: "생활 주변에서 찾을 수 있는 여러 가지 문제를 파악하고, 그 문제를 합리적으로 해결하는 능력을 기른다.",
    }],
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
        "factual",
        "우리 지역의 문제를 알아보기 위해 어떤 자료를 모을 수 있을까?",
        "지역 문제의 실제 모습을 확인할 수 있는 자료의 종류를 찾아보는 질문이에요.",
        [["설문", "여러 사람에게 같은 내용을 물어 답을 모으는 조사"], ["현장 조사", "문제가 있는 곳을 직접 살펴보는 조사"]],
        "사진, 관찰 기록, 주민 설문처럼 문제를 확인할 수 있는 자료를 목록으로 만들어 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "같은 지역 문제를 사람마다 다르게 바라보는 까닭은 무엇일까?",
        "생활 모습과 필요가 다르면 문제를 보는 생각도 어떻게 달라지는지 찾는 질문이에요.",
        [["관점", "어떤 일을 바라보는 생각이나 입장"], ["주민", "그 지역에 살고 있는 사람"]],
        "어린이, 어른, 가게 주인이 같은 문제를 어떻게 생각할지 비교해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "여러 주민의 의견을 함께 들으면 해결 방법은 어떻게 달라질까?",
        "다양한 의견이 문제 해결 방법을 정하는 데 어떤 도움을 주는지 생각하는 질문이에요.",
        [["다양성", "서로 다른 여러 모습이나 생각이 있는 것"], ["합의", "의견을 나누어 함께 결정하는 것"]],
        "한 사람의 의견만 들었을 때와 여러 사람의 의견을 들었을 때 찾을 수 있는 방법을 비교해 보세요.",
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
      achievementExplanations: ["우리 주변의 문제를 찾아 원인을 살펴보고 여러 사람이 받아들일 수 있는 해결 방법을 고를 수 있어야 한다는 뜻이에요."],
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
    achievements: [{
      code: "[4과10-01]",
      content: "물이 세 가지 상태로 변할 수 있음을 알고, 우리 주변에서 예를 찾을 수 있다.",
    }],
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
        "factual",
        "물이 증발할 때 눈으로 확인할 수 있는 변화는 무엇일까?",
        "물이 수증기로 변할 때 관찰할 수 있는 모습을 직접 확인하는 질문이에요.",
        [["증발", "액체인 물이 표면에서 수증기로 변하는 현상"], ["수증기", "기체 상태의 물"]],
        "같은 양의 물을 놓아두고 시간이 지날 때 물의 높이가 어떻게 달라지는지 기록해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "물의 상태가 달라져도 물이라고 할 수 있는 까닭은 무엇일까?",
        "모습이 달라져도 같은 물질인지 공통점과 변화를 찾아보는 질문이에요.",
        [["상태", "물질이 고체, 액체, 기체로 나타나는 모습"], ["변화", "모양이나 성질이 달라지는 것"]],
        "얼음이 녹고 다시 어는 과정을 순서대로 그려 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "온도가 달라지면 물의 상태가 변하는 과정은 어떻게 달라질까?",
        "온도와 물의 상태 변화가 서로 어떤 관계를 맺는지 알아보는 질문이에요.",
        [["온도", "차갑고 뜨거운 정도"], ["상태 변화", "물질이 고체, 액체, 기체 사이에서 달라지는 현상"]],
        "물을 차갑게 할 때와 따뜻하게 할 때 나타나는 변화를 화살표로 연결해 보세요.",
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
      achievementExplanations: ["물이 얼음, 물, 수증기의 세 가지 모습으로 바뀔 수 있음을 알고 생활 속 예를 찾을 수 있어야 한다는 뜻이에요."],
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
    achievements: [{
      code: "[4수04-03]",
      content: "탐구 문제를 해결하기 위해 자료를 수집, 정리하여 막대그래프나 꺾은선그래프로 나타내고 해석할 수 있다.",
    }],
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
        "factual",
        "막대그래프의 한 눈금은 얼마를 나타낼까?",
        "그래프의 눈금 간격을 읽어 각 막대가 나타내는 수를 확인하는 질문이에요.",
        [["눈금 간격", "이웃한 눈금 사이의 수 차이"], ["세로축", "그래프에서 위아래 방향으로 수를 나타내는 축"]],
        "세로축에서 이웃한 두 눈금의 수를 빼 한 눈금의 크기를 찾아보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "표와 그래프는 자료를 이해하는 데 각각 어떤 도움을 줄까?",
        "두 표현 방법의 특징과 쓰임을 비교해 관계를 찾는 질문이에요.",
        [["표", "자료를 칸에 맞추어 정리한 것"], ["그래프", "자료의 크기나 변화를 그림처럼 나타낸 것"]],
        "정확한 수를 찾을 때와 크기를 빠르게 비교할 때 무엇이 편한지 살펴보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "자료의 변화는 막대그래프와 꺾은선그래프에서 어떻게 다르게 드러날까?",
        "그래프의 종류에 따라 자료의 크기와 변화가 어떻게 보이는지 비교하는 질문이에요.",
        [["막대그래프", "막대의 길이로 자료의 크기를 비교하는 그래프"], ["꺾은선그래프", "점을 선으로 이어 시간에 따른 변화를 나타내는 그래프"]],
        "같은 자료를 두 그래프로 나타내고 크기 비교와 변화 찾기에 각각 알맞은 그래프를 골라 보세요.",
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
      achievementExplanations: ["궁금한 문제에 맞는 자료를 모아 그래프로 나타내고, 그래프에서 알 수 있는 내용을 설명할 수 있어야 한다는 뜻이에요."],
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
    achievements: [{
      code: "[4과10-02]",
      content: "물이 얼 때, 얼음이 녹을 때, 물이 증발할 때와 끓을 때, 수증기가 응결할 때의 변화를 관찰할 수 있다.",
    }],
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
        "factual",
        "물이 끓을 때 나타나는 모습은 무엇일까?",
        "물이 끓는 동안 눈으로 볼 수 있는 변화를 관찰해 확인하는 질문이에요.",
        [["끓음", "액체 전체에서 기체로 변하는 현상"], ["기포", "액체 안에서 생기는 기체 방울"]],
        "물이 끓기 전과 끓는 동안 기포의 위치와 움직임을 안전하게 관찰해 기록해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "물질의 상태 변화와 온도는 어떤 관계가 있을까?",
        "온도가 달라질 때 물질의 상태가 변하는 까닭과 관계를 찾는 질문이에요.",
        [["온도", "차갑고 뜨거운 정도를 나타내는 값"], ["관계", "두 가지가 서로 이어지는 방식"]],
        "얼음, 물, 수증기가 되는 때의 온도와 모습을 순서대로 떠올려 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "증발과 끓음은 어떤 점이 같고 다를까?",
        "물이 수증기로 변하는 두 현상의 공통점과 차이점을 비교하는 질문이에요.",
        [["증발", "액체 표면에서 천천히 기체로 변하는 현상"], ["끓음", "액체 전체에서 빠르게 기체로 변하는 현상"]],
        "변화가 일어나는 곳, 빠르기, 온도를 기준으로 두 현상을 표에 정리해 보세요.",
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
      achievementExplanations: ["물이 얼고 녹거나 수증기로 바뀔 때 어떤 모습이 나타나는지 직접 관찰할 수 있어야 한다는 뜻이에요."],
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
    key: "exploreKorean",
    id: DEMO.unitDesignIds.exploreKorean,
    title: "질문을 만들며 글을 읽어요",
    subject: "국어",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "읽기",
    coreIdea: "읽기 전과 읽는 중에 질문을 만들고 답을 예상하면 글의 내용을 깊이 이해하고 자신의 읽기 과정을 스스로 점검할 수 있다.",
    achievements: [{
      code: "[4국02-03]",
      content: "질문을 활용하여 글을 예측하며 읽고 자신의 읽기 과정을 점검한다.",
    }],
    selectedKeywords: ["질문", "예측", "읽기 과정"],
    coreSentences: [
      "질문은 제목, 그림, 알고 있는 내용에서 궁금한 점을 찾아 만드는 것이다.",
      "예상한 답과 글의 내용을 비교하면 이해한 부분과 더 살펴볼 부분을 찾을 수 있다.",
    ],
    essentialQuestions: [
      "좋은 질문은 글을 이해하는 데 어떤 도움을 줄까?",
      "읽는 사람에 따라 글에서 떠올리는 질문은 왜 달라질까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "제목과 그림을 보고 글에서 알게 될 내용을 어떻게 예상할 수 있을까?",
        "글을 읽기 전에 확인할 수 있는 정보를 찾아 내용을 예상하는 질문이에요.",
        [["제목", "글의 중심 내용을 짧게 나타낸 말"], ["예측", "앞으로 알게 될 내용을 미리 생각하는 것"]],
        "제목과 그림에서 눈에 띄는 낱말이나 모습을 세 가지 찾아 적어 보세요.",
      ),
      inquiryQuestion(
        "factual",
        "글을 읽다가 뜻을 모르거나 이해하기 어려운 부분은 어디일까?",
        "읽는 동안 이해가 멈추는 부분을 직접 찾아 질문으로 바꾸는 활동이에요.",
        [["읽기 과정", "글을 읽고 이해해 가는 순서와 방법"], ["점검", "잘 이해하고 있는지 살펴보는 것"]],
        "읽다가 다시 읽은 문장이나 뜻을 확인하고 싶은 낱말에 표시해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "질문을 만들며 읽으면 글의 내용을 이해하는 방법이 어떻게 달라질까?",
        "질문과 글 이해가 서로 어떤 관계가 있는지 생각하는 질문이에요.",
        [["이해", "내용의 뜻과 관계를 알아가는 것"], ["질문", "궁금하거나 더 알고 싶은 것을 묻는 말"]],
        "질문 없이 읽었을 때와 질문을 적으며 읽었을 때 기억나는 내용을 비교해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "예상한 답과 글에서 찾은 답을 비교하면 새로운 생각은 어떻게 생길까?",
        "처음 예상과 실제 내용을 비교하는 일이 생각을 넓히는 까닭을 찾는 질문이에요.",
        [["예상", "어떤 내용일지 미리 생각한 것"], ["근거", "생각을 뒷받침하는 글 속 내용"]],
        "내 예상, 글에서 찾은 답, 생각이 달라진 까닭을 세 칸으로 나누어 적어 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "같은 글을 읽는 친구들은 모두 같은 질문을 만들어야 할까?",
        "서로 다른 경험과 관심이 질문에 미치는 영향을 생각하고 판단하는 질문이에요.",
        [["관점", "어떤 내용을 바라보는 생각이나 입장"], ["경험", "직접 보고 듣거나 해 본 일"]],
        "친구와 만든 질문을 바꾸어 읽고 같거나 다른 까닭을 이야기해 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "글을 읽기 전과 읽는 중에 궁금한 점을 질문으로 만들면 내용을 예상하고 내가 제대로 이해했는지 확인할 수 있어요.",
      lifeConnection: "설명서, 동화, 안내문을 읽을 때도 먼저 궁금한 점을 떠올리면 필요한 내용을 더 쉽게 찾을 수 있어요.",
      keywords: [["질문", "궁금하거나 더 알고 싶은 것을 묻는 말"], ["예측", "글의 내용을 미리 생각하는 것"], ["읽기 과정", "글을 읽고 이해해 가는 순서와 방법"]],
      achievementExplanations: ["글을 읽기 전이나 읽는 중에 질문을 만들고 답을 예상하며, 잘 이해되지 않는 부분을 스스로 찾아 다시 살펴볼 수 있어야 한다는 뜻이에요."],
      sentenceExplanations: [
        "제목과 그림, 내가 알고 있는 내용을 떠올리면 읽기 전에 질문을 만들 수 있어요.",
        "예상한 답과 글에서 찾은 답을 비교하면 이해한 정도를 확인할 수 있어요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "질문을 만들기 전과 만든 뒤 글에서 찾은 내용이 어떻게 달라지는지 비교해 보세요.", perspectives: ["내용 예상", "집중해서 읽기", "이해 점검"] },
        { thinkingFocus: "친구의 경험과 관심이 어떤 질문으로 이어졌는지 살펴보세요.", perspectives: ["나의 경험", "친구의 관점", "글 속 정보"] },
      ],
    }),
  },
  {
    key: "exploreMath",
    id: DEMO.unitDesignIds.exploreMath,
    title: "각도를 비교하고 재어 보아요",
    subject: "수학",
    gradeRange: "3-4",
    grade: DEMO.grade,
    area: "도형과 측정",
    coreIdea: "각의 크기는 두 변이 벌어진 정도이며 각도기를 바르게 사용하면 각도를 수로 나타내고 여러 각을 정확하게 비교할 수 있다.",
    achievements: [{
      code: "[4수03-24]",
      content: "각의 크기의 단위인 1도(°)를 알고, 각도기를 이용하여 각의 크기를 측정하고 어림할 수 있다.",
    }],
    selectedKeywords: ["각", "각도", "1도", "각도기"],
    coreSentences: [
      "각의 크기는 두 변의 길이가 아니라 두 변이 벌어진 정도로 정한다.",
      "각도기의 중심과 밑금을 각의 꼭짓점과 한 변에 맞추면 각도를 잴 수 있다.",
    ],
    essentialQuestions: [
      "각의 크기를 정확하게 비교하려면 무엇을 기준으로 해야 할까?",
      "각도를 어림하고 재는 능력은 생활 속에서 어떻게 쓰일까?",
    ],
    inquiryQuestions: [
      inquiryQuestion(
        "factual",
        "교실 물건에서 찾은 각은 각각 몇 도일까?",
        "생활 속 여러 각을 찾아 각도기로 직접 재어 확인하는 질문이에요.",
        [["각도", "각의 크기를 수로 나타낸 것"], ["1도", "각의 크기를 재는 기본 단위"]],
        "책 모서리, 열린 문, 가위에서 각을 찾고 먼저 어림한 뒤 각도기로 재어 보세요.",
      ),
      inquiryQuestion(
        "factual",
        "각도기로 각을 잴 때 중심과 밑금은 어디에 맞추어야 할까?",
        "각도기를 바르게 놓는 방법을 차례대로 확인하는 질문이에요.",
        [["각도기", "각의 크기를 재는 도구"], ["꼭짓점", "각을 이루는 두 변이 만나는 점"]],
        "각도기의 중심, 밑금, 숫자를 읽는 순서를 그림에 표시해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "두 변의 길이가 달라져도 벌어진 정도가 같으면 각의 크기는 왜 같을까?",
        "변의 길이와 각의 크기가 어떤 관계인지 탐구하는 질문이에요.",
        [["변", "각을 이루는 두 반직선"], ["벌어진 정도", "두 변 사이가 열린 크기"]],
        "변의 길이는 다르지만 벌어진 정도가 같은 각을 그려 겹쳐 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "각도를 어림한 값과 실제로 잰 값의 차이는 어떻게 줄일 수 있을까?",
        "기준이 되는 각을 이용하면 어림이 정확해지는 까닭을 찾는 질문이에요.",
        [["어림", "정확한 값과 가까운 값을 짐작하는 것"], ["기준각", "다른 각의 크기를 짐작할 때 기준으로 삼는 각"]],
        "직각과 반직각을 기준으로 여러 각을 어림한 뒤 잰 값과 차이를 기록해 보세요.",
      ),
      inquiryQuestion(
        "controversial",
        "생활 속 각도는 가까운 값으로 어림해도 될까, 언제나 정확하게 재야 할까?",
        "사용 목적에 따라 어림과 정확한 측정 가운데 알맞은 방법을 판단하는 질문이에요.",
        [["정확성", "실제 값에 맞는 정도"], ["측정 목적", "값을 재어 어디에 사용하려는지 정한 것"]],
        "그림 그리기, 책상 만들기, 길 찾기처럼 서로 다른 상황에서 필요한 정확성을 비교해 보세요.",
      ),
    ],
    learningGuides: learningGuide({
      explanation: "각도는 두 변이 얼마나 벌어져 있는지를 나타낸 값이며, 각도기를 사용하면 눈으로만 비교하기 어려운 각도도 정확하게 잴 수 있어요.",
      lifeConnection: "문이 열린 정도, 시계바늘 사이, 운동할 때 몸을 굽힌 정도처럼 생활 곳곳에서 각도를 찾을 수 있어요.",
      keywords: [["각", "한 점에서 나온 두 반직선으로 이루어진 도형"], ["각도", "두 변이 벌어진 정도를 수로 나타낸 것"], ["1도", "각도를 재는 기본 단위"], ["각도기", "각도를 재거나 그릴 때 쓰는 도구"]],
      achievementExplanations: ["1도를 각의 크기를 나타내는 단위로 알고, 각도기를 바르게 놓아 각도를 재며 재기 전에 가까운 값을 짐작할 수 있어야 한다는 뜻이에요."],
      sentenceExplanations: [
        "각의 크기는 변의 길이가 아니라 두 변이 벌어진 정도로 비교해요.",
        "각도기의 중심과 밑금을 바르게 맞춘 뒤 시작한 쪽의 눈금을 읽어요.",
      ],
      essentialQuestionGuides: [
        { thinkingFocus: "눈으로 비교한 결과와 각도기로 잰 결과를 비교해 보세요.", perspectives: ["벌어진 정도", "측정값", "도구 사용 방법"] },
        { thinkingFocus: "정확한 각도가 필요한 상황과 어림으로 충분한 상황을 나누어 보세요.", perspectives: ["생활의 편리함", "안전", "정확성"] },
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
    achievements: [{
      code: "[4사07-01]",
      content: "자원의 희소성으로 인해 경제활동에서 선택의 문제가 발생함을 이해하고, 경제활동에서 합리적 선택의 방법을 탐색한다.",
    }],
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
        "factual",
        "우리 교실에서 다시 쓸 수 있는 물건에는 무엇이 있을까?",
        "한 번 사용한 뒤에도 다시 사용할 수 있는 물건을 찾아보는 질문이에요.",
        [["재사용", "물건을 버리지 않고 다시 사용하는 것"], ["일회용품", "한 번 쓰고 버리도록 만든 물건"]],
        "교실 물건을 살펴보고 그대로 다시 쓰거나 다른 쓰임으로 바꿀 수 있는 것을 적어 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "우리의 소비 습관은 환경에 어떤 영향을 줄까?",
        "물건을 사고 쓰고 버리는 과정이 자연과 어떻게 이어지는지 찾는 질문이에요.",
        [["소비", "필요한 물건이나 서비스를 사서 사용하는 일"], ["자원", "생활에 필요한 것을 만들 때 사용하는 자연의 재료"]],
        "물건 하나가 만들어져 버려질 때까지 필요한 재료와 에너지를 생각해 보세요.",
      ),
      inquiryQuestion(
        "conceptual",
        "물건을 다시 쓰는 행동은 자원과 쓰레기의 양에 어떤 변화를 줄까?",
        "재사용이 자원 소비와 쓰레기 발생에 어떻게 이어지는지 관계를 찾는 질문이에요.",
        [["자원 절약", "필요한 자연의 재료를 아껴 쓰는 것"], ["쓰레기 감소", "버려지는 물건의 양이 줄어드는 것"]],
        "물건을 새로 살 때와 다시 쓸 때 필요한 자원과 생기는 쓰레기를 비교해 보세요.",
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
      achievementExplanations: ["쓸 수 있는 자원이 한정되어 있음을 알고, 필요한 것과 환경에 미치는 영향을 함께 생각해 선택할 수 있어야 한다는 뜻이에요."],
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
  exploreKorean: [
    "제목을 보고 글의 내용을 어떻게 예상할 수 있을까요?",
    "글을 읽기 전에 만든 질문은 읽는 동안 어떻게 달라질까요?",
    "모르는 낱말을 질문으로 바꾸면 글을 이해하는 데 도움이 될까요?",
    "같은 글을 읽어도 친구마다 질문이 다른 까닭은 무엇일까요?",
    "답을 바로 찾을 수 없는 질문도 글 읽기에 도움이 될까요?",
  ],
  exploreMath: [
    "두 변의 길이가 달라도 벌어진 정도가 같으면 각도도 같을까요?",
    "각도기의 안쪽 눈금과 바깥쪽 눈금은 언제 골라 읽어야 할까요?",
    "직각을 기준으로 각의 크기를 어떻게 어림할 수 있을까요?",
    "생활 속에서 각도를 정확하게 재야 하는 경우는 언제일까요?",
    "각도기를 놓는 위치가 달라지면 측정값은 어떻게 달라질까요?",
  ],
};

const SESSION_QUESTION_TYPES = {
  pastKorean: [
    "conceptual",
    "factual",
    "controversial",
    "conceptual",
    "controversial",
  ],
  pastSocial: [
    "factual",
    "conceptual",
    "controversial",
    "controversial",
    "controversial",
  ],
  past: [
    "conceptual",
    "factual",
    "factual",
    "conceptual",
    "factual",
  ],
  pastMath: [
    "conceptual",
    "conceptual",
    "factual",
    "controversial",
    "conceptual",
  ],
  today: [
    "factual",
    "conceptual",
    "conceptual",
    "factual",
    "conceptual",
  ],
  exploreKorean: [
    "factual",
    "conceptual",
    "conceptual",
    "controversial",
    "controversial",
  ],
  exploreMath: [
    "conceptual",
    "factual",
    "conceptual",
    "controversial",
    "factual",
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
  {
    sessionKey: "exploreKorean",
    content: "글을 읽기 전에 만든 질문은 글을 이해하는 방법을 어떻게 바꿀까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "exploreKorean",
    content: "같은 글을 읽은 친구들이 서로 다른 질문을 만드는 까닭은 무엇일까요?",
    closure: "open",
    cognitive: "controversial",
  },
  {
    sessionKey: "exploreMath",
    content: "각의 두 변이 길어져도 벌어진 정도가 같으면 각도는 왜 같을까요?",
    closure: "open",
    cognitive: "conceptual",
  },
  {
    sessionKey: "exploreMath",
    content: "문이 열린 각도를 정확하게 재려면 각도기를 어떻게 놓아야 할까요?",
    closure: "open",
    cognitive: "factual",
  },
];

const STUDENT_ANALYSIS_COPY = {
  pastKorean: {
    summary: "질문아, 이번 '주장과 근거의 적절성 판단하기' 수업에서 질문 2개를 만들고, 댓글 2개와 좋아요 2개로 친구의 생각에도 참여했구나! 근거를 어떻게 살펴봐야 하는지 궁금해하고 친구 생각에 반응한 모습이 좋아.",
    insights: "다음에는 같은 주장에 알맞은 근거와 알맞지 않은 근거를 하나씩 비교하는 질문을 만들어보자. 예를 들어, '이 근거가 글쓴이의 주장을 뒷받침한다고 볼 수 있는 까닭은 무엇일까?'처럼 물어볼 수 있어.",
    relevanceInsights: "질문아, 두 질문 모두 주장과 근거라는 수업 주제에 잘 맞고 한 문장으로 또렷하게 표현했어. 다음에는 실제 글의 근거 한 가지를 예로 넣으면 생각을 더 구체적으로 나눌 수 있어.",
    growthInsights: "이번이 기록에 남은 첫 질문수업이야. 사실을 찾는 데서 멈추지 않고 같은 근거로 서로 다른 주장이 나올 수 있는지 생각했네. 다음 수업에서도 여러 사람의 관점을 비교해 보면 질문이 더 깊어질 거야.",
    rewriteExample: "원래 질문: 글쓴이의 주장을 믿으려면 어떤 근거를 먼저 살펴봐야 할까요? → 더 좋은 질문: 글쓴이의 주장을 믿을 만하다고 판단하려면 근거의 출처와 내용을 어떤 순서로 살펴봐야 할까요? (살펴볼 기준과 순서를 함께 생각할 수 있는 질문이야!)",
  },
  pastSocial: {
    summary: "질문아, 이번 '우리 지역의 문제와 해결 방법' 수업에서 질문 2개를 만들고, 댓글 2개와 좋아요 4개로 친구들과 생각을 나눴구나! 어린이의 불편과 주민의 서로 다른 의견을 함께 살펴본 점이 좋아.",
    insights: "다음에는 우리 지역의 실제 문제 하나를 정하고 원인, 영향을 받는 사람, 해결 방법을 차례로 묻는 질문을 만들어보자. 예를 들어, '학교 앞 교통 문제를 해결하려면 누구의 의견을 먼저 듣고 어떤 기준으로 방법을 골라야 할까?'처럼 물어볼 수 있어.",
    relevanceInsights: "질문아, 두 질문 모두 지역 문제와 주민 의견이라는 수업 주제에 잘 맞아. 다음에는 우리 지역에서 직접 보거나 들은 사례를 한 가지 넣으면 질문에 담긴 생각이 더욱 구체적으로 드러날 거야.",
    growthInsights: "지난 국어 수업에서는 주장과 근거의 관계를 살펴봤는데, 이번에는 어린이와 주민처럼 여러 사람의 관점을 비교하고 해결 방법을 고르는 기준까지 생각했네. 한 가지 생각에서 여러 사람의 생각으로 질문의 범위가 넓어졌어.",
    rewriteExample: "원래 질문: 지역 문제를 해결할 때 주민의 의견이 다르면 어떻게 정해야 할까요? → 더 좋은 질문: 지역 문제에 대한 주민의 의견이 다를 때 모두에게 도움이 되는 해결 방법을 어떤 기준으로 정해야 할까요? (여러 의견을 비교하고 공정한 선택 기준까지 생각할 수 있는 질문이야!)",
  },
  past: {
    summary: "질문아, 이번 '물의 세 가지 상태' 수업에서 질문 2개를 만들고, 댓글 4개와 좋아요 4개로 친구들과 활발하게 생각을 나눴구나! 물이 얼고 녹을 때 부피와 양이 어떻게 달라지는지 관찰할 수 있는 질문을 만든 점이 좋아.",
    insights: "다음에는 예상과 실제 관찰 결과를 비교하는 질문을 만들어보자. 예를 들어, '같은 양의 물을 서로 다른 그릇에 얼리면 얼음의 모양과 부피는 어떻게 달라질까?'처럼 조건을 정해 물어볼 수 있어.",
    relevanceInsights: "질문아, 두 질문 모두 물이 얼고 녹는 상태 변화와 직접 이어지고, 관찰로 확인할 수 있게 작성했어. 다음에는 물의 양이나 그릇의 크기처럼 같게 해야 할 조건을 질문에 넣으면 더 정확하게 탐구할 수 있어.",
    growthInsights: "지난 사회 수업에서는 여러 사람의 관점을 비교했다면, 이번에는 자연 현상을 관찰하고 확인할 조건을 생각했네. 까닭을 묻는 질문과 직접 확인할 수 있는 질문을 함께 사용해 질문의 종류도 다양해졌어.",
    rewriteExample: "원래 질문: 얼음이 녹은 물의 양은 녹기 전과 같을까요? → 더 좋은 질문: 같은 양의 물을 얼렸다가 다시 녹이면 얼리기 전과 비교해 부피와 무게는 각각 어떻게 달라질까요? (비교할 대상을 분명히 하고 관찰할 내용을 나누어 확인할 수 있는 질문이야!)",
  },
  pastMath: {
    summary: "질문아, 이번 '자료를 표와 그래프로 나타내기' 수업에서 질문 2개를 만들고, 댓글 2개와 좋아요 3개로 친구들의 활동에도 참여했구나! 같은 자료도 나타내는 방법에 따라 다르게 보일 수 있는지 생각한 점이 좋아.",
    insights: "다음에는 같은 자료를 두 가지 그래프로 직접 나타내고 어떤 그래프가 더 알맞은지 까닭을 묻는 질문을 만들어보자. 자료의 종류, 비교할 항목, 눈금 간격을 기준으로 판단하면 생각을 분명하게 설명할 수 있어.",
    relevanceInsights: "질문아, 두 질문 모두 표와 그래프를 비교하고 자료에 알맞은 표현 방법을 찾는 수업 목표에 잘 맞아. 다음에는 어떤 자료를 비교하려는지 질문에 구체적으로 넣으면 친구들도 뜻을 더 쉽게 이해할 수 있어.",
    growthInsights: "지난 과학 수업에서는 상태 변화를 관찰할 조건을 생각했다면, 이번에는 자료를 어떤 방법으로 나타내야 차이를 잘 읽을 수 있는지 살펴봤네. 관찰한 결과를 표현하고 해석하는 단계까지 생각이 이어졌어.",
    rewriteExample: "원래 질문: 어떤 그래프를 써야 자료의 차이가 가장 잘 보일까요? → 더 좋은 질문: 항목별 수의 차이를 가장 쉽게 비교하려면 어떤 그래프를 사용해야 하며 그 까닭은 무엇일까요? (그래프를 고르는 기준과 까닭을 함께 설명할 수 있는 질문이야!)",
  },
  today: {
    summary: "질문아, 이번 '온도에 따른 상태 변화' 수업에서 질문 3개를 만들고, 댓글 2개와 좋아요 5개로 친구들과 적극적으로 소통했구나! 증발, 겨울철 수도관, 환경 문제까지 상태 변화를 생활 속 여러 상황과 연결한 점이 좋아.",
    insights: "다음에는 한 질문 안에서 바꾸는 조건과 같게 두는 조건을 분명히 정해보자. 예를 들어, '물의 양과 그릇의 넓이를 같게 할 때 온도에 따라 증발하는 시간은 어떻게 달라질까?'처럼 직접 확인할 수 있는 질문으로 발전시킬 수 있어.",
    relevanceInsights: "질문아, 세 질문 모두 온도에 따른 상태 변화라는 수업 주제에 잘 맞고, 원리뿐 아니라 생활의 편리함과 환경까지 생각했어. 다음에는 온도, 바람, 넓이 가운데 비교할 조건 하나를 골라 질문에 넣으면 더욱 정확하게 탐구할 수 있어.",
    growthInsights: "지난 수학 수업에서는 질문 2개로 자료를 표현하고 해석하는 방법을 살펴봤는데, 이번에는 질문 3개를 만들며 과학 개념을 생활 문제와 환경까지 연결했네. 하나의 현상을 여러 조건과 관점에서 살피는 힘이 자랐어.",
    rewriteExample: "원래 질문: 온도가 높아질수록 물은 언제나 더 빨리 증발할까요? → 더 좋은 질문: 물의 양과 그릇의 넓이가 같을 때 온도가 높아질수록 물이 증발하는 속도는 어떻게 달라질까요? (같게 둘 조건과 바꿀 조건이 분명해서 직접 비교하고 확인할 수 있는 질문이야!)",
  },
  exploreKorean: {
    summary: "질문아, 이번 '질문을 만들며 글 읽기' 수업에서 읽기 전 질문과 친구마다 다른 질문이 생기는 까닭을 탐구했구나! 질문을 글 이해와 친구의 관점에 연결한 점이 좋아.",
    insights: "다음에는 질문을 만든 때를 읽기 전, 읽는 중, 읽은 뒤로 나누고 각 질문이 어떤 도움을 주었는지 비교해 보자.",
    relevanceInsights: "질문아, 두 질문 모두 질문을 활용해 글을 예측하고 읽기 과정을 점검하는 수업 목표에 잘 맞아. 다음에는 실제로 읽은 글의 제목이나 한 문장을 넣으면 질문이 더 구체적으로 드러날 거야.",
    growthInsights: "지난 과학 수업에서 관찰 조건을 생각한 데 이어, 이번에는 내 생각이 글을 읽는 동안 어떻게 달라지는지 스스로 살펴봤네. 질문을 학습 방법으로 사용하는 힘이 자랐어.",
    rewriteExample: "원래 질문: 글을 읽기 전에 만든 질문은 글을 이해하는 방법을 어떻게 바꿀까요? → 더 좋은 질문: 제목을 보고 만든 질문에 답을 예상한 뒤 글을 읽으면 중심 내용을 찾는 방법이 어떻게 달라질까요? (질문을 만든 때와 확인할 내용을 분명하게 비교할 수 있어!)",
  },
  exploreMath: {
    summary: "질문아, 이번 '각도를 비교하고 재기' 수업에서 각의 크기와 각도기 사용 방법을 탐구했구나! 각의 모양을 생활 속 문과 연결해 직접 확인할 수 있게 질문한 점이 좋아.",
    insights: "다음에는 먼저 각도를 어림하고 각도기로 잰 뒤 두 값의 차이가 생긴 까닭을 설명하는 질문으로 발전시켜 보자.",
    relevanceInsights: "질문아, 두 질문 모두 각의 크기는 벌어진 정도로 정하고 각도기로 측정한다는 수업 내용에 잘 맞아. 다음에는 비교할 각이나 각도기의 기준선을 질문에 넣으면 더욱 정확하게 탐구할 수 있어.",
    growthInsights: "지난 국어 수업에서는 질문으로 읽기 과정을 점검했고, 이번에는 예상한 각도와 실제 측정값을 비교하는 방법으로 생각을 확인했네. 교과가 달라도 예상하고 확인하는 탐구 흐름을 잘 이어 갔어.",
    rewriteExample: "원래 질문: 문이 열린 각도를 정확하게 재려면 각도기를 어떻게 놓아야 할까요? → 더 좋은 질문: 문의 경첩을 각의 꼭짓점으로 볼 때 각도기의 중심과 밑금을 어디에 맞추어야 열린 각도를 정확하게 잴 수 있을까요? (측정할 각과 도구를 놓는 기준이 분명해!)",
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
    ANALYSIS_SESSION_BLUEPRINTS.map((blueprint) => [blueprint.key, blueprint]),
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
      createdDays: Math.min(0, session.offsetDays + 1),
    });
  }

  for (let studentIndex = 1; studentIndex < studentIds.length; studentIndex += 1) {
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      const session = ACTIVITY_SESSION_BLUEPRINTS[
        (studentIndex + questionIndex) % ACTIVITY_SESSION_BLUEPRINTS.length
      ];
      const bank = SESSION_QUESTION_BANKS[session.key];
      const bankIndex = (studentIndex + questionIndex * 2) % bank.length;
      const content = bank[bankIndex];
      const inquiryType = SESSION_QUESTION_TYPES[session.key][bankIndex];
      questions.push({
        id: `usb-demo-question-${pad(studentIndex + 1)}-${pad(questionIndex + 1)}`,
        authorId: studentIds[studentIndex],
        sessionId: session.id,
        content,
        context: session.topic,
        closure: questionIndex === 0 && studentIndex % 4 === 0 ? "closed" : "open",
        cognitive: inquiryType,
        inquiryType,
        createdDays: Math.min(
          0,
          session.offsetDays + 1 + (studentIndex % 2),
        ),
      });
    }
  }

  for (const [sessionIndex, session] of STUDENT_EXPLORE_SESSION_BLUEPRINTS.entries()) {
    const bank = SESSION_QUESTION_BANKS[session.key];
    for (const [questionIndex, content] of bank.entries()) {
      const authorIndex = 1 + sessionIndex * bank.length + questionIndex;
      questions.push({
        id: `usb-demo-explore-question-${session.key}-${pad(questionIndex + 1)}`,
        authorId: studentIds[authorIndex],
        sessionId: session.id,
        content,
        context: session.topic,
        closure: "open",
        cognitive: SESSION_QUESTION_TYPES[session.key][questionIndex],
        inquiryType: SESSION_QUESTION_TYPES[session.key][questionIndex],
        createdDays: 0,
      });
    }
  }

  const kimQuestions = questions.filter(({ authorId }) => authorId === studentIds[0]);
  const comments = [];
  for (let studentIndex = 0; studentIndex < studentIds.length; studentIndex += 1) {
    const authorId = studentIds[studentIndex];
    const count = studentIndex === 0 ? 12 : 4;
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
    const count = studentIndex === 0 ? 18 : 6;
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

  const classInquiryQuestions = buildDemoClassInquiryQuestionRefs(questions);
  distributeClassInquiryComments(
    comments,
    questions,
    classInquiryQuestions,
    studentIds[0],
  );
  distributeClassInquiryLikes(
    likes,
    questions,
    classInquiryQuestions,
    studentIds[0],
  );

  const questionById = new Map(
    [...questions, ...classInquiryQuestions]
      .map((question) => [question.id, question]),
  );
  const analyses = ANALYSIS_SESSION_BLUEPRINTS.map((session, index) => {
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

  return { questions, classInquiryQuestions, comments, likes, analyses };
}

export function buildDemoSeedExpectedCounts(studentIds) {
  const activityPlans = buildDemoLearningActivityPlans(studentIds);
  return {
    sessionCount: DEMO_SESSION_BLUEPRINTS.length,
    unitDesignCount: DEMO_UNIT_DESIGN_BLUEPRINTS.length,
    sharedQuestionCount: activityPlans.classInquiryQuestions.length,
    questionCount: activityPlans.questions.length,
    commentCount: activityPlans.comments.length,
    likeCount: activityPlans.likes.length,
    analysisCount: activityPlans.analyses.length,
    kimQuestionCount: activityPlans.questions.filter(
      ({ authorId }) => authorId === studentIds[0],
    ).length,
    kimCommentCount: activityPlans.comments.filter(
      ({ authorId }) => authorId === studentIds[0],
    ).length,
    kimLikeCount: activityPlans.likes.filter(
      ({ userId }) => userId === studentIds[0],
    ).length,
  };
}

const CLASS_INQUIRY_FLOW = [
  {
    type: "factual",
    contentGroup: "사실 확인",
    lessonPhase: "기초 확인",
    rationale: "먼저 학생 질문에서 직접 확인할 사실과 핵심 낱말을 살펴보도록 배치했습니다.",
  },
  {
    type: "conceptual",
    contentGroup: "관계와 까닭",
    lessonPhase: "관계 탐구",
    rationale: "확인한 사실을 바탕으로 까닭과 관계를 깊이 생각하도록 배치했습니다.",
  },
  {
    type: "controversial",
    contentGroup: "판단과 토론",
    lessonPhase: "적용과 판단",
    rationale: "앞에서 탐구한 내용을 생활에 적용하고 여러 관점에서 판단하도록 배치했습니다.",
  },
];

const CLASS_INQUIRY_COMMENT_CONTENTS = {
  factual: [
    "수업 자료에서 확인할 수 있는 사실과 낱말의 뜻을 먼저 찾아보면 좋겠어요.",
    "친구들이 찾은 사례를 함께 모으면 이 질문에 더 정확하게 답할 수 있을 것 같아요.",
  ],
  conceptual: [
    "앞에서 확인한 사실을 서로 연결하면 왜 그런지 더 분명하게 설명할 수 있을 것 같아요.",
    "한 가지 사례뿐 아니라 다른 상황에서도 같은 관계가 나타나는지 비교해 보고 싶어요.",
  ],
  controversial: [
    "서로 다른 선택의 좋은 점과 어려운 점을 비교한 뒤 우리 반의 판단 기준을 정해 보면 좋겠어요.",
    "생각이 다른 친구의 근거도 함께 들으면 더 공정한 해결 방법을 찾을 수 있을 것 같아요.",
  ],
};

const CLASS_INQUIRY_FLOW_BASIS = {
  flowId: "cognitive-development",
  flowTitle: "인지적 발달 흐름",
  flowAxis: "사실 확인 → 관계와 까닭 → 적용과 판단",
};

function sharedQuestionId(sessionKey, index) {
  return `usb-demo-shared-question-${sessionKey}-${pad(index + 1)}`;
}

function buildPublishedClassInquiryQuestions(session, design, studentQuestions) {
  if (session.studentExplore) return [];
  return buildDemoClassInquiryQuestions(design, session.id, studentQuestions);
}

function buildDemoClassInquiryQuestionRefs(studentQuestions) {
  const designById = new Map(
    DEMO_UNIT_DESIGN_BLUEPRINTS.map((design) => [design.id, design]),
  );
  return ACTIVITY_SESSION_BLUEPRINTS.flatMap((session, sessionIndex) => {
    return buildPublishedClassInquiryQuestions(
      session,
      designById.get(session.unitDesignId),
      studentQuestions,
    ).map((question, index) => ({
      id: sharedQuestionId(session.key, index),
      sessionId: session.id,
      sessionIndex,
      type: question.type,
      priority: index + 1,
    }));
  });
}

function selectAvailableActivity(
  activities,
  sourceQuestionById,
  usedIds,
  sessionId,
  targetAuthorId,
  preferredParticipantId,
  participantKey,
  excludedParticipantIds = new Set(),
) {
  const available = activities.filter((activity) => {
    const sourceQuestion = sourceQuestionById.get(activity.questionId);
    return (
      !usedIds.has(activity.id)
      && sourceQuestion?.sessionId === sessionId
      && !excludedParticipantIds.has(activity[participantKey])
    );
  });
  const candidates = available.filter((activity) => (
    sourceQuestionById.get(activity.questionId)?.authorId !== targetAuthorId
  ));
  return (
    candidates.find(
      (activity) => activity[participantKey] === preferredParticipantId,
    )
    ?? candidates[0]
    ?? available.find(
      (activity) => activity[participantKey] === preferredParticipantId,
    )
    ?? available[0]
  );
}

function distributeClassInquiryComments(
  comments,
  questions,
  classInquiryQuestions,
  kimStudentId,
) {
  const sourceQuestionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const usedIds = new Set();

  for (const target of classInquiryQuestions) {
    const usedAuthors = new Set();
    for (let slot = 0; slot < 2; slot += 1) {
      const preferredAuthorId = target.priority === 1 && slot === 0
        ? kimStudentId
        : undefined;
      const activity = selectAvailableActivity(
        comments,
        sourceQuestionById,
        usedIds,
        target.sessionId,
        kimStudentId,
        preferredAuthorId,
        "authorId",
        usedAuthors,
      );
      if (!activity) {
        throw new Error("수업 탐구 질문에 배치할 댓글이 부족합니다.");
      }
      usedIds.add(activity.id);
      usedAuthors.add(activity.authorId);
      activity.questionId = target.id;
      activity.content = CLASS_INQUIRY_COMMENT_CONTENTS[target.type][
        (target.sessionIndex + target.priority + slot) % 2
      ];
    }
  }
}

function distributeClassInquiryLikes(
  likes,
  questions,
  classInquiryQuestions,
  kimStudentId,
) {
  const sourceQuestionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const usedIds = new Set();

  for (const target of classInquiryQuestions) {
    const usedUsers = new Set();
    const count = 4 + ((target.sessionIndex + target.priority - 1) % 3);
    for (let slot = 0; slot < count; slot += 1) {
      const preferredUserId = target.priority === 1 && slot === 0
        ? kimStudentId
        : undefined;
      const activity = selectAvailableActivity(
        likes,
        sourceQuestionById,
        usedIds,
        target.sessionId,
        kimStudentId,
        preferredUserId,
        "userId",
        usedUsers,
      );
      if (!activity) {
        throw new Error("수업 탐구 질문에 배치할 좋아요가 부족합니다.");
      }
      usedIds.add(activity.id);
      usedUsers.add(activity.userId);
      activity.questionId = target.id;
    }
  }
}

export function buildDemoClassInquiryQuestions(
  design,
  sessionId,
  studentQuestions,
) {
  const questionsInSession = studentQuestions.filter(
    (question) => question.sessionId === sessionId,
  );
  const designQuestionsByType = new Map();
  for (const question of design.inquiryQuestions) {
    const questions = designQuestionsByType.get(question.type) ?? [];
    questions.push(question);
    designQuestionsByType.set(question.type, questions);
  }

  if (questionsInSession.length === 0) return [];

  const typeOrder = new Map(
    CLASS_INQUIRY_FLOW.map(({ type }, index) => [type, index]),
  );
  const flowByType = new Map(
    CLASS_INQUIRY_FLOW.map((flowStep) => [flowStep.type, flowStep]),
  );
  const groupedByContent = new Map();

  for (const [index, question] of questionsInSession.entries()) {
    const key = question.content.trim().replace(/\s+/g, " ");
    const group = groupedByContent.get(key) ?? {
      firstIndex: index,
      questions: [],
    };
    group.questions.push(question);
    groupedByContent.set(key, group);
  }

  const groups = [...groupedByContent.values()]
    .map((group) => {
      const typeCounts = new Map();
      for (const question of group.questions) {
        typeCounts.set(
          question.inquiryType,
          (typeCounts.get(question.inquiryType) ?? 0) + 1,
        );
      }
      let type = group.questions[0].inquiryType;
      for (const candidate of CLASS_INQUIRY_FLOW.map(({ type: value }) => value)) {
        if ((typeCounts.get(candidate) ?? 0) > (typeCounts.get(type) ?? 0)) {
          type = candidate;
        }
      }
      return { ...group, type };
    })
    .sort((a, b) => (
      (typeOrder.get(a.type) ?? 0) - (typeOrder.get(b.type) ?? 0)
      || a.firstIndex - b.firstIndex
    ));

  const designCursorByType = new Map();
  return groups.map((group, index) => {
    const flowStep = flowByType.get(group.type) ?? CLASS_INQUIRY_FLOW[0];
    const designQuestions = designQuestionsByType.get(group.type) ?? [];
    const cursor = designCursorByType.get(group.type) ?? 0;
    const guideSource = designQuestions[cursor % Math.max(designQuestions.length, 1)];
    designCursorByType.set(group.type, cursor + 1);

    return {
      ...(guideSource ?? {}),
      type: group.type,
      content: group.questions[0].content,
      contentGroup: flowStep.contentGroup,
      lessonPhase: flowStep.lessonPhase,
      rationale: flowStep.rationale,
      priority: index + 1,
      source: "student",
      ...CLASS_INQUIRY_FLOW_BASIS,
      mergedFrom: group.questions.map(({ content }) => content),
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
  await tx.user.deleteMany({
    where: {
      id: { startsWith: "usb-demo-rank-" },
      isDemo: true,
    },
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

async function createRankingAccounts(tx, passwordHash, rankingStudents) {
  await tx.user.createMany({
    data: rankingStudents.map((student) => ({
      id: student.id,
      password: passwordHash,
      name: student.name,
      role: "STUDENT",
      school: student.school,
      grade: student.grade,
      className: student.className,
      studentNumber: student.studentNumber,
      totalPoints: student.totalPoints,
      isDemo: true,
    })),
  });
  await tx.pointLog.createMany({
    data: rankingStudents.map((student) => ({
      id: `point-${student.id}`,
      studentId: student.id,
      gameId: "DEMO_RANKING",
      bonusType: "DEMO_RANKING",
      points: student.totalPoints,
      reason: "순위 시연 활동 포인트",
      status: "APPROVED",
      activityDedupeKey: `ranking:${student.id}`,
    })),
  });
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
        achievements: design.achievements,
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
    const sharedQuestions = buildPublishedClassInquiryQuestions(
      blueprint,
      design,
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
      const id = sharedQuestionId(blueprint.key, index);
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

export const DEMO_STUDENT_POINT_TOTALS = [
  35, 23, 40, 18, 32, 26, 38,
  15, 30, 21, 36, 14, 28, 34,
  19, 39, 25, 31, 17, 37, 22,
  29, 13, 33, 20, 27, 16, 24,
];

export const DEMO_RECENT_CONTENT_POINT_PLANS = [
  {
    id: "usb-demo-point-question-write-01",
    bonusType: "QUESTION_WRITE",
    points: 2,
    reason: "질문수업 질문 작성",
    relatedQuestionId: "usb-demo-question-01-09",
    createdDays: 0,
  },
  {
    id: "usb-demo-point-question-write-02",
    bonusType: "QUESTION_WRITE",
    points: 2,
    reason: "질문수업 질문 작성",
    relatedQuestionId: "usb-demo-question-01-10",
    createdDays: -0.01,
  },
  {
    id: "usb-demo-point-comment-write-01",
    bonusType: "COMMENT_WRITE",
    points: 1,
    reason: "친구 질문에 답변 작성",
    relatedCommentId: "usb-demo-comment-01-03",
    createdDays: -0.02,
  },
  {
    id: "usb-demo-point-comment-write-02",
    bonusType: "COMMENT_WRITE",
    points: 1,
    reason: "친구 질문에 답변 작성",
    relatedCommentId: "usb-demo-comment-01-09",
    createdDays: -0.03,
  },
];

export function buildDemoRecentContentPointPlans(studentIds) {
  const activityPlans = buildDemoLearningActivityPlans(studentIds);
  const questionById = new Map(
    [...activityPlans.questions, ...activityPlans.classInquiryQuestions]
      .map((question) => [question.id, question]),
  );
  const commentById = new Map(
    activityPlans.comments.map((comment) => [comment.id, comment]),
  );

  return DEMO_RECENT_CONTENT_POINT_PLANS.map((plan) => {
    const relatedQuestionId = plan.relatedQuestionId
      ?? commentById.get(plan.relatedCommentId)?.questionId;
    const sessionId = questionById.get(relatedQuestionId)?.sessionId;
    if (!sessionId) {
      throw new Error(`최근 활동 포인트 ${plan.id}의 질문수업을 찾을 수 없습니다.`);
    }
    return { ...plan, sessionId };
  });
}

export function buildDemoQuestionGamePointProfiles(studentIds) {
  if (studentIds.length !== DEMO_STUDENT_POINT_TOTALS.length) {
    throw new Error(
      `포인트 시연 학생은 ${DEMO_STUDENT_POINT_TOTALS.length}명이어야 합니다.`,
    );
  }

  return studentIds.map((studentId, index) => {
    const totalPoints = DEMO_STUDENT_POINT_TOTALS[index];
    const contentPoints = index === 0
      ? DEMO_RECENT_CONTENT_POINT_PLANS.reduce(
        (sum, plan) => sum + plan.points,
        0,
      )
      : 0;
    const gamePoints = totalPoints - contentPoints;
    const counts = [1, 1, 1];
    const additionalQuestions = gamePoints - 13;
    for (let step = 0; step < additionalQuestions; step += 1) {
      counts[(index + step) % counts.length] += 1;
    }
    return {
      studentId,
      totalPoints,
      gamePoints,
      contentPoints,
      validQuestions: {
        SOLO: counts[0],
        AI: counts[1],
        FRIEND: counts[2],
      },
    };
  });
}

async function createQuestionGameData(tx, studentIds) {
  const gameIds = ["dice", "relay", "mystery-box", "kaba"];
  const pointTotals = new Map(studentIds.map((id) => [id, 0]));
  const pointProfiles = buildDemoQuestionGamePointProfiles(studentIds);
  const pointProfileByStudent = new Map(
    pointProfiles.map((profile) => [profile.studentId, profile]),
  );
  const recentContentPointPlans = buildDemoRecentContentPointPlans(studentIds);

  for (const plan of recentContentPointPlans) {
    await tx.pointLog.create({
      data: {
        id: plan.id,
        studentId: studentIds[0],
        gameId: "ACTIVITY",
        bonusType: plan.bonusType,
        points: plan.points,
        reason: plan.reason,
        status: "APPROVED",
        sessionId: plan.sessionId,
        relatedQuestionId: plan.relatedQuestionId,
        relatedCommentId: plan.relatedCommentId,
        createdAt: offsetDate(plan.createdDays),
      },
    });
    pointTotals.set(
      studentIds[0],
      (pointTotals.get(studentIds[0]) ?? 0) + plan.points,
    );
  }

  for (const [index, ownerId] of studentIds.entries()) {
    const number = index + 1;
    const pointProfile = pointProfileByStudent.get(ownerId);
    for (const mode of ["SOLO", "AI"]) {
      const modeKey = mode.toLowerCase();
      const runId = `usb-demo-run-${modeKey}-${pad(number)}`;
      const gameId = gameIds[(index + (mode === "AI" ? 1 : 0)) % gameIds.length];
      const validQuestions = pointProfile.validQuestions[mode];
      const participationPoints = 3;
      const activityPoints = validQuestions;
      const completedAt = offsetDate(-13 + ((index * 2 + (mode === "AI" ? 1 : 0)) % 13));
      const dailyLimit = mode === "SOLO" ? 30 : 50;
      const awarded = participationPoints + activityPoints;

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
              awarded,
              dailyLimit,
              dailyRemaining: dailyLimit - awarded,
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
    const friendQuestions = pointProfile.validQuestions.FRIEND;
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
    const expectedTotal = pointProfileByStudent.get(id)?.totalPoints;
    if (totalPoints !== expectedTotal) {
      throw new Error(
        `시연 포인트 합계가 맞지 않습니다: ${id} ${totalPoints}/${expectedTotal}`,
      );
    }
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
    const rankingStudents = buildDemoRankingStudents();
    const demoSchoolNames = [
      ...new Set([
        DEMO.school,
        ...DEMO_RANKING_CLASS_BLUEPRINTS.map(({ school }) => school),
      ]),
    ];
    const conflictingUsers = await prisma.user.count({
      where: { school: { in: demoSchoolNames }, isDemo: false },
    });
    if (conflictingUsers > 0) {
      throw new Error(
        "시연 학교 이름을 사용하는 일반 계정이 있어 시연 자료를 만들지 않았습니다.",
      );
    }

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    const studentIds = STUDENT_NAMES.map((_, index) => studentId(index + 1));
    const expectedCounts = buildDemoSeedExpectedCounts(studentIds);

    await prisma.$transaction(async (tx) => {
      await removePreviousDemoData(tx, studentIds);
      await createClassAccounts(tx, passwordHash);
      await createRankingAccounts(tx, passwordHash, rankingStudents);
      await createInquiryLearningData(tx, studentIds);
      await createQuestionGameData(tx, studentIds);
    }, { timeout: 120_000 });

    const [
      count,
      rankingStudentCount,
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
      prisma.user.count({
        where: {
          id: { startsWith: "usb-demo-rank-" },
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
    if (rankingStudentCount !== rankingStudents.length) {
      throw new Error(
        `순위 비교 학생 수가 ${rankingStudentCount}명으로 확인되었습니다.`,
      );
    }
    if (
      sessionCount !== expectedCounts.sessionCount
      || unitDesignCount !== expectedCounts.unitDesignCount
      || sharedQuestionCount !== expectedCounts.sharedQuestionCount
      || questionCount !== expectedCounts.questionCount
      || commentCount !== expectedCounts.commentCount
      || likeCount !== expectedCounts.likeCount
      || analysisCount !== expectedCounts.analysisCount
      || kimQuestionCount !== expectedCounts.kimQuestionCount
      || kimCommentCount !== expectedCounts.kimCommentCount
      || kimLikeCount !== expectedCounts.kimLikeCount
    ) {
      throw new Error(
        `시연 자료 수가 예상과 다릅니다: 수업 ${sessionCount}, 참고자료 ${unitDesignCount}, 배포 질문 ${sharedQuestionCount}, 학생 질문 ${questionCount}, 댓글 ${commentCount}, 좋아요 ${likeCount}, 분석 ${analysisCount}`,
      );
    }

    console.log(
      `시연 학급 생성 완료: 김교사, 학생 ${count}명, 순위 비교 학생 ${rankingStudentCount}명, 질문수업 ${sessionCount}개, 참고자료 ${unitDesignCount}개, 김질문 질문 ${kimQuestionCount}개, 댓글 ${kimCommentCount}개, 좋아요 ${kimLikeCount}개, 수업 분석 ${analysisCount}개`,
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
