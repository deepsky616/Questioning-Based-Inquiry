import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { getRequestLocale, DEFAULT_LOCALE } from "@/lib/locale";
import { contentHash, translateTexts } from "@/lib/translate";
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

  const { success } = rateLimit(`translate:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { items } = parsed.data;

  // 원문 로드 (질문·댓글). 본문은 이미 목록 API의 공개 권한을 통해 노출된 것이므로
  // id로 본문을 가져와 번역만 한다(추가 정보 노출 없음).
  const qIds = items.filter((i) => i.type === "QUESTION").map((i) => i.id);
  const cIds = items.filter((i) => i.type === "COMMENT").map((i) => i.id);
  const [questions, comments] = await Promise.all([
    qIds.length ? prisma.question.findMany({ where: { id: { in: qIds } }, select: { id: true, content: true } }) : [],
    cIds.length ? prisma.comment.findMany({ where: { id: { in: cIds } }, select: { id: true, content: true } }) : [],
  ]);

  const originals = new Map<string, string>();
  for (const q of questions) originals.set(keyOf("QUESTION", q.id), q.content);
  for (const c of comments) originals.set(keyOf("COMMENT", c.id), c.content);

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
