import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { getRequestLocale, DEFAULT_LOCALE } from "@/lib/locale";
import { contentHash, translateTexts } from "@/lib/translate";
import { canViewQuestion, isCommentVisibleToViewer } from "@/lib/content-visibility";
import { logger } from "@/lib/logger";
import { studentCanAccessSession } from "@/lib/session-access";
import { isGameVisibleToStudent, type CustomGame } from "@/lib/question-games-data";
import { loadQuestionGameSettingsForTeachers } from "@/lib/question-game-settings-store";

// GAME_INSTRUCTION의 id는 "게임id:안내줄인덱스" 복합 키다.
const GAME_TYPES = [
  "GAME_TITLE",
  "GAME_DESCRIPTION",
  "GAME_PLAYER_COUNT",
  "GAME_DURATION",
  "GAME_INSTRUCTION",
] as const;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["QUESTION", "COMMENT", "SESSION_SUBJECT", "SESSION_TOPIC", ...GAME_TYPES]),
        id: z.string().min(1),
      }),
    )
    .min(1)
    .max(40),
});

function gameIdOf(item: { type: string; id: string }): string {
  return item.type === "GAME_INSTRUCTION" ? item.id.split(":")[0] : item.id;
}

// 교사가 만든 놀이 중 뷰어가 볼 수 있는 것만 반환한다.
// 학생: 담당 선생님(같은 학교의 담당 학급 교사 또는 학급 미지정 교사)의 게임 중
//       공개 설정이 허용하는 것. 교사: 본인 게임.
async function loadViewableCustomGames(
  viewer: {
    id: string;
    role: string | null;
    school: string | null;
    grade: string | null;
    className: string | null;
  } | null,
  gameIds: string[],
): Promise<Map<string, CustomGame>> {
  const result = new Map<string, CustomGame>();
  if (!viewer || gameIds.length === 0) return result;

  if (viewer.role === "TEACHER") {
    const rows = await prisma.questionGameCustom.findMany({
      where: { id: { in: gameIds }, teacherId: viewer.id },
      select: { id: true, title: true, description: true, playerCount: true, duration: true, instructions: true },
    });
    for (const row of rows) {
      result.set(row.id, {
        id: row.id,
        title: row.title,
        description: row.description,
        playerCount: row.playerCount,
        duration: row.duration,
        instructions: Array.isArray(row.instructions) ? row.instructions.map(String) : [],
      } as CustomGame);
    }
    return result;
  }

  if (viewer.role !== "STUDENT" || !viewer.school || !viewer.grade || !viewer.className) {
    return result;
  }
  const teachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      school: viewer.school,
      OR: [
        { teacherClasses: { some: { grade: viewer.grade, className: viewer.className } } },
        { teacherClasses: { none: {} } },
      ],
    },
    select: { id: true },
  });
  if (teachers.length === 0) return result;
  const { customGames, visibilityMap } = await loadQuestionGameSettingsForTeachers(
    teachers.map((t) => t.id),
  );
  for (const game of customGames) {
    if (!gameIds.includes(game.id)) continue;
    const visibility = visibilityMap[game.id] ?? { type: "all" as const };
    if (isGameVisibleToStudent(visibility, viewer)) result.set(game.id, game);
  }
  return result;
}

const keyOf = (type: string, id: string) => `${type}:${id}`;

