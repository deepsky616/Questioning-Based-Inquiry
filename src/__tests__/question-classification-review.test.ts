import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { appendClassificationReview } from "@/lib/question-classification-review";
const findFirst = vi.fn();
const create = vi.fn();
const tx = { questionClassificationReview: { findFirst, create } } as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.resetAllMocks(); });
it("교사의 실제 변경 전후 분류와 이유를 함께 기록한다", async () => {
  await appendClassificationReview(tx, "q1", "t1", { closure: "closed", cognitive: "factual" }, { closure: "open", cognitive: "factual" }, "다른 사례도 확인할 수 있어요.");
  expect(create).toHaveBeenCalledWith({ data: { questionId: "q1", reviewerId: "t1", previousClosure: "closed", previousCognitive: "factual", closure: "open", cognitive: "factual", reason: "다른 사례도 확인할 수 있어요." } });
});
it("같은 확인을 재전송하면 이력을 중복 생성하지 않는다", async () => {
  const classification = { closure: "open", cognitive: "conceptual" };
  findFirst.mockResolvedValue({ ...classification, reviewerId: "t1", reason: "관계를 설명해요." });
  await appendClassificationReview(tx, "q1", "t1", classification, classification, "관계를 설명해요.");
  expect(create).not.toHaveBeenCalled();
  await appendClassificationReview(tx, "q1", "t1", classification, classification, "새로운 확인 이유");
  expect(create).toHaveBeenCalledTimes(1);
});
it("첫 확인은 분류가 같아도 기록하고 이력 저장 실패를 삼키지 않는다", async () => {
  const classification = { closure: "open", cognitive: "conceptual" };
  create.mockRejectedValue(new Error("시험용 기록 실패"));
  await expect(appendClassificationReview(tx, "q1", "t1", classification, classification, "")).rejects.toThrow("시험용 기록 실패");
});
