import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  AiQuotaError: class AiQuotaError extends Error {},
  AiBusyError: class AiBusyError extends Error {},
  generateJsonWithMetadata: vi.fn(),
}));

import { POST } from "@/app/api/classify/route";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AiBusyError,
  AiKeyMissingError,
  generateJsonWithMetadata,
} from "@/lib/ai";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mGenerate = generateJsonWithMetadata as unknown as ReturnType<typeof vi.fn>;
const mWarn = logger.warn as unknown as ReturnType<typeof vi.fn>;

function request(content = "광합성이란 무엇인가요?") {
  return new Request("http://localhost/api/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
});

describe("POST /api/classify", () => {
  it("구조화된 인공지능 분석과 개선 질문 예시 및 실제 모델을 반환한다", async () => {
    mGenerate.mockResolvedValue({
      data: {
        closure: "closed",
        cognitive: "factual",
        closureScore: 0.91,
        cognitiveScore: 0.88,
        reasoning: "정해진 사실을 확인하는 질문입니다.",
        feedback: "좋은 출발이에요. 생각의 범위를 넓혀 보세요.",
        improvedExample: "광합성이 없다면 생태계는 어떻게 달라질까요?",
        inappropriate: false,
        inappropriateReason: "",
      },
      model: "gemini-2.5-flash",
    });

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      analysisSource: "ai",
      analysisModel: "gemini-2.5-flash",
      improvedExample: "광합성이 없다면 생태계는 어떻게 달라질까요?",
    });
    expect(mGenerate).toHaveBeenCalledWith(expect.objectContaining({
      responseMimeType: "application/json",
      responseJsonSchema: expect.any(Object),
    }));
  });

  it("짧은 질문 분류에서는 사고 예산을 끄고 완전한 구조화 응답을 받는다", async () => {
    mGenerate.mockImplementation(async (options: { thinkingBudget?: number }) => ({
      data: options.thinkingBudget === 0
        ? {
            closure: "open",
            cognitive: "conceptual",
            closureScore: 0.2,
            cognitiveScore: 0.9,
            reasoning: "두 현상의 차이를 비교하고 설명하는 질문입니다.",
            feedback: "좋은 비교 질문이에요. 관찰할 기준을 더해 보세요.",
            improvedExample: "",
            inappropriate: false,
            inappropriateReason: "",
          }
        : {
            closure: "",
            cognitive: "",
            closureScore: null,
            cognitiveScore: null,
          },
      model: "gemini-2.5-flash",
    }));

    const response = await POST(request(
      "물이 끓을 때와 빨래가 마를 때 생기는 수증기는 어떻게 다를까요?",
    ));
    const data = await response.json();

    expect(data).toMatchObject({
      analysisSource: "ai",
      cognitive: "conceptual",
      analysisModel: "gemini-2.5-flash",
    });
  });

  it("인공지능 키가 없으면 기본 분석임을 숨기지 않는다", async () => {
    mGenerate.mockRejectedValue(new AiKeyMissingError());

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      analysisSource: "fallback",
      fallbackReason: "missing-key",
      reasoning: "키워드 기반 자동 분류",
    });
    expect(data.analysisModel).toBeUndefined();
  });

  it("인공지능이 일시적으로 혼잡해도 기본 분석으로 흐름을 이어가고 상태를 알린다", async () => {
    mGenerate.mockRejectedValue(new AiBusyError());

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      analysisSource: "fallback",
      fallbackReason: "busy",
      reasoning: "키워드 기반 자동 분류",
    });
    expect(mWarn).toHaveBeenCalledWith(
      "질문 분석이 기본 분석으로 전환됐습니다",
      { fallbackReason: "busy" },
    );
  });
});
