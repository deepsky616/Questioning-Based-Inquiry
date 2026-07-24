import type { Prisma } from "@prisma/client";
import {
  MYSTERY_CATEGORIES,
  MYSTERY_ITEMS,
  type MysteryCategory,
  type MysteryItem,
  type MysterySelectionProfile,
} from "@/lib/mystery-box-rules";

type MysteryAnswerUseClient = Pick<Prisma.TransactionClient, "mysteryAnswerUse">;

const RECENT_ITEM_LIMIT = 10;
const RECENT_CATEGORY_LIMIT = 2;

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export async function loadMysterySelectionProfile(
  client: MysteryAnswerUseClient,
  userIds: readonly string[],
): Promise<MysterySelectionProfile> {
  const distinctUserIds = uniqueStrings(userIds);
  if (distinctUserIds.length === 0) {
    return { recentItemIds: [], recentCategories: [], usageCounts: {} };
  }

  const [recentByUser, usageRows] = await Promise.all([
    Promise.all(
      distinctUserIds.map((userId) =>
        client.mysteryAnswerUse.findMany({
          where: { userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: RECENT_ITEM_LIMIT,
          select: {
            itemId: true,
            category: true,
            createdAt: true,
          },
        })
      ),
    ),
    client.mysteryAnswerUse.groupBy({
      by: ["itemId"],
      where: { userId: { in: distinctUserIds } },
      _count: { _all: true },
    }),
  ]);

  const validItemIds = new Set(MYSTERY_ITEMS.map(({ id }) => id));
  const validCategories = new Set<string>(MYSTERY_CATEGORIES);
  const recentRows = recentByUser
    .flat()
    .filter(
      (row) =>
        validItemIds.has(row.itemId) &&
        validCategories.has(row.category),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    recentItemIds: uniqueStrings(recentRows.map(({ itemId }) => itemId)),
    recentCategories: uniqueStrings(
      recentRows.map(({ category }) => category),
    ).slice(0, RECENT_CATEGORY_LIMIT) as MysteryCategory[],
    usageCounts: Object.fromEntries(
      usageRows
        .filter(({ itemId }) => validItemIds.has(itemId))
        .map(({ itemId, _count }) => [itemId, _count._all]),
    ),
  };
}

export async function recordMysteryAnswerUses(
  client: MysteryAnswerUseClient,
  input: {
    userIds: readonly string[];
    item: Pick<MysteryItem, "id" | "category">;
    selectionKey: string;
  },
): Promise<void> {
  const userIds = uniqueStrings(input.userIds);
  if (userIds.length === 0) return;
  await client.mysteryAnswerUse.createMany({
    data: userIds.map((userId) => ({
      userId,
      itemId: input.item.id,
      category: input.item.category,
      selectionKey: input.selectionKey,
    })),
    skipDuplicates: true,
  });
}
