import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { create: vi.fn() },
    teacherClass: { findMany: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{
      id: "ud-1",
      teacher_id: "teacher-1",
      title: "광합성 단원",
      subject: "과학",
      inquiry_questions: [{ type: "factual", content: "광합성이란?" }],
    }]),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/route";
import { POST as createSessionFromDesign } from "@/app/api/unit-design/[id]/session/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockSessionCreate = prisma.questionSession.create as ReturnType<typeof vi.fn>;

const TEACHER_SESSION = {
  user: { id: "teacher-1", role: "TEACHER", name: "교사" },
};

const makeRequest = (body: object) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeCtx = (id: string) => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionCreate.mockResolvedValue({ id: "qs-1" });
});

// ─── POST /api/sessions ───────────────────────────────────────────────────────

describe("POST /api/sessions — defaultQuestionPublic 기본값", () => {
  it("defaultQuestionPublic을 보내지 않으면 true로 세션이 생성된다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);

    const req = makeRequest({
      date: "2026-05-10",
      subject: "과학",
      topic: "광합성",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defaultQuestionPublic: true,
      }),
    });
  });

  it("defaultQuestionPublic: false를 명시적으로 보내면 false로 세션이 생성된다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);

    const req = makeRequest({
      date: "2026-05-10",
      subject: "과학",
      topic: "광합성",
      defaultQuestionPublic: false,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defaultQuestionPublic: false,
      }),
    });
  });
});

// ─── POST /api/unit-design/[id]/session ───────────────────────────────────────

describe("POST /api/unit-design/[id]/session — defaultQuestionPublic 기본값", () => {
  it("defaultQuestionPublic을 보내지 않으면 true로 세션이 생성된다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);

    const req = makeRequest({
      date: "2026-05-10",
      sharedQuestions: [{ type: "factual", content: "광합성이란?" }],
    });

    const res = await createSessionFromDesign(req, makeCtx("ud-1"));
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defaultQuestionPublic: true,
      }),
    });
  });
});
