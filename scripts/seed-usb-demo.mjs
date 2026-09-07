import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { GRADE_FIVE_LESSONS, buildGradeFiveDesign, gradeFiveComment, gradeFiveAnalysis } from "./demo-grade-five-content.mjs";

export const STUDENT_NAMES = Array.from({ length: 28 }, (_, index) => index === 0 ? "김질문" : `학생${index + 1}`);

const DEMO = {
  school: "질문초등학교",
  grade: "5",
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
  { school: "질문초등학교", grade: "5", className: "2", studentCount: 23, averagePoints: 37 },
  { school: "질문초등학교", grade: "5", className: "3", studentCount: 25, averagePoints: 32 },
  { school: "질문초등학교", grade: "5", className: "4", studentCount: 27, averagePoints: 24 },
  { school: "질문초등학교", grade: "5", className: "5", studentCount: 30, averagePoints: 19.5 },
  { school: "대답초등학교", grade: "5", className: "1", studentCount: 24, averagePoints: 38.5 },
  { school: "대답초등학교", grade: "5", className: "2", studentCount: 26, averagePoints: 35.5 },
  { school: "대답초등학교", grade: "5", className: "3", studentCount: 28, averagePoints: 30.5 },
  { school: "대답초등학교", grade: "5", className: "4", studentCount: 29, averagePoints: 23 },
  { school: "대답초등학교", grade: "5", className: "5", studentCount: 30, averagePoints: 18.5 },
  { school: "탐구초등학교", grade: "5", className: "1", studentCount: 25, averagePoints: 37 },
  { school: "탐구초등학교", grade: "5", className: "2", studentCount: 26, averagePoints: 36.5 },
  { school: "탐구초등학교", grade: "5", className: "3", studentCount: 27, averagePoints: 25 },
  { school: "탐구초등학교", grade: "5", className: "4", studentCount: 28, averagePoints: 21.5 },
  { school: "탐구초등학교", grade: "5", className: "5", studentCount: 29, averagePoints: 17 },
];

export const DEMO_SESSION_BLUEPRINTS = [
  {
    key: "pastKorean",
    id: DEMO.sessionIds.pastKorean,
    offsetDays: -18,
    subject: "국어",
    unitDesignId: DEMO.unitDesignIds.pastKorean,
  },
  {
    key: "pastSocial",
    id: DEMO.sessionIds.pastSocial,
    offsetDays: -12,
    subject: "사회",
    unitDesignId: DEMO.unitDesignIds.pastSocial,
  },
  {
    key: "past",
    id: DEMO.sessionIds.past,
    offsetDays: -7,
    subject: "과학",
    unitDesignId: DEMO.unitDesignIds.past,
  },
  {
    key: "pastMath",
    id: DEMO.sessionIds.pastMath,
    offsetDays: -3,
    subject: "수학",
    unitDesignId: DEMO.unitDesignIds.pastMath,
  },
  {
    key: "today",
    id: DEMO.sessionIds.today,
    offsetDays: 0,
    subject: "과학",
    unitDesignId: DEMO.unitDesignIds.today,
  },
  {
    key: "exploreKorean",
    id: DEMO.sessionIds.exploreKorean,
    offsetDays: 1,
    subject: "국어",
    semester: "1",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.exploreKorean,
  },
  {
    key: "exploreMath",
    id: DEMO.sessionIds.exploreMath,
    offsetDays: 3,
    subject: "수학",
    semester: "1",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.exploreMath,
  },
  {
    key: "future",
    id: DEMO.sessionIds.future,
    offsetDays: 5,
    subject: "사회",
    studentExplore: true,
    unitDesignId: DEMO.unitDesignIds.future,
  },
].map((session) => ({
  ...session,
  topic: GRADE_FIVE_LESSONS[session.key].topic,
  semester: GRADE_FIVE_LESSONS[session.key].semester,
}));

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
      const name = `학생${STUDENT_NAMES.length + studentIndex + 1}`;
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

export const DEMO_UNIT_DESIGN_BLUEPRINTS = DEMO_SESSION_BLUEPRINTS.map(buildGradeFiveDesign);

