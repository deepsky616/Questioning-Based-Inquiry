import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), session: vi.fn(), questions: vi.fn(), generate: vi.fn(), config: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/lib/db", () => ({ prisma: { questionSession: { findFirst: mocks.session }, question: { findMany: mocks.questions } } }));
vi.mock("@/lib/ai", () => ({ generateJson: mocks.generate }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: mocks.config }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "@/app/api/unit-design/sequence/route";

const questions = [
  { id: "a", content: "빛은 왜 필요할까?", cognitive: "conceptual", context: "식물의 자람" },
  { id: "b", content: "식물에 물은 얼마나 줄까?", cognitive: "factual", context: null },
];
const request = (body: Record<string, unknown> = {}) => new Request("http://localhost/api/unit-design/sequence", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId: "수업-1", mode: "merge", ...body }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "교사-1", role: "TEACHER" } });
  mocks.session.mockResolvedValue({ id: "수업-1", subject: "과학", topic: "식물" });
  mocks.questions.mockResolvedValue(questions);
  mocks.config.mockResolvedValue({ apiKey: "검사용 키", model: "검사용 모델" });
});

describe("탐구설계 질문 분류 경로", () => {
  it("다른 교사의 수업은 모델이나 질문 조회 전에 차단한다", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "수업-1", teacherId: "교사-1" } }));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.questions).not.toHaveBeenCalled();
  });

  it("학생 계정은 분류할 수 없다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "학생-1", role: "STUDENT" } });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("원본이 누락된 결과를 반복하면 원본 전체를 남기고 규칙 결과로 알린다", async () => {
    mocks.generate.mockResolvedValue({ sequencedQuestions: [{ mergedFrom: ["a"], content: questions[0].content, contentGroup: "빛" }] });
    const response = await POST(request());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions.flatMap((q: { mergedFrom: string[] }) => q.mergedFrom).sort()).toEqual(questions.map(q => q.content).sort());
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });

  it("키가 없어도 교사 추가 질문까지 빠짐없이 보존한다", async () => {
    mocks.config.mockResolvedValue({ apiKey: null });
    const data = await (await POST(request({ additionalQuestions: ["빛의 양을 바꾸면 어떤 차이가 날까?"] }))).json();
    expect(data.generatedBy).toBe("rules");
    expect(data.sequencedQuestions).toHaveLength(3);
    expect(data.sequencedQuestions.filter((q: { source: string }) => q.source === "teacher")).toHaveLength(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("같은 문장의 서로 다른 묶음도 번호로 정렬해 원본 연결과 교사 편집을 유지한다", async () => {
    const currentQuestions = [
      { id: "묶음-1", content: "어떤 영향을 줄까?", contentGroup: "빛", type: "conceptual", mergedFrom: ["빛의 영향은?", "햇빛의 역할은?"] },
      { id: "묶음-2", content: "어떤 영향을 줄까?", contentGroup: "물", type: "conceptual", mergedFrom: ["물의 영향은?", "물을 주는 까닭은?"] },
    ];
    mocks.generate.mockResolvedValue({ sequencedQuestions: [{ id: "묶음-2", priority: 1, content: "임의 수정" }, { id: "묶음-1", priority: 2 }] });
    const data = await (await POST(request({ mode: "sort", currentQuestions }))).json();
    expect(data.generatedBy).toBe("ai");
    expect(data.sequencedQuestions.map((q: { id: string }) => q.id)).toEqual(["묶음-2", "묶음-1"]);
    expect(data.sequencedQuestions[0]).toMatchObject(currentQuestions[1]);
    expect(data.sequencedQuestions[1]).toMatchObject(currentQuestions[0]);
    expect(mocks.questions).not.toHaveBeenCalled();
  });

  it("중복된 현재 질문 번호는 입력 오류로 처리한다", async () => {
    const response = await POST(request({ mode: "sort", currentQuestions: [{ id: "같음", content: "가" }, { id: "같음", content: "나" }] }));
    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
