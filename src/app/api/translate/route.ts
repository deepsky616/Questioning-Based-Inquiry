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

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["QUESTION", "COMMENT"]),
        id: z.string().min(1),
      }),
    )
    .min(1)
    .max(40),
});

const keyOf = (type: string, id: string) => `${type}:${id}`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const authorSelect = { role: true, school: true, grade: true, className: true } as const;
  const [viewer, questions, comments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, school: true, grade: true, className: true, teacherClasses: { select: { grade: true, className: true } } },
    }),
    qIds.length
      ? prisma.question.findMany({
          where: { id: { in: qIds } },
          select: { id: true, content: true, isPublic: true, authorId: true, author: { select: authorSelect } },
        })
      : [],
    cIds.length
      ? prisma.comment.findMany({
          where: { id: { in: cIds } },
          select: {
            id: true, content: true, authorId: true, author: { select: { role: true } },
            question: {
              select: { isPublic: true, authorId: true, author: { select: authorSelect }, session: { select: { commentsVisibleToPeers: true } } },
            },
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
        commentsVisibleToPeers: c.question.session?.commentsVisibleToPeers ?? false,
        commentAuthorId: c.authorId,
        commentAuthorRole: c.author.role,
        questionAuthorId: c.question.authorId,
      });
    if (canSee) originals.set(keyOf("COMMENT", c.id), c.content);
  }

  // 캐시 조회
  const cached = await prisma.translation.findMany({
    where: {
      targetLocale,
      OR: [
        ...(qIds.length ? [{ sourceType: "QUESTION", sourceId: { in: qIds } }] : []),
        ...(cIds.length ? [{ sourceType: "COMMENT", sourceId: { in: cIds } }] : []),
      ],
    },
  });
  const cacheByKey = new Map(cached.map((t) => [keyOf(t.sourceType, t.sourceId), t]));

  const out: Record<string, string> = {};
  const misses: { type: "QUESTION" | "COMMENT"; id: string; text: string; hash: string }[] = [];

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
    translated = await translateTexts(misses.map((m) => m.text), targetLocale, aiCfg.apiKey, aiCfg.model);
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
