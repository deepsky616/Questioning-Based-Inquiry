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
  unitDesignId: "usb-demo-unit-design",
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
    unitDesignId: null,
  },
  {
    key: "pastSocial",
    id: DEMO.sessionIds.pastSocial,
    offsetDays: -12,
    subject: "사회",
    topic: "우리 지역의 문제와 해결 방법",
    unitDesignId: null,
  },
  {
    key: "past",
    id: DEMO.sessionIds.past,
    offsetDays: -7,
    subject: "과학",
    topic: "물의 세 가지 상태",
    unitDesignId: DEMO.unitDesignId,
  },
  {
    key: "pastMath",
    id: DEMO.sessionIds.pastMath,
    offsetDays: -3,
    subject: "수학",
    topic: "자료를 표와 그래프로 나타내기",
    unitDesignId: null,
  },
  {
    key: "today",
    id: DEMO.sessionIds.today,
    offsetDays: 0,
    subject: "과학",
    topic: "온도에 따른 상태 변화",
    unitDesignId: DEMO.unitDesignId,
  },
  {
    key: "future",
    id: DEMO.sessionIds.future,
    offsetDays: 5,
    subject: "사회",
    topic: "환경을 위한 생활 속 선택",
    unitDesignId: null,
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

function inquiryQuestions() {
  return [
    {
      type: "factual",
      content: "물이 얼 때 부피는 어떻게 달라질까?",
      studentGuide: {
        meaning: "물이 얼기 전과 얼고 난 뒤의 모습을 관찰해 사실을 확인하는 질문이에요.",
        keywords: [
          { term: "부피", meaning: "물체가 차지하는 공간의 크기" },
          { term: "상태 변화", meaning: "물질의 모습이 달라지는 현상" },
        ],
        thinkingStart: "같은 양의 물을 얼리기 전과 후에 표시한 높이를 비교해 보세요.",
      },
    },
    {
      type: "conceptual",
      content: "물질의 상태 변화와 온도는 어떤 관계가 있을까?",
      studentGuide: {
        meaning: "온도가 달라질 때 물질의 상태가 변하는 까닭과 관계를 찾는 질문이에요.",
        keywords: [
          { term: "온도", meaning: "차갑고 뜨거운 정도를 나타내는 값" },
          { term: "관계", meaning: "두 가지가 서로 이어지는 방식" },
        ],
        thinkingStart: "얼음, 물, 수증기가 되는 때의 온도 변화를 순서대로 떠올려 보세요.",
      },
    },
    {
      type: "controversial",
      content: "학교에서 일회용품 사용을 줄이기 위해 불편을 감수해야 할까?",
      studentGuide: {
        meaning: "환경 보호와 생활의 편리함 중 무엇을 더 중요하게 볼지 근거를 들어 판단하는 질문이에요.",
        keywords: [
          { term: "일회용품", meaning: "한 번 쓰고 버리는 물건" },
          { term: "감수", meaning: "어려움이나 불편을 받아들이는 것" },
        ],
        thinkingStart: "환경에 주는 도움과 학생들이 겪을 불편을 각각 찾아 비교해 보세요.",
      },
    },
  ];
}

function learningGuides() {
  return {
    coreIdea: {
      explanation: "물질은 온도에 따라 상태가 달라지며, 그 과정에서 관찰할 수 있는 변화가 나타나요.",
      lifeConnection: "얼음이 녹고 젖은 빨래가 마르는 일처럼 우리 생활에서 상태 변화를 쉽게 찾을 수 있어요.",
      keywords: [
        { term: "물질", meaning: "주변의 물건을 이루는 재료" },
        { term: "온도", meaning: "차갑고 뜨거운 정도" },
        { term: "상태 변화", meaning: "고체, 액체, 기체 사이에서 모습이 달라지는 현상" },
      ],
    },
    coreSentences: [
      {
        index: 0,
        explanation: "물질에 열을 더하거나 빼면 고체, 액체, 기체의 상태가 달라질 수 있다는 뜻이에요.",
      },
    ],
    essentialQuestions: [
      {
        index: 0,
        thinkingFocus: "상태 변화가 일어날 때 온도와 물질의 모습을 함께 살펴보세요.",
        perspectives: ["관찰한 사실", "생활 속 쓰임"],
      },
    ],
  };
}

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
  const questions = inquiryQuestions();
  const todayDate = koreanDate(offsetDate(0));

  await tx.unitDesign.create({
    data: {
      id: DEMO.unitDesignId,
      teacherId: DEMO.teacherId,
      title: "온도에 따른 물질의 상태 변화",
      subject: "과학",
      gradeRange: "3-4",
      grade: DEMO.grade,
      sessionDate: todayDate,
      area: "물질",
      coreIdea: "물질은 온도에 따라 상태가 변하며, 상태 변화는 우리 생활과 밀접하게 이어져 있다.",
      selectedKeywords: ["물질", "온도", "상태 변화"],
      coreSentences: [
        "물질에 열을 더하거나 빼면 고체, 액체, 기체 사이에서 상태가 달라질 수 있다.",
      ],
      essentialQuestions: [
        "온도 변화는 물질의 상태와 우리 생활에 어떤 영향을 줄까?",
      ],
      inquiryQuestions: questions,
      learningGuides: learningGuides(),
      targetClassValue: "4-1",
      targetStudentIds: studentIds,
    },
  });

  for (const blueprint of DEMO_SESSION_BLUEPRINTS) {
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
        sharedQuestions: questions,
        defaultQuestionPublic: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
        isActive: true,
      },
    });
  }

  const activityPlans = buildDemoLearningActivityPlans(studentIds);
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
      || questionCount !== 92
      || commentCount !== 93
      || likeCount !== 153
      || analysisCount !== ACTIVITY_SESSION_BLUEPRINTS.length
      || kimQuestionCount !== 11
      || kimCommentCount !== 12
      || kimLikeCount !== 18
    ) {
      throw new Error(
        `시연 자료 수가 예상과 다릅니다: 수업 ${sessionCount}, 질문 ${questionCount}, 댓글 ${commentCount}, 좋아요 ${likeCount}, 분석 ${analysisCount}`,
      );
    }

    console.log(
      `시연 학급 생성 완료: 김교사, 학생 ${count}명, 질문수업 ${sessionCount}개, 김질문 질문 ${kimQuestionCount}개, 댓글 ${kimCommentCount}개, 좋아요 ${kimLikeCount}개, 수업 분석 ${analysisCount}개`,
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
