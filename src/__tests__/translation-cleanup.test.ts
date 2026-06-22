import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    comment: { findMany: vi.fn() },
    translation: { deleteMany: vi.fn() },
  },
}));

import { cleanupQuestionTranslations, cleanupCommentTranslations } from "@/lib/translation-cleanup";
import { prisma } from "@/lib/db";

const findComments = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const delMany = prisma.translation.deleteMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  findComments.mockResolvedValue([]);
  delMany.mockResolvedValue({ count: 0 });
});

describe("cleanupQuestionTranslations", () => {
  it("빈 입력은 아무것도 안 함", async () => {
    await cleanupQuestionTranslations([]);
    expect(findComments).not.toHaveBeenCalled();
    expect(delMany).not.toHaveBeenCalled();
  });

  it("질문 + 댓글 번역을 함께 삭제한다", async () => {
    findComments.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    await cleanupQuestionTranslations(["q1"]);
    expect(delMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sourceType: "QUESTION", sourceId: { in: ["q1"] } },
          { sourceType: "COMMENT", sourceId: { in: ["c1", "c2"] } },
        ],
      },
    });
  });

  it("댓글이 없으면 질문 번역만 삭제", async () => {
    await cleanupQuestionTranslations(["q1"]);
    expect(delMany).toHaveBeenCalledWith({
      where: { OR: [{ sourceType: "QUESTION", sourceId: { in: ["q1"] } }] },
    });
  });

  it("DB 오류가 나도 예외를 전파하지 않는다(베스트 에포트)", async () => {
    findComments.mockRejectedValue(new Error("db down"));
    await expect(cleanupQuestionTranslations(["q1"])).resolves.toBeUndefined();
  });
});

describe("cleanupCommentTranslations", () => {
  it("댓글 번역만 삭제한다", async () => {
    await cleanupCommentTranslations(["c1"]);
    expect(delMany).toHaveBeenCalledWith({
      where: { sourceType: "COMMENT", sourceId: { in: ["c1"] } },
    });
  });

  it("빈 입력은 아무것도 안 함", async () => {
    await cleanupCommentTranslations([]);
    expect(delMany).not.toHaveBeenCalled();
  });
});
