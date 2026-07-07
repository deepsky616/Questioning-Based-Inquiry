import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { getRequestLocale, DEFAULT_LOCALE } from "@/lib/locale";
import { contentHash, translateTexts } from "@/lib/translate";
import { logger } from "@/lib/logger";

// 수업세션 AI 분석 결과(요약·인사이트 등 텍스트 필드) 온디맨드 번역.
// 화면에 표시 중인 분석 필드를 그대로 받아 번역하고 Translation 테이블에 캐시한다
// (재분석·교사 수정으로 원문이 바뀌면 해시가 달라져 자동으로 재번역).

const bodySchema = z.object({
  sessionId: z.string().min(1),
  // 학급/학생 분석을 구분하는 캐시 키(예: "class:5|1", "teacher-student:abc")
  cacheKey: z.string().max(120).optional().default("class"),
  fields: z.record(z.string().max(4000)).refine((f) => Object.keys(f).length <= 16, "필드가 너무 많습니다"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const user = session.user as { id: string; role?: string };
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  const targetLocale = getRequestLocale(req);
  if (targetLocale === DEFAULT_LOCALE) {
    return NextResponse.json({ fields: {} });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { sessionId, cacheKey, fields } = parsed.data;

  // 본인 소유 세션의 분석만 번역 가능(임의 텍스트 번역 프록시로 오·남용 방지)
  const owned = await prisma.questionSession.findFirst({
    where: { id: sessionId, teacherId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "수업세션을 찾을 수 없습니다" }, { status: 404 });
  }

  const entries = Object.entries(fields).filter(([, v]) => v.trim().length > 0);
  if (entries.length === 0) return NextResponse.json({ fields: {} });

  const sourceId = `${sessionId}:${cacheKey}`;
  const hash = contentHash(JSON.stringify(entries));

  // 캐시 조회 — 원문(해시)이 같으면 Gemini 호출 없이 반환
  const cached = await prisma.translation.findUnique({
    where: { sourceType_sourceId_targetLocale: { sourceType: "ANALYSIS", sourceId, targetLocale } },
  });
  if (cached && cached.sourceHash === hash) {
    try {
      return NextResponse.json({ fields: JSON.parse(cached.content) });
    } catch {
      // 캐시 파손 → 아래에서 재번역
    }
  }

  // 레이트 리밋은 실제 Gemini 호출이 있을 때만 차감(translate 라우트와 동일 정책·키 공유)
  const { success } = rateLimit(`translate:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const aiCfg = await resolveUserAiConfig(user.id);
  if (!aiCfg.apiKey) {
    return NextResponse.json({ error: "AI 설정이 없어 번역할 수 없어요." }, { status: 503 });
  }

  let translated: string[];
  try {
    translated = await translateTexts(entries.map(([, v]) => v), targetLocale, aiCfg.apiKey, aiCfg.model);
  } catch (err) {
    logger.error("analysis translate failed", err);
    return NextResponse.json({ error: "번역에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }

  const out: Record<string, string> = {};
  entries.forEach(([k], i) => { out[k] = translated[i]; });

  await prisma.translation.upsert({
    where: { sourceType_sourceId_targetLocale: { sourceType: "ANALYSIS", sourceId, targetLocale } },
    create: { sourceType: "ANALYSIS", sourceId, targetLocale, content: JSON.stringify(out), sourceHash: hash },
    update: { content: JSON.stringify(out), sourceHash: hash },
  });

  return NextResponse.json({ fields: out });
}
