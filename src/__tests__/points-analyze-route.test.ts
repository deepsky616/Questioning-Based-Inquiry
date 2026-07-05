import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AiBusyError, AiKeyMissingError } from "@/lib/ai-errors";
import { normalizeContent } from "@/lib/content-normalize";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({ generateJson: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    question: { findMany: vi.fn(), update: vi.fn() },
    comment: { update: vi.fn() },
    pointLog: { create: vi.fn() },
  },
}));

import { POST } from "@/app/api/teacher/points/analyze/route";
import { auth } from "@/lib/auth";
import { generateJson } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mGenerateJson = generateJson as unknown as ReturnType<typeof vi.fn>;
const sessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const questionMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const questionUpdate = prisma.question.update as unknown as ReturnType<typeof vi.fn>;
const commentUpdate = prisma.comment.update as unknown as ReturnType<typeof vi.fn>;
const pointCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest("http://localhost/api/teacher/points/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const teacherSession = { user: { id: "teacher-1", role: "TEACHER" } };
const ownedSession = {
  id: "session-1",
  teacherId: "teacher-1",
  subject: "과학",
  topic: "광합성",
  date: "2026-07-05",
};

const questionRows = [
  {
    id: "q1",
    content: "광합성은 왜 식물에게 중요할까?",
    normalizedContent: "광합성은왜식물에게중요할까",
    authorId: "student-1",
    author: { id: "student-1", name: "민준" },
    comments: [
      {
        id: "c1",
        content: "빛 에너지를 양분으로 바꾸기 때문입니다.",
        normalizedContent: "",
        authorId: "student-2",
        author: { id: "student-2", name: "서연" },
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue(teacherSession);
  sessionFind.mockResolvedValue(ownedSession);
  questionMany.mockResolvedValue(questionRows);
  questionUpdate.mockResolvedValue({});
  commentUpdate.mockResolvedValue({});
  pointCreate.mockResolvedValue({ id: "point-1" });
  mGenerateJson.mockResolvedValue({
    bonuses: [
      {
        studentId: "student-1",
        targetId: "q1",
        targetType: "question",
        bonusType: "DEEP_QUESTION",
        reason: "주제와 관련해 이유를 탐구하는 질문입니다.",
      },
      {
        studentId: "student-2",
        targetId: "c1",
        targetType: "comment",
        bonusType: "APT_ANSWER",
        reason: "질문에 맞는 과학적 설명을 제시했습니다.",
      },
    ],
    summary: "광합성의 의미와 에너지 전환을 잘 탐구했습니다.",
  });
});

describe("POST /api/teacher/points/analyze", () => {
  it("로그인이 없으면 401을 반환한다", async () => {
    mAuth.mockResolvedValue(null);

    const res = await POST(req({ sessionId: "session-1" }));

    expect(res.status).toBe(401);
    expect(sessionFind).not.toHaveBeenCalled();
  });

  it("학생 역할은 분석할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });

    const res = await POST(req({ sessionId: "session-1" }));

    expect(res.status).toBe(403);
    expect(sessionFind).not.toHaveBeenCalled();
  });

  it("다른 교사의 세션은 분석할 수 없다", async () => {
    sessionFind.mockResolvedValue({ ...ownedSession, teacherId: "teacher-2" });

    const res = await POST(req({ sessionId: "session-1" }));

    expect(res.status).toBe(403);
    expect(questionMany).not.toHaveBeenCalled();
    expect(mGenerateJson).not.toHaveBeenCalled();
  });

  it("분석할 학생 질문이 없으면 AI를 호출하지 않는다", async () => {
    questionMany.mockResolvedValue([]);

    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("분석할 활동");
    expect(body.aiStatus).toBe("skipped");
    expect(mGenerateJson).not.toHaveBeenCalled();
  });

  it("AI 추천 포인트 분석은 quality 작업으로 호출하고 PENDING 후보를 저장한다", async () => {
    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mGenerateJson).toHaveBeenCalledWith(expect.objectContaining({
      userId: "teacher-1",
      localize: true,
      quality: true,
    }));
    expect(pointCreate).toHaveBeenCalledTimes(2);
    expect(pointCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        gameId: "ACTIVITY",
        bonusType: "AI_DEEP_QUESTION",
        points: 5,
        status: "PENDING",
        sessionId: "session-1",
        relatedQuestionId: "q1",
        aiAnalysis: "광합성의 의미와 에너지 전환을 잘 탐구했습니다.",
      }),
      select: { id: true },
    });
    expect(pointCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-2",
        bonusType: "AI_APT_ANSWER",
        points: 2,
        relatedCommentId: "c1",
      }),
      select: { id: true },
    });
    expect(body.createdPending).toBe(2);
    expect(body.questionCount).toBe(1);
    expect(body.commentCount).toBe(1);
    expect(body.aiStatus).toBe("success");
    expect(body.aiErrorType).toBeNull();
    expect(body.fallbackUsed).toBe(false);
  });

  it("AI 키가 없으면 실패 원인을 missing_key로 반환하고 중복 후보 fallback 여부를 알려준다", async () => {
    mGenerateJson.mockRejectedValue(new AiKeyMissingError());

    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiStatus).toBe("failed");
    expect(body.aiErrorType).toBe("missing_key");
    expect(body.fallbackUsed).toBe(false);
    expect(body.createdPending).toBe(0);
  });

  it("Gemini 혼잡 오류는 busy로 반환한다", async () => {
    mGenerateJson.mockRejectedValue(new AiBusyError());

    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiStatus).toBe("failed");
    expect(body.aiErrorType).toBe("busy");
  });

  it("AI 응답 파싱 오류는 invalid_response로 반환한다", async () => {
    mGenerateJson.mockRejectedValue(new SyntaxError("Unexpected token"));

    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiStatus).toBe("failed");
    expect(body.aiErrorType).toBe("invalid_response");
  });

  it("정규화가 비어 있는 옛 질문과 댓글을 분석 뒤 보완한다", async () => {
    questionMany.mockResolvedValue([
      {
        ...questionRows[0],
        normalizedContent: "",
        comments: [{ ...questionRows[0].comments[0], normalizedContent: "" }],
      },
    ]);

    const res = await POST(req({ sessionId: "session-1" }));

    expect(res.status).toBe(200);
    expect(questionUpdate).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { normalizedContent: normalizeContent("광합성은 왜 식물에게 중요할까?") },
    });
    expect(commentUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { normalizedContent: normalizeContent("빛 에너지를 양분으로 바꾸기 때문입니다.") },
    });
  });

  it("이미 정규화된 동일 내용은 중복 후보로 함께 저장한다", async () => {
    mGenerateJson.mockResolvedValue({ bonuses: [], summary: "중복 검토" });
    questionMany.mockResolvedValue([
      {
        id: "q1",
        content: "같은 질문",
        normalizedContent: "같은질문",
        authorId: "student-1",
        author: { id: "student-1", name: "민준" },
        comments: [],
      },
      {
        id: "q2",
        content: "같은 질문",
        normalizedContent: "같은질문",
        authorId: "student-2",
        author: { id: "student-2", name: "서연" },
        comments: [],
      },
    ]);

    const res = await POST(req({ sessionId: "session-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(pointCreate).toHaveBeenCalledTimes(1);
    expect(pointCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-2",
        bonusType: "AI_DUPLICATE_FLAGGED",
        points: 0,
        relatedQuestionId: "q2",
        status: "PENDING",
      }),
      select: { id: true },
    });
    expect(body.createdPending).toBe(1);
    expect(body.fallbackUsed).toBe(true);
  });
});
