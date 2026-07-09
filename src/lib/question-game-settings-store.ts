import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AnyGame, CustomGame, GameVisibility } from "@/lib/question-games-data";

type StoredCustomGame = Omit<CustomGame, "isBuiltIn" | "teacherId">;

function toCustomGame(row: {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  emoji: string;
  gradientCss: string;
  accentColor: string;
  playerCount: string;
  duration: string;
  instructions: unknown;
  order: number;
}): CustomGame {
  return {
    id: row.id,
    teacherId: row.teacherId,
    title: row.title,
    description: row.description,
    emoji: row.emoji,
    gradientCss: row.gradientCss,
    accentColor: row.accentColor,
    playerCount: row.playerCount,
    duration: row.duration,
    instructions: Array.isArray(row.instructions) ? row.instructions.map(String) : [],
    isBuiltIn: false,
    order: row.order,
  };
}

function sanitizeVisibility(value: unknown): GameVisibility {
  if (!value || typeof value !== "object") return { type: "all" };
  const raw = value as Partial<GameVisibility>;
  if (raw.type !== "all" && raw.type !== "hidden" && raw.type !== "classes" && raw.type !== "students") {
    return { type: "all" };
  }
  return {
    type: raw.type,
    classKeys: Array.isArray(raw.classKeys) ? raw.classKeys.map(String) : undefined,
    studentIds: Array.isArray(raw.studentIds) ? raw.studentIds.map(String) : undefined,
  };
}

function toStoredGame(game: Partial<StoredCustomGame>, fallbackOrder: number): StoredCustomGame {
  return {
    id: typeof game.id === "string" && game.id ? game.id : `custom-${randomBytes(4).toString("hex")}`,
    title: String(game.title ?? ""),
    description: String(game.description ?? ""),
    emoji: String(game.emoji ?? ""),
    gradientCss: String(game.gradientCss ?? ""),
    accentColor: String(game.accentColor ?? "#6366f1"),
    playerCount: String(game.playerCount ?? "제한없음"),
    duration: String(game.duration ?? "20분"),
    instructions: Array.isArray(game.instructions) ? game.instructions.map(String) : [],
    order: typeof game.order === "number" ? game.order : fallbackOrder,
  };
}

export async function loadQuestionGameSettings(teacherId: string): Promise<{
  customGames: CustomGame[];
  visibilityMap: Record<string, GameVisibility>;
  orderIds: string[] | null;
}> {
  const [customRows, visibilityRows, orderRow] = await Promise.all([
    prisma.questionGameCustom.findMany({ where: { teacherId }, orderBy: { order: "asc" } }),
    prisma.questionGameVisibility.findMany({ where: { teacherId } }),
    prisma.questionGameOrder.findUnique({ where: { teacherId } }),
  ]);

  return {
    customGames: customRows.map(toCustomGame),
    visibilityMap: Object.fromEntries(
      visibilityRows.map((row) => [row.gameId, sanitizeVisibility(row.visibility)]),
    ),
    orderIds: Array.isArray(orderRow?.gameIds) ? orderRow.gameIds.map(String) : null,
  };
}

export async function loadQuestionGameSettingsForTeachers(teacherIds: string[]): Promise<{
  customGames: AnyGame[];
  visibilityMap: Record<string, GameVisibility>;
  orderIds: string[] | null;
}> {
  const allSettings = await Promise.all(teacherIds.map((teacherId) => loadQuestionGameSettings(teacherId)));
  const visibilityMap: Record<string, GameVisibility> = {};
  const customGames: AnyGame[] = [];
  let orderIds: string[] | null = null;

  for (const settings of allSettings) {
    Object.assign(visibilityMap, settings.visibilityMap);
    customGames.push(...settings.customGames);
    if (!orderIds && settings.orderIds) orderIds = settings.orderIds;
  }

  return { customGames, visibilityMap, orderIds };
}

export async function createQuestionGame(
  teacherId: string,
  game: Partial<StoredCustomGame>,
): Promise<CustomGame> {
  const count = await prisma.questionGameCustom.count({ where: { teacherId } });
  const stored = toStoredGame(game, 100 + count);
  const row = await prisma.questionGameCustom.create({
    data: {
      id: stored.id,
      teacherId,
      title: stored.title,
      description: stored.description,
      emoji: stored.emoji,
      gradientCss: stored.gradientCss,
      accentColor: stored.accentColor,
      playerCount: stored.playerCount,
      duration: stored.duration,
      instructions: stored.instructions as Prisma.InputJsonValue,
      order: stored.order,
    },
  });
  return toCustomGame(row);
}

export async function updateQuestionGame(
  teacherId: string,
  gameId: string,
  patch: Partial<StoredCustomGame>,
): Promise<boolean> {
  const existing = await prisma.questionGameCustom.findFirst({ where: { id: gameId, teacherId } });
  if (!existing) return false;
  const merged = toStoredGame({ ...toCustomGame(existing), ...patch, id: gameId }, existing.order);
  await prisma.questionGameCustom.update({
    where: { id: gameId },
    data: {
      title: merged.title,
      description: merged.description,
      emoji: merged.emoji,
      gradientCss: merged.gradientCss,
      accentColor: merged.accentColor,
      playerCount: merged.playerCount,
      duration: merged.duration,
      instructions: merged.instructions as Prisma.InputJsonValue,
      order: merged.order,
    },
  });
  return true;
}

export async function deleteQuestionGame(teacherId: string, gameId: string): Promise<boolean> {
  const deleted = await prisma.questionGameCustom.deleteMany({ where: { id: gameId, teacherId } });
  await prisma.questionGameVisibility.deleteMany({ where: { teacherId, gameId } });
  return deleted.count > 0;
}

export async function saveQuestionGameVisibility(
  teacherId: string,
  gameId: string,
  visibility: GameVisibility,
) {
  await prisma.questionGameVisibility.upsert({
    where: { teacherId_gameId: { teacherId, gameId } },
    update: { visibility: visibility as unknown as Prisma.InputJsonValue },
    create: { teacherId, gameId, visibility: visibility as unknown as Prisma.InputJsonValue },
  });
}

export async function saveQuestionGameOrder(teacherId: string, gameIds: string[]) {
  await prisma.questionGameOrder.upsert({
    where: { teacherId },
    update: { gameIds },
    create: { teacherId, gameIds },
  });
}
