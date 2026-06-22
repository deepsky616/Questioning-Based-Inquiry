import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * 질문 삭제 시 해당 질문 + 그 질문의 댓글 번역 캐시를 정리한다(베스트 에포트).
 * 반드시 질문/댓글을 실제 삭제하기 "전에" 호출해야 댓글 id를 조회할 수 있다.
 * 캐시 정리는 보조 동작이므로 실패해도 본 삭제를 막지 않는다.
 */
export async function cleanupQuestionTranslations(questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return;
  try {
    const comments = await prisma.comment.findMany({
      where: { questionId: { in: questionIds } },
      select: { id: true },
    });
    const commentIds = comments.map((c) => c.id);
    await prisma.translation.deleteMany({
      where: {
        OR: [
          { sourceType: "QUESTION", sourceId: { in: questionIds } },
          ...(commentIds.length ? [{ sourceType: "COMMENT", sourceId: { in: commentIds } }] : []),
        ],
      },
    });
  } catch (err) {
    logger.error("cleanupQuestionTranslations failed", err);
  }
}

/** 댓글 삭제 시 해당 댓글의 번역 캐시를 정리한다(베스트 에포트). */
export async function cleanupCommentTranslations(commentIds: string[]): Promise<void> {
  if (commentIds.length === 0) return;
  try {
    await prisma.translation.deleteMany({
      where: { sourceType: "COMMENT", sourceId: { in: commentIds } },
    });
  } catch (err) {
    logger.error("cleanupCommentTranslations failed", err);
  }
}
