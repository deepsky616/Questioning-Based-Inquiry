import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateContent = vi.hoisted(() => vi.fn());
const aiState = vi.hoisted(() => ({ apiKey: "test-api-key" as string | null, model: "gemini-3.1-flash-lite" }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/resolve-ai-config", () => ({
  resolveUserAiConfig: vi.fn(async () => ({ ...aiState })),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    systemConfig: { findUnique: vi.fn() },
    sessionAnalysis: { upsert: vi.fn() },
  },
}));
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/[id]/analysis/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindSession = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockFindConfig = prisma.systemConfig.findUnique as ReturnType<typeof vi.fn>;
const completeReport = {
  summary: "광합성과 식물의 자람을 탐구한 수업입니다.", insights: "원인과 결과를 연결하고 있습니다.",
  commentInsights: "댓글에서는 설명의 근거를 확인했습니다.", engagementInsights: "좋아요로 질문에 관심을 표현했습니다.",
  relevanceInsights: "수업 주제와 관련된 질문입니다.", balanceInsights: "사실 확인과 원리 탐구가 함께 나타납니다.",
  bestQuestion: "식물에게 빛이 필요한 이유는 무엇일까요?", nextQuestions: "빛의 양을 바꾸면 어떻게 달라질까요?", themes: ["광합성"],
};

describe("POST /api/sessions/[id]/analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockReset();
    aiState.apiKey = "test-api-key";
    aiState.model = "gemini-3.1-flash-lite";
  });

  it("학생 질문·배포 탐구설계 질문의 좋아요·댓글을 모두 분석하고 집계를 반환한다", async () => {
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
          source: "STUDENT",
          author: { role: "STUDENT" },
          _count: { likes: 2 },
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
          source: "TEACHER",
          author: { role: "TEACHER" },
          _count: { likes: 0 },
          comments: [
            {
              content: "교사 댓글입니다.",
              author: { name: "교사", role: "TEACHER" },
            },
          ],
        },
        {
          content: "배포한 탐구질문: 광합성은 왜 중요할까?",
          closure: "open",
          cognitive: "conceptual",
          source: "TEACHER_SHARED",
          author: { role: "TEACHER" },
          _count: { likes: 5 },
          comments: [
            {
              content: "산소를 만들어서 중요해요.",
              author: { name: "학생2", role: "STUDENT" },
            },
          ],
        },
      ],
    });
    mockFindConfig
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce({ value: "gemini-3.1-flash-lite" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        summary: "질문과 댓글이 광합성의 장소와 에너지 전환에 집중되어 있습니다.",
        themes: ["광합성", "엽록체"],
        insights: "다음 수업에서 근거를 확장하면 좋습니다.",
        commentInsights: "학생 댓글은 사실 확인에서 개념 연결로 이동하고 있습니다.",
        engagementInsights: "배포 질문에 좋아요가 몰렸고 참여가 활발합니다.",
        relevanceInsights: completeReport.relevanceInsights,
        balanceInsights: completeReport.balanceInsights,
        bestQuestion: completeReport.bestQuestion,
        nextQuestions: completeReport.nextQuestions,
      }),
    });

    const res = await POST(new Request("http://localhost/api/sessions/session-1/analysis"), {
      params: Promise.resolve({ id: "session-1" }),
    });
    const body = await res.json();
    const prompt = mockGenerateContent.mock.calls[0][0].contents as string;

    expect(res.status).toBe(200);
    expect(prompt).toContain("[댓글 1 · 학생 · 학생1] 엽록체에서 일어나요.");
    expect(prompt).not.toContain("좋아요. 빛 에너지도 연결해 봅시다.");
    // 배포한 탐구설계 질문은 포함, 교사가 만든 일반 질문은 제외
    expect(prompt).toContain("배포한 탐구질문: 광합성은 왜 중요할까?");
    expect(prompt).not.toContain("교사가 작성한 안내 질문");
    expect(prompt).not.toContain("교사 댓글입니다.");
    // 좋아요 신호가 프롬프트에 들어간다
    expect(prompt).toContain("❤️");
    // 학생 질문 1개 + 배포 질문 1개 = 2개, 좋아요 2+5=7, 학생 댓글 2개
    expect(body.totalQuestions).toBe(2);
    expect(body.totalLikes).toBe(7);
    expect(body.totalComments).toBe(2);
    expect(body.commentInsights).toContain("학생 댓글");
    expect(body.engagementInsights).toContain("좋아요");
    expect(body.analysisModel).toBe("gemini-3.1-flash-lite");
    expect(typeof body.analyzedAt).toBe("string");
    const output = mockGenerateContent.mock.calls[0][0].config;
    expect(output.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(output.responseMimeType).toBe('application/json');
    expect(output.responseJsonSchema.required).toEqual(expect.arrayContaining(['summary', 'commentInsights', 'bestQuestion', 'nextQuestions', 'themes']));
    expect(prompt).toContain('각 설명은 80자 이내');
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
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it.each(["bestQuestion", "nextQuestions", "balanceInsights"])("경량 모델의 %s 누락은 Flash로 복구하고 실제 사용 모델을 저장한다", async (field) => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-report", role: "TEACHER" } });
    mockFindSession.mockResolvedValue({ id: "lesson", teacherId: "teacher-report", subject: "과학", topic: "광합성", questions: [] });
    const incomplete = { ...completeReport } as Record<string, unknown>;
    delete incomplete[field];
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(incomplete) })
      .mockResolvedValueOnce({ text: JSON.stringify(completeReport) });
    const res = await POST(new Request("http://localhost/api/sessions/lesson/analysis"), { params: Promise.resolve({ id: "lesson" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ...completeReport, analysisModel: "gemini-3-flash-preview" });
    expect(mockGenerateContent.mock.calls.map(([input]) => input.model)).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview"]);
    expect(prisma.sessionAnalysis.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ result: expect.objectContaining({ analysisModel: "gemini-3-flash-preview", nextQuestions: completeReport.nextQuestions }) }),
    }));
  });

  it("두 모델의 분석이 모두 불완전하면 기존 리포트를 덮어쓰지 않는다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-report", role: "TEACHER" } });
    mockFindSession.mockResolvedValue({ id: "lesson", teacherId: "teacher-report", subject: "과학", topic: "광합성", questions: [] });
    mockGenerateContent.mockResolvedValue({ text: '{"summary":"요약만 있는 응답"}' });
    const res = await POST(new Request("http://localhost/api/sessions/lesson/analysis"), { params: Promise.resolve({ id: "lesson" }) });
    expect(res.status).toBe(500);
    expect(prisma.sessionAnalysis.upsert).not.toHaveBeenCalled();
  });

  it("Flash를 직접 선택한 교사는 해당 모델로 분석하고 저장한다", async () => {
    aiState.model = "gemini-3-flash-preview";
    mockAuth.mockResolvedValue({ user: { id: "teacher-report", role: "TEACHER" } });
    mockFindSession.mockResolvedValue({ id: "lesson", teacherId: "teacher-report", subject: "과학", topic: "광합성", questions: [] });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(completeReport) });
    const body = await (await POST(new Request("http://localhost/api/sessions/lesson/analysis"), { params: Promise.resolve({ id: "lesson" }) })).json();
    expect(body.analysisModel).toBe("gemini-3-flash-preview");
    expect(mockGenerateContent.mock.calls.map(([input]) => input.model)).toEqual(["gemini-3-flash-preview"]);
  });
});
