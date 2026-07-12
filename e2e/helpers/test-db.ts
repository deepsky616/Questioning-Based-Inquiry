/**
 * e2e 전용 DB 헬퍼 — 합성 테스트 교사 계정 준비와 흔적 정리.
 * .env.local의 DATABASE_URL을 직접 읽어 Prisma를 초기화한다(플레이라이트 프로세스에는 env가 없음).
 */
import { readFileSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

export const TEST_TEACHER_EMAIL = "hermes.test.20260529@example.com";
export const E2E_TITLE_PREFIX = "E2E-마법사-";
export const E2E_SESSION_TOPIC_PREFIX = "E2E-질문작성-";
export const E2E_QUESTION_CONTENT_PREFIX = "E2E-학생질문-";

// 같은 스펙이 chromium·tablet 두 프로젝트에서 병렬 실행되므로,
// 학생 계정·번호·세션을 프로젝트 키별로 분리해 경합(unique email,
// 동일 학교·학년·반·번호 로그인 충돌)을 원천적으로 막는다.
const STUDENT_EMAIL_BASE = "e2e.student.ask";
const QUESTION_LEARNING_TEACHER_EMAIL_BASE = "e2e.teacher.learning";
// 스펙×프로젝트 조합마다 번호를 달리한다(로그인이 학교·학년·반·번호로 계정을 찾으므로)
const STUDENT_NUMBER_BY_KEY: Record<string, string> = {
  "ask-chromium": "71",
  "ask-tablet": "72",
  "nav-chromium": "73",
  "nav-tablet": "74",
  "learning-chromium": "75",
  "learning-tablet": "76",
};

function studentEmailFor(key: string): string {
  return `${STUDENT_EMAIL_BASE}.${key}@example.com`;
}

function studentNumberFor(key: string): string {
  return STUDENT_NUMBER_BY_KEY[key] ?? "79";
}

function sessionTopicPrefixFor(key: string): string {
  return `${E2E_SESSION_TOPIC_PREFIX}${key}-`;
}

export interface StudentAskFlowFixture {
  student: {
    school: string;
    grade: string;
    className: string;
    studentNumber: string;
    password: string;
  };
  session: {
    id: string;
    topic: string;
  };
  questionPrefix: string;
}

export interface QuestionLearningTeacherFixture {
  email: string;
  password: string;
}

function questionLearningTeacherEmailFor(key: string): string {
  return `${QUESTION_LEARNING_TEACHER_EMAIL_BASE}.${key}@example.com`;
}

function loadDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, "../../.env.local");
  const content = readFileSync(envPath, "utf8");
  const line = content.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

function client(): PrismaClient {
  // 헬퍼는 순차 쿼리만 하므로 연결 1개면 충분 — 공유 풀(세션 모드 상한 15)을 아낀다
  const url = new URL(loadDatabaseUrl());
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "30");
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

/**
 * 테스트 교사 계정 보장 — 외부 정리로 사라졌으면 재생성한다.
 * 여러 스펙×프로젝트의 beforeAll이 동시에 부르므로 생성 경합(P2002)은 재조회로 흡수한다.
 */
async function ensureTestTeacher(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<{ id: string; school: string | null }> {
  try {
    return await prisma.user.upsert({
      where: { email: TEST_TEACHER_EMAIL },
      create: {
        email: TEST_TEACHER_EMAIL,
        password: passwordHash,
        name: "E2E교사",
        role: "TEACHER",
        school: "E2E테스트초",
      },
      update: {},
      select: { id: true, school: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const teacher = await prisma.user.findFirst({
        where: { email: TEST_TEACHER_EMAIL },
        select: { id: true, school: true },
      });
      if (teacher) return teacher;
    }
    throw error;
  }
}

/** 테스트 교사 계정을 보장하고(없으면 생성) 이번 실행용 랜덤 비밀번호를 설정해 반환한다. */
export async function prepareTestTeacher(): Promise<string> {
  const prisma = client();
  try {
    const password = `E2e!${randomBytes(9).toString("hex")}`;
    const hashed = await bcrypt.hash(password, 12);
    const teacher = await ensureTestTeacher(prisma, hashed);
    await prisma.user.update({ where: { id: teacher.id }, data: { password: hashed } });
    return password;
  } finally {
    await prisma.$disconnect();
  }
}

/** 질문학습 병렬 화면 시험용 독립 교사 계정을 준비한다. */
export async function prepareQuestionLearningTeacher(key: string): Promise<QuestionLearningTeacherFixture> {
  const prisma = client();
  try {
    const email = questionLearningTeacherEmailFor(key);
    const password = `E2e!${randomBytes(9).toString("hex")}`;
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: hashed,
        name: `E2E질문학습교사-${key}`,
        role: "TEACHER",
        school: "E2E테스트초",
      },
      update: { password: hashed },
    });
    return { email, password };
  } finally {
    await prisma.$disconnect();
  }
}

/** 질문학습 화면 시험이 만든 독립 교사 계정만 삭제한다. */
export async function cleanupQuestionLearningTeacher(key: string): Promise<void> {
  const prisma = client();
  try {
    await prisma.user.deleteMany({ where: { email: questionLearningTeacherEmailFor(key) } });
  } finally {
    await prisma.$disconnect();
  }
}