const sessionAccessSelect = {
  teacherId: true,
  targetType: true,
  targetGrade: true,
  targetClassName: true,
  targetStudentId: true,
  targetStudentIds: true,
  teacher: {
    select: {
      role: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  },
} as const;

function canViewSession(
  viewer: {
    id: string;
    role: string | null;
    school: string | null;
    grade: string | null;
    className: string | null;
  } | null,
  session: {
    teacherId: string;
    targetType: string;
    targetGrade: string | null;
    targetClassName: string | null;
    targetStudentId: string | null;
    targetStudentIds: unknown;
    teacher: {
      role: string;
      school: string | null;
      teacherClasses: Array<{ grade: string; className: string }>;
    };
  },
): boolean {
  if (!viewer) return false;
  if (viewer.role === "TEACHER") return session.teacherId === viewer.id;
  if (viewer.role !== "STUDENT") return false;
  return studentCanAccessSession(session, { ...viewer, role: "STUDENT" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  // 타깃 언어: 쿠키 기준. 한국어면 번역 불필요.
  const targetLocale = getRequestLocale(req);
  if (targetLocale === DEFAULT_LOCALE) {
    return NextResponse.json({ translations: {} });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { items } = parsed.data;

  // 원문 로드 + 열람 권한 검사. id만 알면 번역되지 않도록, 그 사용자가 실제로 볼 수 있는
  // 질문·댓글만 번역 대상에 포함한다(공개/본인/담당 학급 교사/댓글 공개 규칙).
  const qIds = items.filter((i) => i.type === "QUESTION").map((i) => i.id);
  const cIds = items.filter((i) => i.type === "COMMENT").map((i) => i.id);
  const sessionIds = items
    .filter((i) => i.type === "SESSION_SUBJECT" || i.type === "SESSION_TOPIC")
    .map((i) => i.id);
  const gameIds = [
    ...new Set(
      items
        .filter((i) => (GAME_TYPES as readonly string[]).includes(i.type))
        .map((i) => gameIdOf(i)),
    ),
  ];

  const authorSelect = { role: true, school: true, grade: true, className: true } as const;
  const [viewer, questions, comments, sessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, school: true, grade: true, className: true, teacherClasses: { select: { grade: true, className: true } } },
    }),
    qIds.length
      ? prisma.question.findMany({
          where: { id: { in: qIds } },
          select: {
            id: true,
            content: true,
            isPublic: true,
            authorId: true,
            author: { select: authorSelect },
            session: { select: sessionAccessSelect },
          },
        })
      : [],
    cIds.length
      ? prisma.comment.findMany({
          where: { id: { in: cIds } },
          select: {
            id: true, content: true, authorId: true, author: { select: { role: true } },
            question: {
              select: {
                isPublic: true,
                authorId: true,
                author: { select: authorSelect },
                session: {
                  select: {
                    commentsVisibleToPeers: true,
                    ...sessionAccessSelect,
                  },
                },
              },
            },
          },
        })
      : [],
    sessionIds.length
      ? prisma.questionSession.findMany({
          where: { id: { in: sessionIds } },
          select: {
            id: true,
            subject: true,
            topic: true,
            ...sessionAccessSelect,
          },
        })
      : [],
  ]);

  const originals = new Map<string, string>();
  for (const q of questions) {
    if (canViewQuestion(viewer, q)) originals.set(keyOf("QUESTION", q.id), q.content);
  }
  for (const c of comments) {
    const canSee =
      canViewQuestion(viewer, c.question) &&
      isCommentVisibleToViewer({
        viewerRole: viewer?.role ?? "",
        viewerId: userId,
        commentsVisibleToPeers: c.question.session?.commentsVisibleToPeers ?? true,
        commentAuthorId: c.authorId,
        commentAuthorRole: c.author.role,
        questionAuthorId: c.question.authorId,
      });
    if (canSee) originals.set(keyOf("COMMENT", c.id), c.content);
  }
  for (const session of sessions) {
    if (!canViewSession(viewer, session)) continue;
    originals.set(keyOf("SESSION_SUBJECT", session.id), session.subject);
    if (session.topic.trim()) originals.set(keyOf("SESSION_TOPIC", session.id), session.topic);
  }
  const viewableGames = await loadViewableCustomGames(viewer, gameIds);
  for (const [gameId, game] of viewableGames) {
    originals.set(keyOf("GAME_TITLE", gameId), game.title);
    if (game.description.trim()) originals.set(keyOf("GAME_DESCRIPTION", gameId), game.description);
    if (game.playerCount.trim()) originals.set(keyOf("GAME_PLAYER_COUNT", gameId), game.playerCount);
    if (game.duration.trim()) originals.set(keyOf("GAME_DURATION", gameId), game.duration);
    game.instructions.forEach((step, index) => {
      if (step.trim()) originals.set(keyOf("GAME_INSTRUCTION", `${gameId}:${index}`), step);
    });
  }

  // 캐시 조회 — 요청된 (type, id) 쌍 전체를 한 번에 본다
  const cached = await prisma.translation.findMany({
    where: {
      targetLocale,
      OR: items.map((i) => ({ sourceType: i.type, sourceId: i.id })),
    },
  });
  const cacheByKey = new Map(cached.map((t) => [keyOf(t.sourceType, t.sourceId), t]));

  const out: Record<string, string> = {};
  const misses: { type: (typeof items)[number]["type"]; id: string; text: string; hash: string }[] = [];

  for (const item of items) {
    const k = keyOf(item.type, item.id);
    const original = originals.get(k);
    if (original == null) continue; // 원문 없음(삭제 등) → 스킵
    const hash = contentHash(original);
    const hit = cacheByKey.get(k);
    if (hit && hit.sourceHash === hash) {
      out[k] = hit.content;
    } else {
      misses.push({ type: item.type, id: item.id, text: original, hash });
    }
  }

  if (misses.length === 0) {
    return NextResponse.json({ translations: out });
  }

  // 레이트 리밋은 실제 Gemini 호출(캐시 미스)이 있을 때만 차감한다.
  // 캐시 히트만 있는 재방문 요청이 한도를 소모하지 않도록.
  const { success } = rateLimit(`translate:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  // 캐시 미스 → 한 번의 Gemini 호출로 일괄 번역
  const aiCfg = await resolveUserAiConfig(userId);
  if (!aiCfg.apiKey) {
    return NextResponse.json({ error: "AI 설정이 없어 번역할 수 없어요." }, { status: 503 });
  }

  let translated: string[];
  try {
    translated = await translateTexts(misses.map((m) => m.text), targetLocale, userId, aiCfg.apiKey, aiCfg.model);
  } catch (err) {
    logger.error("translate failed", err);
    return NextResponse.json({ error: "번역에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }

  // 결과 저장(업서트) + 응답에 합치기
  await Promise.all(
    misses.map((m, i) =>
      prisma.translation.upsert({
        where: {
          sourceType_sourceId_targetLocale: {
            sourceType: m.type,
            sourceId: m.id,
            targetLocale,
          },
        },
        create: { sourceType: m.type, sourceId: m.id, targetLocale, content: translated[i], sourceHash: m.hash },
        update: { content: translated[i], sourceHash: m.hash },
      }),
    ),
  );
  misses.forEach((m, i) => { out[keyOf(m.type, m.id)] = translated[i]; });

  return NextResponse.json({ translations: out });
}
