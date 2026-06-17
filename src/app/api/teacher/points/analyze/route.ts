import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import {
  ACTIVITY_BONUS_TYPES, VALID_ACTIVITY_BONUS,
  MAX_ACTIVITY_BONUS_PER_STUDENT,
} from "@/lib/activity-bonus-policy";
import { normalizeContent } from "@/lib/content-normalize";
import { Prisma } from "@prisma/client";

const SYS = `당신은 초·중학생 질문기반 탐구 수업을 따뜻하게 평가하는 선생님입니다.
- 모든 학생을 격려하되, 두드러진 사례만 보너스로 줍니다.
- 친구 사이 차이가 너무 크지 않게 균형을 맞춥니다.
- 의미가 거의 같거나 다른 학생 작성물을 그대로 베낀 경우 보너스를 주지 말고 'DUPLICATE_FLAGGED'로 표시하세요.
- 반드시 요구된 JSON 형식으로만 답하세요.`;

interface AIBonusItem { studentId: string; targetId: string; targetType: "question" | "comment"; bonusType: string; reason: string }
interface AIResp { bonuses: AIBonusItem[]; summary?: string }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const limited = checkRateLimit(`points-analyze:${teacherId}`, 10);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });

  // 권한 검증
  const qs = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, subject: true, topic: true, date: true },
  });
  if (!qs) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (qs.teacherId !== teacherId) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  // 데이터 수집: 해당 세션의 학생 질문 + 답변
  const questions = await prisma.question.findMany({
    where: { sessionId, source: { not: "TEACHER_SHARED" } },
    select: {
      id: true, content: true, normalizedContent: true, authorId: true,
      author: { select: { id: true, name: true } },
      comments: {
        select: {
          id: true, content: true, normalizedContent: true, authorId: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (questions.length === 0) {
    return NextResponse.json({ error: "분석할 활동이 없습니다", count: 0 }, { status: 400 });
  }

  // 학생 ID 집합
  const studentIds = new Set<string>();
  questions.forEach((q) => {
    studentIds.add(q.authorId);
    q.comments.forEach((c) => studentIds.add(c.authorId));
  });
  const validIds = Array.from(studentIds);

  // 중복 사전 감지 (정규화 기반 - 베끼기 후보)
  const normCount: Record<string, Array<{ targetId: string; authorId: string; type: "question" | "comment" }>> = {};
  questions.forEach((q) => {
    const k = q.normalizedContent;
    if (k) (normCount[k] = normCount[k] || []).push({ targetId: q.id, authorId: q.authorId, type: "question" });
  });
  questions.forEach((q) => q.comments.forEach((c) => {
    const k = c.normalizedContent;
    if (k) (normCount[k] = normCount[k] || []).push({ targetId: c.id, authorId: c.authorId, type: "comment" });
  }));
  const duplicateCandidates: AIBonusItem[] = [];
  Object.values(normCount).forEach((arr) => {
    if (arr.length <= 1) return;
    // 첫 번째 작성자 외에는 모두 중복 후보
    arr.slice(1).forEach((item) => {
      duplicateCandidates.push({
        studentId: item.authorId,
        targetId: item.targetId,
        targetType: item.type,
        bonusType: "DUPLICATE_FLAGGED",
        reason: "다른 작성물과 거의 동일 — 베끼기 가능성",
      });
    });
  });

  // AI 호출 (교사 본인 설정)
  const aiCfg = await resolveUserAiConfig(teacherId);

  let aiResp: AIResp | null = null;
  if (aiCfg.apiKey) {
    const genAI = new GoogleGenerativeAI(aiCfg.apiKey);
    const model = aiCfg.model;
    const gemini = genAI.getGenerativeModel({ model, systemInstruction: SYS });

    const qBlock = questions.map((q) =>
      `[Q:${q.id}] ${q.author.name}(${q.authorId}): ${q.content}`
    ).join("\n");
    const cBlock = questions.flatMap((q) => q.comments.map((c) =>
      `[C:${c.id} → Q:${q.id}] ${c.author.name}(${c.authorId}): ${c.content}`
    )).join("\n");

    const prompt = `[세션] ${qs.subject}${qs.topic ? ` / ${qs.topic}` : ""} (${qs.date})

[학생 질문]
${qBlock || "(없음)"}

[학생 답변]
${cBlock || "(없음)"}

[보너스 종류]
- TOPIC_FIT_QUESTION (3점): 세션 주제와 직접 관련, 적절한 질문
- DEEP_QUESTION (5점): 사실 너머 추론·논쟁·창의
- APT_ANSWER (2점): 원 질문에 정확히 응답
- INSIGHTFUL_ANSWER (5점): 새 관점·근거 제시

[규칙]
- 각 학생당 최대 ${MAX_ACTIVITY_BONUS_PER_STUDENT}점 (합산 상한)
- 같은 학생 안에서 의미가 거의 같은 작성물이 있으면 DUPLICATE_FLAGGED로 표시 (점수 0)
- 다른 학생을 그대로 베낀 경우도 DUPLICATE_FLAGGED
- 받을 자격이 명확한 항목만 보너스 부여

[응답 형식 — JSON만, 다른 텍스트 금지]
{
  "bonuses": [
    {"studentId":"...", "targetId":"질문 또는 답변 id", "targetType":"question|comment", "bonusType":"TOPIC_FIT_QUESTION", "reason":"한 줄 근거"}
  ],
  "summary": "전체 활동에 대한 한 줄 총평"
}`;

    try {
      const result = await gemini.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) aiResp = JSON.parse(match[0]);
    } catch {}
  }

  // 결합 + 검증 + 클램프
  const allCandidates: AIBonusItem[] = [];
  const seenKeys = new Set<string>(); // studentId+targetId+bonusType
  const perStudentSum: Record<string, number> = {};
  validIds.forEach((id) => { perStudentSum[id] = 0; });

  // 1) 사전 감지된 중복(점수 0)
  duplicateCandidates.forEach((b) => {
    const key = `${b.studentId}:${b.targetId}:${b.bonusType}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    allCandidates.push(b);
  });

  // 2) AI 보너스
  for (const b of aiResp?.bonuses ?? []) {
    if (!validIds.includes(b.studentId)) continue;
    if (!VALID_ACTIVITY_BONUS.includes(b.bonusType as keyof typeof ACTIVITY_BONUS_TYPES)) continue;
    const def = ACTIVITY_BONUS_TYPES[b.bonusType as keyof typeof ACTIVITY_BONUS_TYPES];
    const key = `${b.studentId}:${b.targetId}:${b.bonusType}`;
    if (seenKeys.has(key)) continue;
    // 상한 검사
    if (def.points > 0 && perStudentSum[b.studentId] + def.points > MAX_ACTIVITY_BONUS_PER_STUDENT) continue;
    seenKeys.add(key);
    perStudentSum[b.studentId] += def.points;
    allCandidates.push(b);
  }

  // 3) 모두 PENDING으로 저장 (totalPoints 반영 안 함)
  const created: Array<{ id: string }> = [];
  for (const b of allCandidates) {
    const def = ACTIVITY_BONUS_TYPES[b.bonusType as keyof typeof ACTIVITY_BONUS_TYPES];
    if (!def) continue;
    const data: Prisma.PointLogUncheckedCreateInput = {
      studentId: b.studentId,
      gameId: "ACTIVITY",
      bonusType: `AI_${b.bonusType}`,
      points: def.points,
      reason: b.reason,
      status: "PENDING",
      sessionId,
      aiAnalysis: aiResp?.summary ?? null,
    };
    if (b.targetType === "question") data.relatedQuestionId = b.targetId;
    if (b.targetType === "comment") data.relatedCommentId = b.targetId;

    try {
      const row = await prisma.pointLog.create({ data, select: { id: true } });
      created.push(row);
    } catch (err) {
      // P2002: 동일 타깃+같은 bonusType 이미 존재 → 건너뜀
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
        throw err;
      }
    }
  }

  // 세션에 normalized_content가 없는 옛 질문/답변은 보완 (다음 분석 정확도 향상)
  const missingNormQ = questions.filter((q) => !q.normalizedContent && q.content);
  await Promise.all(missingNormQ.map((q) =>
    prisma.question.update({ where: { id: q.id }, data: { normalizedContent: normalizeContent(q.content) } })
  ));

  return NextResponse.json({
    sessionId,
    studentCount: validIds.length,
    questionCount: questions.length,
    commentCount: questions.reduce((a, q) => a + q.comments.length, 0),
    createdPending: created.length,
    summary: aiResp?.summary ?? null,
  });
}
