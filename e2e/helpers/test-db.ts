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
export const TEST_STUDENT_EMAIL = "e2e.student.ask@example.com";
export const E2E_SESSION_TOPIC_PREFIX = "E2E-질문작성-";
export const E2E_QUESTION_CONTENT_PREFIX = "E2E-학생질문-";

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

function loadDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, "../../.env.local");
  const content = readFileSync(envPath, "utf8");
  const line = content.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

function client(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
}

/** 테스트 교사 비밀번호를 이번 실행용 랜덤 값으로 설정하고 그 값을 반환한다. */
export async function prepareTestTeacher(): Promise<string> {
  const prisma = client();
  try {
    const password = `E2e!${randomBytes(9).toString("hex")}`;
    const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL } });
    if (!teacher) throw new Error(`test teacher missing: ${TEST_TEACHER_EMAIL}`);
    await prisma.user.update({
      where: { id: teacher.id },
      data: { password: await bcrypt.hash(password, 12) },
    });
    return password;
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

async function cleanupStudentAskFlowWithClient(prisma: PrismaClient): Promise<void> {
  const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL }, select: { id: true } });
  const student = await prisma.user.findFirst({ where: { email: TEST_STUDENT_EMAIL }, select: { id: true } });
  const sessions = await prisma.questionSession.findMany({
    where: {
      topic: { startsWith: E2E_SESSION_TOPIC_PREFIX },
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

/** 학생 질문 작성 e2e용 학생·담당학급·수업세션을 준비한다. */
export async function prepareStudentAskFlow(): Promise<StudentAskFlowFixture> {
  const prisma = client();
  try {
    await cleanupStudentAskFlowWithClient(prisma);

    const teacher = await prisma.user.findFirst({
      where: { email: TEST_TEACHER_EMAIL },
      select: { id: true, school: true },
    });
    if (!teacher) throw new Error(`test teacher missing: ${TEST_TEACHER_EMAIL}`);

    const school = teacher.school?.trim() || "E2E테스트초";
    const grade = "4";
    const className = "4";
    const studentNumber = "7";
    const password = `E2e!${randomBytes(9).toString("hex")}`;

    const existingClass = await prisma.teacherClass.findFirst({
      where: { teacherId: teacher.id, grade, className },
      select: { id: true },
    });
    if (!existingClass) {
      await prisma.teacherClass.create({
        data: { teacherId: teacher.id, grade, className },
      });
    }

    const student = await prisma.user.create({
      data: {
        email: TEST_STUDENT_EMAIL,
        password: await bcrypt.hash(password, 12),
        name: "E2E학생",
        role: "STUDENT",
        school,
        grade,
        className,
        studentNumber,
        totalPoints: 0,
      },
      select: { id: true },
    });

    const session = await prisma.questionSession.create({
      data: {
        date: todayDateString(),
        subject: "과학",
        topic: `${E2E_SESSION_TOPIC_PREFIX}${Date.now()}`,
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

/** 학생 질문 작성 e2e가 만든 데이터만 접두사 기준으로 삭제한다. */
export async function cleanupStudentAskFlow(): Promise<void> {
  const prisma = client();
  try {
    await cleanupStudentAskFlowWithClient(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
