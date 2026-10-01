import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), session: vi.fn(), questions: vi.fn(), config: vi.fn(), generateContent: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/db", () => ({ prisma: {
  questionSession: { findFirst: mocks.session }, question: { findMany: mocks.questions },
} }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: mocks.config }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@google/genai", async (original) => ({
  ...await original<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent: mocks.generateContent }; },
}));

import { POST } from "@/app/api/unit-design/sequence/route";

const questions = Array.from({ length: 114 }, (_, index) => ({
  id: `question-${index}`, content: `지역 ${index}의 기후는 어떤 특징이 있을까?`,
  cognitive: "conceptual", context: null,
}));
const complete = { sequencedQuestions: questions.map((q, index) => ({
  mergedFrom: [`q${index + 1}`], content: q.content, contentGroup: `지역 ${index}의 기후`,
  type: "conceptual", priority: index + 1, lessonPhase: "탐구", rationale: "지역별 기후를 살펴봅니다.",
})) };
const reply = (value: unknown) => ({ text: JSON.stringify(value), candidates: [{ finishReason: "STOP" }] });
const request = (mode = "merge") => new Request("http://localhost/api/unit-design/sequence", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId: "수업-1", mode }),
});
const models = () => mocks.generateContent.mock.calls.map(([input]) => input.model);
const invalidArgument = () => Object.assign(new Error("Request contains an invalid argument."), { status: 400 });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "교사-1", role: "TEACHER" } });
  mocks.session.mockResolvedValue({ id: "수업-1", subject: "사회", topic: "세계의 자연환경" });
  mocks.questions.mockResolvedValue(questions);
  mocks.config.mockResolvedValue({ apiKey: "검사용 키", model: "gemini-3.1-flash-lite", isDemo: false });
});

describe("탐구설계의 실제 AI 계층 연결", () => {
  it.each(["merge", "sort"])("114개 질문의 %s 요청은 큰 배열 제약 없이 모든 원본을 보존한다", async (mode) => {
    mocks.generateContent.mockImplementation(async ({ config }) => {
      const list = config.responseJsonSchema.properties.sequencedQuestions;
      // 운영 API에서 거절된 배열 상한과 정렬의 큰 최소 개수 조건을 재현한다.
      if (list.maxItems > 20 || list.minItems > 20 || list.items.properties.mergedFrom?.maxItems > 20) {
        throw invalidArgument();
      }
      return reply(mode === "merge" ? complete : { sequencedQuestions: questions.map((_, index) => ({ id: `q${index + 1}` })) });
    });
    const data = await (await POST(request(mode))).json();
    expect(data.generatedBy).toBe("ai");
    expect(data.sequencedQuestions).toHaveLength(114);
    expect(data.sequencedQuestions.map((q: { content: string }) => q.content)).toEqual(questions.map(q => q.content));
  });

  it.each(["누락", "중복", "알 수 없는 번호"])("Flash-Lite의 %s 결과는 Flash로 전환해 완전한 결과만 반환한다", async (problem) => {
    const incomplete = structuredClone(complete);
    if (problem === "누락") incomplete.sequencedQuestions.pop();
    if (problem === "중복") incomplete.sequencedQuestions[113].mergedFrom = ["q1"];
    if (problem === "알 수 없는 번호") incomplete.sequencedQuestions[113].mergedFrom = ["없는 질문"];
    mocks.generateContent.mockImplementation(async ({ model }) => reply(
      model === "gemini-3.1-flash-lite" ? incomplete : complete,
    ));
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("ai");
    expect(data.sequencedQuestions.flatMap((q: { mergedFrom: string[] }) => q.mergedFrom)).toEqual(questions.map(q => q.content));
    expect(models()).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview"]);
  });

  it("Flash-Lite가 일반적인 요청 인자 오류를 반환해도 Flash에서 한 번 복구한다", async () => {
    mocks.generateContent.mockRejectedValueOnce(invalidArgument()).mockResolvedValueOnce(reply(complete));
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("ai");
    expect(data.sequencedQuestions).toHaveLength(114);
    expect(models()).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview"]);
  });

  it("두 모델 모두 불완전하면 성공으로 표시하지 않고 114개 원본을 모두 보존한다", async () => {
    mocks.generateContent.mockResolvedValue(reply({ sequencedQuestions: complete.sequencedQuestions.slice(0, 1) }));
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions.flatMap((q: { mergedFrom: string[] }) => q.mergedFrom).sort()).toEqual(questions.map(q => q.content).sort());
    expect(models()).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3-flash-preview"]);
  });

  it("두 모델이 요청을 거절해도 무한 전환하지 않고 원본을 보존한다", async () => {
    mocks.generateContent.mockRejectedValue(invalidArgument());
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions).toHaveLength(114);
    expect(models()).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview"]);
  });

  it("잘못된 API 키는 모델을 바꿔 반복 요청하지 않는다", async () => {
    mocks.generateContent.mockRejectedValue(Object.assign(new Error("API_KEY_INVALID: INVALID_ARGUMENT"), { status: 400 }));
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions).toHaveLength(114);
    expect(models()).toEqual(["gemini-3.1-flash-lite"]);
  });

  it("안전 차단은 보완 요청이나 모델 전환 없이 원본을 보존한다", async () => {
    mocks.generateContent.mockResolvedValue({ text: "", candidates: [{ finishReason: "SAFETY" }] });
    const data = await (await POST(request())).json();
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions).toHaveLength(114);
    expect(models()).toEqual(["gemini-3.1-flash-lite"]);
  });
});
