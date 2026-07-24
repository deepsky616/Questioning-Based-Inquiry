import { describe, expect, it, vi } from "vitest";
import {
  loadMysterySelectionProfile,
  recordMysteryAnswerUses,
} from "@/lib/mystery-answer-rotation-service";

function makeClient() {
  return {
    mysteryAnswerUse: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      createMany: vi.fn(),
    },
  };
}

describe("미스터리 박스 정답 순환 기록", () => {
  it("참가자별 최근 기록을 합치고 최신 두 분류와 전체 사용 횟수를 만든다", async () => {
    const client = makeClient();
    client.mysteryAnswerUse.findMany
      .mockResolvedValueOnce([
        {
          itemId: "apple",
          category: "food",
          createdAt: new Date("2026-07-24T03:00:00Z"),
        },
        {
          itemId: "cat",
          category: "animal",
          createdAt: new Date("2026-07-24T01:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          itemId: "rose",
          category: "plant",
          createdAt: new Date("2026-07-24T02:00:00Z"),
        },
        {
          itemId: "removed-item",
          category: "object",
          createdAt: new Date("2026-07-24T00:00:00Z"),
        },
      ]);
    client.mysteryAnswerUse.groupBy.mockResolvedValue([
      { itemId: "apple", _count: { _all: 3 } },
      { itemId: "cat", _count: { _all: 1 } },
      { itemId: "removed-item", _count: { _all: 9 } },
    ]);

    const profile = await loadMysterySelectionProfile(
      client as never,
      ["student-1", "student-2", "student-1"],
    );

    expect(client.mysteryAnswerUse.findMany).toHaveBeenCalledTimes(2);
    expect(client.mysteryAnswerUse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
    expect(profile).toEqual({
      recentItemIds: ["apple", "rose", "cat"],
      recentCategories: ["food", "plant"],
      usageCounts: { apple: 3, cat: 1 },
    });
  });

  it("같은 선택 기록은 학생별로 한 번만 저장하도록 일괄 등록한다", async () => {
    const client = makeClient();
    client.mysteryAnswerUse.createMany.mockResolvedValue({ count: 2 });

    await recordMysteryAnswerUses(client as never, {
      userIds: ["student-1", "student-2", "student-1"],
      item: { id: "apple", category: "food" },
      selectionKey: "room:1234:1:play-1",
    });

    expect(client.mysteryAnswerUse.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "student-1",
          itemId: "apple",
          category: "food",
          selectionKey: "room:1234:1:play-1",
        },
        {
          userId: "student-2",
          itemId: "apple",
          category: "food",
          selectionKey: "room:1234:1:play-1",
        },
      ],
      skipDuplicates: true,
    });
  });
});
