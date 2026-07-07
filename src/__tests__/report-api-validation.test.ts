import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/student-session-analysis", () => ({ runStudentSessionAnalysis: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), findMany: vi.fn() },
    sessionAnalysis: { upsert: vi.fn(), findMany: vi.fn() },
    teacherClass: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionLike: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";
import { PATCH as patchSessionAnalysis } from "@/app/api/reports/session-analysis/route";
import { POST as postStudentSessionAnalysis } from "@/app/api/reports/student-session-analysis/route";
import { POST as postBulkStudentAnalysis } from "@/app/api/reports/bulk-student-analysis/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockRunStudentAnalysis = runStudentSessionAnalysis as unknown as ReturnType<typeof vi.fn>;
const mockSessionFindUnique = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("리포트 API 입력 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  });

  it("세션 분석 저장은 result 배열을 거부한다", async () => {
    mockSessionFindUnique.mockResolvedValue({ teacherId: "teacher-1" });

    const res = await patchSessionAnalysis(
      jsonReq("http://localhost/api/reports/session-analysis", {
        sessionId: "session-1",
        scope: "class",
        result: [],
      }),
    );

    expect(res.status).toBe(400);
    expect(prisma.sessionAnalysis.upsert).not.toHaveBeenCalled();
  });

  it("학생 세션 분석은 studentId 없이 실행하지 않는다", async () => {
    const res = await postStudentSessionAnalysis(
      jsonReq("http://localhost/api/reports/student-session-analysis", {
        sessionId: "session-1",
      }),
    );

    expect(res.status).toBe(400);
    expect(mockRunStudentAnalysis).not.toHaveBeenCalled();
  });

  it("일괄 학생 분석은 문자열이 아닌 세션 아이디를 거부한다", async () => {
    const res = await postBulkStudentAnalysis(
      jsonReq("http://localhost/api/reports/bulk-student-analysis", {
        grade: "4",
        className: "4",
        sessionIds: ["session-1", 123],
        cursor: 0,
      }),
    );

    expect(res.status).toBe(400);
    expect(prisma.teacherClass.findFirst).not.toHaveBeenCalled();
  });
});
