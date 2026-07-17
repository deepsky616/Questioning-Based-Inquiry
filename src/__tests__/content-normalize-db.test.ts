import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { normalizeContentForPersistence } from "@/lib/content-normalize-db";

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

describe("자료베이스 기준 내용 정규화", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("자료베이스 정규화 함수의 결과를 그대로 사용한다", async () => {
    queryRaw.mockResolvedValue([{ normalizedContent: "caféiv212" }]);

    await expect(normalizeContentForPersistence("cafe\u0301 \u2163 \u00b2 \u00bd"))
      .resolves.toBe("caféiv212");

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].sql).toContain("normalize_activity_content");
  });

  it("결과 행이 없으면 빈 내용으로 안전하게 처리한다", async () => {
    queryRaw.mockResolvedValue([]);

    await expect(normalizeContentForPersistence("질문"))
      .resolves.toBe("");
  });
});
