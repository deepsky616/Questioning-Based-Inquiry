import type { Prisma } from "@prisma/client";

interface Classification { closure: string; cognitive: string }

/** 질문 행을 잠근 동일 트랜잭션에서 호출하여 분류 변경과 이력을 함께 저장한다. */
export async function appendClassificationReview(tx: Prisma.TransactionClient, questionId: string, reviewerId: string, before: Classification, after: Classification, reason: string) {
  const latest = await tx.questionClassificationReview.findFirst({
    where: { questionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (before.closure === after.closure && before.cognitive === after.cognitive &&
    latest?.reviewerId === reviewerId && latest.closure === after.closure && latest.cognitive === after.cognitive && latest.reason === reason) return;
  await tx.questionClassificationReview.create({ data: {
    questionId, reviewerId, previousClosure: before.closure, previousCognitive: before.cognitive,
    closure: after.closure, cognitive: after.cognitive, reason,
  } });
}
