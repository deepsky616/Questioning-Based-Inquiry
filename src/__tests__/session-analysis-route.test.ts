import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    systemConfig: { findUnique: vi.fn() },
  },
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    };
  }),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/[id]/analysis/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindSession = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockFindConfig = prisma.systemConfig.findUnique as ReturnType<typeof vi.fn>;

describe("POST /api/sessions/[id]/analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("세션 질문의 댓글까지 AI 분석 프롬프트에 포함하고 댓글 수를 반환한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mockFindSession.mockResolvedValue({
      id: "session-1",
      teacherId: "teacher-1",
      subject: "과학",
      topic: "광합성",
      questions: [
        {
          content: "광합성이란?",
          closure: "closed",
          cognitive: "factual",
          author: { role: "STUDENT" },
          comments: [
            {
              content: "엽록체에서 일어나요.",
              author: { name: "학생1", role: "STUDENT" },
            },
            {
              content: "좋아요. 빛 에너지도 연결해 봅시다.",
              author: { name: "교사", role: "TEACHER" },
            },
          ],
        },
        {
          content: "교사가 작성한 안내 질문",
          closure: "open",
          cognitive: "conceptual",
          author: { role: "TEACHER" },
          comments: [
            {
              content: "교사 댓글입니다.",
              author: { name: "교사", role: "TEACHER" },
            },
          ],
        },
      ],
    });
    mockFindConfig
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce({ value: "gemini-2.5-flash" });
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            summary: "질문과 댓글이 광합성의 장소와 에너지 전환에 집중되어 있습니다.",
            themes: ["광합성", "엽록체"],
            insights: "다음 수업에서 근거를 확장하면 좋습니다.",
            commentInsights: "학생 댓글은 사실 확인에서 개념 연결로 이동하고 있습니다.",
          }),
      },
    });

    const res = await POST(new Request("http://localhost/api/sessions/session-1/analysis"), {
      params: { id: "session-1" },
    });
    const body = await res.json();
    const prompt = mockGenerateContent.mock.calls[0][0] as string;

    expect(res.status).toBe(200);
    expect(prompt).toContain("[댓글 1 · 학생 · 학생1] 엽록체에서 일어나요.");
    expect(prompt).not.toContain("좋아요. 빛 에너지도 연결해 봅시다.");
    expect(prompt).not.toContain("교사가 작성한 안내 질문");
    expect(prompt).not.toContain("교사 댓글입니다.");
    expect(body.totalQuestions).toBe(1);
    expect(body.totalComments).toBe(1);
    expect(body.commentInsights).toContain("학생 댓글");
  });

  it("다른 교사의 세션이면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mockFindSession.mockResolvedValue({
      id: "session-1",
      teacherId: "other-teacher",
      subject: "과학",
      topic: "광합성",
      questions: [],
    });

    const res = await POST(new Request("http://localhost/api/sessions/session-1/analysis"), {
      params: { id: "session-1" },
    });

    expect(res.status).toBe(403);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