/** e2e가 만든 탐구설계(제목 접두사 기준)를 삭제하고 비밀번호를 다시 랜덤화한다. */
export async function cleanupTestArtifacts(): Promise<void> {
  const prisma = client();
  try {
    const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL } });
    if (!teacher) return;
    await prisma.unitDesign.deleteMany({
      where: { teacherId: teacher.id, title: { startsWith: E2E_TITLE_PREFIX } },
    });
    await prisma.user.update({
      where: { id: teacher.id },
      data: { password: await bcrypt.hash(randomBytes(24).toString("hex"), 12) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** FK 유효성을 위해 실제 존재하는 커리큘럼 영역 id를 하나 가져온다(내용은 스텁이 대체). */
export async function getAnyCurriculumAreaId(): Promise<string> {
  const prisma = client();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM curriculum_areas LIMIT 1`;
    if (!rows[0]) throw new Error("curriculum_areas is empty");
    return rows[0].id;
  } finally {
    await prisma.$disconnect();
  }
}

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function ignoreMissingTable(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return;
    throw error;
  }
}

async function cleanupStudentAskFlowWithClient(prisma: PrismaClient, key: string): Promise<void> {
  const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL }, select: { id: true } });
  const student = await prisma.user.findFirst({ where: { email: studentEmailFor(key) }, select: { id: true } });
  // 키가 붙은 자기 세션만 지운다 — 병렬로 도는 다른 프로젝트의 픽스처를 건드리지 않기 위함
  const sessions = await prisma.questionSession.findMany({
    where: {
      topic: { startsWith: sessionTopicPrefixFor(key) },
      ...(teacher ? { teacherId: teacher.id } : {}),
    },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);

  const questionFilters: Prisma.QuestionWhereInput[] = [
    ...(sessionIds.length > 0 ? [{ sessionId: { in: sessionIds } }] : []),
    ...(student ? [{ authorId: student.id, content: { startsWith: E2E_QUESTION_CONTENT_PREFIX } }] : []),
  ];
  const questions =
    questionFilters.length > 0
      ? await prisma.question.findMany({
          where: { OR: questionFilters },
          select: { id: true },
        })
      : [];
  const questionIds = questions.map((question) => question.id);

  if (questionIds.length > 0) {
    await prisma.comment.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionLike.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.translation.deleteMany({ where: { sourceType: "QUESTION", sourceId: { in: questionIds } } });
    await prisma.pointLog.deleteMany({ where: { relatedQuestionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  }

  if (sessionIds.length > 0) {
    await ignoreMissingTable(() => prisma.appNotification.deleteMany({ where: { sessionId: { in: sessionIds } } }));
    await ignoreMissingTable(() => prisma.sessionAnalysis.deleteMany({ where: { sessionId: { in: sessionIds } } }));
    await prisma.pointLog.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.questionSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  if (student) {
    await ignoreMissingTable(() => prisma.appNotification.deleteMany({ where: { recipientId: student.id } }));
    await prisma.pointLog.deleteMany({ where: { studentId: student.id } });
    await prisma.user.delete({ where: { id: student.id } });
  }
}

/** 학생 질문 작성 e2e용 학생·담당학급·수업세션을 프로젝트 키별로 준비한다. */
export async function prepareStudentAskFlow(key = "default"): Promise<StudentAskFlowFixture> {
  const prisma = client();
  try {
    await cleanupStudentAskFlowWithClient(prisma, key);

    // 교사 계정 보장 — 사라졌으면 로그인 불가능한 랜덤 비밀번호로 재생성(경합 안전)
    const teacher = await ensureTestTeacher(prisma, await bcrypt.hash(randomBytes(24).toString("hex"), 12));

    const school = teacher.school?.trim() || "E2E테스트초";
    const grade = "4";
    const className = "4";
    // 학생 로그인이 학교·학년·반·번호로 계정을 찾으므로 프로젝트별로 번호를 달리한다
    const studentNumber = studentNumberFor(key);
    const password = `E2e!${randomBytes(9).toString("hex")}`;

    const existingClass = await prisma.teacherClass.findFirst({
      where: { teacherId: teacher.id, grade, className },
      select: { id: true },
    });
    if (!existingClass) {
      try {
        await prisma.teacherClass.create({
          data: { teacherId: teacher.id, grade, className },
        });
      } catch (error) {
        // 병렬 프로젝트가 먼저 만든 경우(unique 충돌)는 무시
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }

    // upsert — 비정상 종료로 남은 계정이 있어도 준비가 실패하지 않게 한다
    const email = studentEmailFor(key);
    const hashed = await bcrypt.hash(password, 12);
    const student = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: hashed,
        name: `E2E학생-${key}`,
        role: "STUDENT",
        school,
        grade,
        className,
        studentNumber,
        totalPoints: 0,
      },
      update: { password: hashed, school, grade, className, studentNumber },
      select: { id: true },
    });

    const session = await prisma.questionSession.create({
      data: {
        date: todayDateString(),
        subject: "과학",
        topic: `${sessionTopicPrefixFor(key)}${Date.now()}`,
        teacherId: teacher.id,
        targetType: "CLASS",
        targetGrade: grade,
        targetClassName: className,
        targetStudentIds: [student.id],
        defaultQuestionPublic: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
        isActive: true,
      },
      select: { id: true, topic: true },
    });

    return {
      student: { school, grade, className, studentNumber, password },
      session,
      questionPrefix: `${E2E_QUESTION_CONTENT_PREFIX}${Date.now()}`,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** 학생 질문 작성 e2e가 만든 데이터만 프로젝트 키·접두사 기준으로 삭제한다. */
export async function cleanupStudentAskFlow(key = "default"): Promise<void> {
  const prisma = client();
  try {
    await cleanupStudentAskFlowWithClient(prisma, key);
  } finally {
    await prisma.$disconnect();
  }
}
