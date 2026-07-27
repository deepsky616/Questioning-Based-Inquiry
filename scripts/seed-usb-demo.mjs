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
    past: "usb-demo-session-past",
    today: "usb-demo-session-today",
    future: "usb-demo-session-future",
  },
};

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

const QUESTION_STARTERS = [
  "물이 얼면 왜 부피가 달라질까요?",
  "얼음은 어떤 온도에서 가장 빨리 녹을까요?",
  "젖은 빨래는 바람이 불면 왜 빨리 마를까요?",
  "물방울은 차가운 컵 표면에 어떻게 생길까요?",
  "온도가 높아지면 물의 모습은 어떻게 달라질까요?",
  "같은 물질도 상태에 따라 성질이 달라질까요?",
  "겨울철 수도관은 왜 얼어서 터질 수 있을까요?",
];

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
  const pastDate = koreanDate(offsetDate(-7));
  const todayDate = koreanDate(offsetDate(0));
  const futureDate = koreanDate(offsetDate(5));

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

  const sessionData = [
    {
      id: DEMO.sessionIds.past,
      date: pastDate,
      subject: "과학",
      topic: "물의 세 가지 상태",
      unitDesignId: DEMO.unitDesignId,
    },
    {
      id: DEMO.sessionIds.today,
      date: todayDate,
      subject: "과학",
      topic: "온도에 따른 상태 변화",
      unitDesignId: DEMO.unitDesignId,
    },
    {
      id: DEMO.sessionIds.future,
      date: futureDate,
      subject: "사회",
      topic: "환경을 위한 생활 속 선택",
      unitDesignId: null,
    },
  ];
  for (const item of sessionData) {
    await tx.questionSession.create({
      data: {
        ...item,
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

  for (const [index, authorId] of studentIds.entries()) {
    const content = QUESTION_STARTERS[index % QUESTION_STARTERS.length];
    await tx.question.create({
      data: {
        id: `usb-demo-question-${pad(index + 1)}`,
        content,
        normalizedContent: `${content} ${index + 1}`,
        dedupeKey: `usb-demo-question-${pad(index + 1)}`,
        closure: "open",
        cognitive: ["factual", "conceptual", "controversial"][index % 3],
        closureScore: 0.9,
        cognitiveScore: 0.78,
        context: "온도에 따른 물질의 상태 변화",
        source: "STUDENT",
        inquiryType: ["factual", "conceptual", "controversial"][index % 3],
        sessionId: DEMO.sessionIds.past,
        authorId,
        isPublic: true,
        createdAt: offsetDate(-6 + (index % 3)),
      },
    });
  }

  for (let index = 0; index < studentIds.length; index += 1) {
    const authorId = studentIds[index];
    const targetNumber = ((index + 1) % studentIds.length) + 1;
    await tx.comment.create({
      data: {
        id: `usb-demo-comment-${pad(index + 1)}`,
        content: "관찰 결과를 표로 정리해서 비교하면 까닭을 더 잘 찾을 수 있을 것 같아요.",
        normalizedContent: `관찰 결과 비교 의견 ${index + 1}`,
        dedupeKey: `usb-demo-comment-${pad(index + 1)}`,
        authorId,
        questionId: `usb-demo-question-${pad(targetNumber)}`,
        createdAt: offsetDate(-4 + (index % 2)),
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

    const count = await prisma.user.count({
      where: {
        role: "STUDENT",
        school: DEMO.school,
        grade: DEMO.grade,
        className: DEMO.className,
        isDemo: true,
      },
    });
    if (count !== STUDENT_NAMES.length) {
      throw new Error(`시연 학생 수가 ${count}명으로 확인되었습니다.`);
    }

    console.log(`시연 학급 생성 완료: 김교사, 학생 ${count}명`);
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
