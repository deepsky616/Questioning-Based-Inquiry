import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PATCH } from "@/app/api/sessions/[id]/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.questionSession.update as ReturnType<typeof vi.fn>;

const TEACHER_SESSION = { user: { id: "teacher-1", role: "TEACHER" } };

function makePatchRequest(body: unknown) {
  return new Request("http://localhost/api/sessions/session-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCtx(id = "session-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(TEACHER_SESSION);
  mockFindUnique.mockResolvedValue({ id: "session-1", teacherId: "teacher-1" });
  mockUpdate.mockImplementation(async ({ data }) => ({ id: "session-1", ...data }));
});

describe("PATCH /api/sessions/[id] — 단원설계 배포", () => {
  it("새 세션 입력값 없이 선택된 기존 수업세션에 단원설계를 연결한다", async () => {
    const sharedQuestions = [
      {
        type: "conceptual",
        content: "식물은 왜 빛이 필요할까?",
        contentGroup: "광합성 관련 질문",
        lessonPhase: "원리 탐구",
        rationale: "사실 확인 뒤 원리 탐구로 이어지는 질문입니다.",
        priority: 2,
      },
    ];

    const res = await PATCH(
      makePatchRequest({
        unitDesignId: "unit-design-1",
        sharedQuestions,
        targetType: "CLASS",
        targetGrade: "5",
        targetClassName: "1",
        targetStudentIds: ["student-1", "student-2"],
      }),
      makeCtx(),
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        unitDesignId: "unit-design-1",
        sharedQuestions,
        targetType: "CLASS",
        targetGrade: "5",
        targetClassName: "1",
        targetStudentIds: ["student-1", "student-2"],
      }),
    });
  });
});
