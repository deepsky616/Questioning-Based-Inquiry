import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/sessions/[id]/design-context/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

const TEACHER_SCOPE = {
  teacher: {
    role: "TEACHER",
    school: "테스트학교",
    teacherClasses: [{ grade: "4", className: "2" }],
  },
};

const DESIGN_ROW = {
  title: "광합성",
  subject: "과학",
  grade_range: "3-4",
  grade: "4",
  area: "생명",
  core_idea: "핵심 아이디어",
  selected_achievements: [{
    code: "[4과05-01]",
    content: "식물의 생활을 관찰하고 특징을 설명할 수 있다.",
  }],
  core_sentences: ["문장1"],
  essential_questions: ["질문1"],
  learning_guides: {
    coreIdea: { explanation: "핵심 아이디어 쉬운 설명", lifeConnection: "생활 속 사례", keywords: [] },
    achievements: [{ index: 0, explanation: "식물을 관찰하고 특징을 설명해 보는 기준이에요." }],
    coreSentences: [],
    essentialQuestions: [],
  },
  inquiry_questions: [{ type: "factual", content: "탐구1" }],
};

const req = new Request("http://localhost/api/sessions/s1/design-context");
const ctx = { params: Promise.resolve({ id: "s1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([DESIGN_ROW]);
});

describe("GET design-context 권한", () => {
  it("비로그인은 401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("소유 교사는 참고자료를 받는다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({ unitDesignId: "ud1", date: "2026-05-01", teacherId: "t1", targetType: "ALL", targetGrade: null, targetClassName: null, targetStudentId: null, targetStudentIds: [] });
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.context?.title).toBe("2026-05-01 4학년 과학 광합성");
    expect(body.context?.sessionDate).toBe("2026-05-01");
    expect(body.context?.learningGuides.coreIdea.explanation).toBe("핵심 아이디어 쉬운 설명");
    expect(body.context?.achievements).toEqual(DESIGN_ROW.selected_achievements);
    expect(body.context?.learningGuides.achievements[0].explanation).toContain("식물을 관찰하고");
  });

  it("소유가 아닌 교사는 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "t2", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({ unitDesignId: "ud1", date: "2026-05-01", teacherId: "t1", targetType: "ALL", targetGrade: null, targetClassName: null, targetStudentId: null, targetStudentIds: [] });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("대상 학생(ALL)은 참고자료를 받는다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT", grade: "4", className: "2" } });
    mockUserFindUnique.mockResolvedValue({ id: "s1", role: "STUDENT", school: "테스트학교", grade: "4", className: "2" });
    mockFindUnique.mockResolvedValue({ ...TEACHER_SCOPE, unitDesignId: "ud1", date: "2026-05-01", teacherId: "t1", targetType: "ALL", targetGrade: null, targetClassName: null, targetStudentId: null, targetStudentIds: [] });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it("대상이 아닌 학생(다른 반 CLASS)은 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "s9", role: "STUDENT", grade: "4", className: "9" } });
    mockUserFindUnique.mockResolvedValue({ id: "s9", role: "STUDENT", school: "테스트학교", grade: "4", className: "9" });
    mockFindUnique.mockResolvedValue({ ...TEACHER_SCOPE, unitDesignId: "ud1", date: "2026-05-01", teacherId: "t1", targetType: "CLASS", targetGrade: "4", targetClassName: "2", targetStudentId: null, targetStudentIds: [] });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("CUSTOM 대상에 포함된 학생은 참고자료를 받는다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "s5", role: "STUDENT", grade: "4", className: "2" } });
    mockUserFindUnique.mockResolvedValue({ id: "s5", role: "STUDENT", school: "테스트학교", grade: "4", className: "2" });
    mockFindUnique.mockResolvedValue({ ...TEACHER_SCOPE, unitDesignId: "ud1", date: "2026-05-01", teacherId: "t1", targetType: "CUSTOM", targetGrade: null, targetClassName: null, targetStudentId: null, targetStudentIds: ["s5", "s6"] });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it("연결 설계가 없으면(권한은 통과) context는 null", async () => {
    mockAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mockFindUnique.mockResolvedValue({ unitDesignId: null, date: "2026-05-01", teacherId: "t1", targetType: "ALL", targetGrade: null, targetClassName: null, targetStudentId: null, targetStudentIds: [] });
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.context).toBeNull();
  });
});
