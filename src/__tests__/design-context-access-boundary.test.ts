import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@/lib/translate", () => ({
  contentHash: vi.fn(() => "hash"),
  translateTexts: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    teacherClass: { findMany: vi.fn() },
    translation: { findUnique: vi.fn(), upsert: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { GET } from "@/app/api/sessions/[id]/design-context/route";
import { POST as translate } from "@/app/api/sessions/[id]/design-context/translate/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { translateTexts } from "@/lib/translate";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mSessionFindUnique = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFindFirst = prisma.questionSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const mUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mTeacherClassFindMany = prisma.teacherClass.findMany as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mTranslationFind = prisma.translation.findUnique as unknown as ReturnType<typeof vi.fn>;
const mResolveAiConfig = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const mTranslateTexts = translateTexts as unknown as ReturnType<typeof vi.fn>;

const student = {
  id: "student-1",
  role: "STUDENT",
  school: "한빛초",
  grade: "5",
  className: "1",
};

const otherSchoolTeacher = {
  id: "teacher-other",
  role: "TEACHER",
  school: "새봄초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const otherSchoolSession = {
  id: "session-other",
  unitDesignId: "design-other",
  date: "2026-07-14",
  teacherId: otherSchoolTeacher.id,
  teacher: otherSchoolTeacher,
  isActive: true,
  targetType: "ALL",
  targetGrade: null,
  targetClassName: null,
  targetStudentId: null,
  targetStudentIds: [],
};

const context = { params: Promise.resolve({ id: otherSchoolSession.id }) };

function rawRequest() {
  return new Request(
    `http://localhost/api/sessions/${otherSchoolSession.id}/design-context`,
  );
}

function translationRequest() {
  return new Request(
    `http://localhost/api/sessions/${otherSchoolSession.id}/design-context/translate`,
    {
      method: "POST",
      headers: { cookie: "NEXT_LOCALE=en" },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: student });
  mSessionFindUnique.mockResolvedValue(otherSchoolSession);
  mSessionFindFirst.mockResolvedValue(otherSchoolSession);
  mUserFindUnique.mockImplementation(
    async ({ where }: { where: { id?: string } }) => {
      if (where.id === student.id) return student;
      if (where.id === otherSchoolTeacher.id) return otherSchoolTeacher;
      return null;
    },
  );
  mTeacherClassFindMany.mockResolvedValue([]);
  mQueryRaw.mockResolvedValue([
    {
      id: "design-other",
      title: "다른 학교 설계",
      subject: "과학",
      grade_range: "5-6",
      grade: "5",
      area: "생명",
      core_idea: "다른 학교 핵심 생각",
      core_sentences: ["다른 학교 핵심 문장"],
      essential_questions: ["다른 학교 핵심 질문"],
      inquiry_questions: [{ type: "factual", content: "다른 학교 탐구 질문" }],
    },
  ]);
  mTranslationFind.mockResolvedValue(null);
  mResolveAiConfig.mockResolvedValue({ apiKey: "test-key", model: "test-model" });
  mTranslateTexts.mockResolvedValue([
    "Other school design",
    "Science",
    "Life",
    "Core idea",
    "Core sentence",
    "Essential question",
    "Inquiry question",
  ]);
});

describe("질문수업 참고 자료 학교 경계", () => {
  it("학생은 다른 학교 전체 대상 수업의 원문을 수업 번호로 직접 조회할 수 없다", async () => {
    const response = await GET(rawRequest(), context);

    expect(response.status).toBe(403);
    expect(mQueryRaw).not.toHaveBeenCalled();
  });

  it("학생은 다른 학교 전체 대상 수업의 번역을 수업 번호로 직접 요청할 수 없다", async () => {
    const response = await translate(translationRequest(), context);

    expect(response.status).toBe(403);
    expect(mQueryRaw).not.toHaveBeenCalled();
    expect(mTranslationFind).not.toHaveBeenCalled();
    expect(mResolveAiConfig).not.toHaveBeenCalled();
    expect(mTranslateTexts).not.toHaveBeenCalled();
  });
});
