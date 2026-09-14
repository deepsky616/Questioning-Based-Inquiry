import { beforeEach, expect, it, vi } from "vitest";
import { AiBusyError, AiKeyMissingError, AiOutputTruncatedError, AiQuotaError } from "@/lib/ai-errors";
import { mysteryUncertainAnswer, questionGameAiError } from "@/lib/question-game-ai-errors";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

it.each([
  [new AiKeyMissingError(), "AI_CONFIGURATION_REQUIRED"],
  [new AiQuotaError(), "AI_QUOTA_EXCEEDED"],
  [new AiOutputTruncatedError(), "AI_OUTPUT_TRUNCATED"],
  [new AiBusyError(), "AI_BUSY"],
  [new Error("비공개 응답과 질문"), "AI_UNAVAILABLE"],
])("질문놀이 오류를 원인별로 안내하고 원문은 노출하지 않는다", (error, code) => {
  const result = questionGameAiError(error, "ko");
  expect(result.code).toBe(code);
  expect(result.error).not.toContain("비공개");
  expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("비공개");
  expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { code });
});

it("판정 보류는 영어에서도 이미 예·아니오 형식인 질문을 잘못 썼다고 안내하지 않는다", () => {
  expect(mysteryUncertainAnswer("en")).toMatchObject({ mysteryAnswerUncertain: true, mysteryRewriteRequired: true });
  expect(mysteryUncertainAnswer("en").error).toContain("turn has not been used");
});