const SESSION_QUESTION_BANKS = Object.fromEntries(Object.entries(GRADE_FIVE_LESSONS).map(([key, lesson]) => [key, lesson.questions.map(({ content }) => content)]));
const SESSION_QUESTION_TYPES = Object.fromEntries(Object.entries(GRADE_FIVE_LESSONS).map(([key, lesson]) => [key, lesson.questions.map(({ type }) => type)]));
const KIM_QUESTION_PLANS = [
  ["pastKorean", 1], ["pastKorean", 2], ["pastSocial", 0], ["pastSocial", 2],
  ["past", 0], ["past", 4], ["pastMath", 0], ["pastMath", 1],
  ["today", 0], ["today", 2], ["today", 4],
  ["exploreKorean", 1], ["exploreKorean", 3], ["exploreMath", 0], ["exploreMath", 1],
].map(([sessionKey, questionIndex]) => {
  const item = GRADE_FIVE_LESSONS[sessionKey].questions[questionIndex];
  return { sessionKey, content: sessionKey.startsWith("explore") ? `직접 확인해 보면 ${item.content}` : item.content, closure: item.type === "factual" ? "closed" : "open", cognitive: item.type,
    ...(!sessionKey.startsWith("explore") ? { similarityIndex: questionIndex } : {}) };
});
const STUDENT_ANALYSIS_COPY = Object.fromEntries(ANALYSIS_SESSION_BLUEPRINTS.map((session, index) => [session.key, gradeFiveAnalysis(session.key, index)]));
const COMMENT_CONTENTS = ["질문의 근거와 조건을 함께 살펴보아요."];

const SIMILAR_QUESTION_OPENERS = [
  "수업에서 ",
  "자료를 찾아보면 ",
  "친구들의 생각을 비교하면 ",
  "실제 사례를 살펴보면 ",
  "다른 조건에서도 ",
  "우리 생활에서도 ",
  "직접 확인해 보면 ",
  "여러 관점에서 생각하면 ",
];

function buildSemanticallySimilarQuestion(baseQuestion, variantIndex) {
  const opener = SIMILAR_QUESTION_OPENERS[variantIndex];
  if (!opener) {
    throw new Error("비슷한 학생 질문 문장 종류가 부족합니다.");
  }
  return `${opener}${baseQuestion}`;
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
    ANALYSIS_SESSION_BLUEPRINTS.map((blueprint) => [blueprint.key, blueprint]),
  );
  const questions = [];
  const similarQuestionUseCount = new Map();

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
      ...(typeof plan.similarityIndex === "number"
        ? { similarityKey: `${plan.sessionKey}:${plan.similarityIndex}` }
        : {}),
      createdDays: Math.min(0, session.offsetDays + 1),
    });
  }

  for (let studentIndex = 1; studentIndex < studentIds.length; studentIndex += 1) {
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      const session = ACTIVITY_SESSION_BLUEPRINTS[
        (studentIndex + questionIndex) % ACTIVITY_SESSION_BLUEPRINTS.length
      ];
      const bank = SESSION_QUESTION_BANKS[session.key];
      const bankIndex = (
        Math.floor(studentIndex / ACTIVITY_SESSION_BLUEPRINTS.length)
        + questionIndex
      ) % bank.length;
      const similarityKey = `${session.key}:${bankIndex}`;
      const variantIndex = similarQuestionUseCount.get(similarityKey) ?? 0;
      similarQuestionUseCount.set(similarityKey, variantIndex + 1);
      const content = buildSemanticallySimilarQuestion(
        bank[bankIndex],
        variantIndex,
      );
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
        similarityKey,
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
  for (const [index, comment] of comments.entries()) {
    comment.content = gradeFiveComment(questionById.get(comment.questionId), index);
  }
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
        ...gradeFiveAnalysis(session.key, index, questions.find((question) => question.authorId === studentIds[0] && question.sessionId === session.id)?.content),
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
      content: question.content,
      context: session.topic,
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
    const key = question.similarityKey?.trim()
      || question.content.trim().replace(/\s+/g, " ");
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

    const lesson = GRADE_FIVE_LESSONS[design.key];
    const matchedQuestion = lesson?.questions.find((item) => group.questions[0].content.includes(item.content));
    return {
      ...(guideSource ?? {}),
      ...(matchedQuestion ? {studentGuide: {
        meaning: matchedQuestion.hint,
        thinkingStart: matchedQuestion.hint,
        keywords: lesson.keywords.map(([term, meaning]) => ({term, meaning})),
      }} : {}),
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
      name: "김탐구",
      role: "TEACHER",
      school: DEMO.school,
      isDemo: true,
    },
    update: {
      email: DEMO.teacherEmail,
      name: "김탐구",
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
      id: "usb-demo-teacher-class-5-1",
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
        targetClassValue: "5-1",
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
      `시연 학급 생성 완료: 김탐구, 학생 ${count}명, 순위 비교 학생 ${rankingStudentCount}명, 질문수업 ${sessionCount}개, 참고자료 ${unitDesignCount}개, 김질문 질문 ${kimQuestionCount}개, 댓글 ${kimCommentCount}개, 좋아요 ${kimLikeCount}개, 수업 분석 ${analysisCount}개`,
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
