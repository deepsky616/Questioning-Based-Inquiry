import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { chooseModelAuto } from "@/lib/api-config";
import {
  BASE_POINTS,
  AI_BONUS_TYPES,
  VALID_BONUS_KEYS,
  MAX_BONUS_PER_STUDENT,
  MAX_BONUSES_PER_STUDENT,
  SYSTEM_BONUS,
  GAME_LABEL,
  BonusKey,
} from "@/lib/points-policy";
import { Prisma } from "@prisma/client";

interface StudentContribution {
  studentId: string;
  studentName: string;
  validQuestions: number; // 유효 질문 수 (멀티 게임 종료 시 클라이언트가 집계)
  questions: string[];    // 베스트 후보 추출 + AI 분석용
  isWinner: boolean;
}

interface AwardRequest {
  gameId: string;
  roomCode: string;
  topic?: string;
  contributions: StudentContribution[];
}

interface AIBonus { studentId: string; bonusType: string; points?: number; reason: string }
interface AIVerdictResponse { bonuses: AIBonus[]; bestQuestion?: { studentId: string; question: string; reason: string }; summary?: string }

const AI_SYSTEM = `당신은 초·중학생의 질문놀이 활동을 따뜻하게 평가하는 선생님입니다.
- 모든 학생을 격려하되, 특별히 두드러진 점만 보너스로 줍니다.
- 친구 사이 차이가 너무 크지 않게 균형을 맞춥니다.
- 명확한 근거 없으면 보너스를 주지 마세요.
- 반드시 요구된 JSON 형식으로만 답하세요.`;

function buildPrompt(req: AwardRequest): string {
  const gameLabel = GAME_LABEL[req.gameId] ?? req.gameId;
  const contributionLines = req.contributions.map((c) =>
    `[학생ID=${c.studentId}] ${c.studentName} (유효질문 ${c.validQuestions}개):\n` +
      (c.questions.length === 0 ? "  (작성 없음)" : c.questions.map((q) => `  - ${q}`).join("\n"))
  ).join("\n\n");

  const bonusList = Object.values(AI_BONUS_TYPES).map((b) =>
    `  - ${b.key}: ${b.label} (${b.points}점)`
  ).join("\n");

  return `[게임] ${gameLabel}${req.topic ? ` / 주제: ${req.topic}` : ""}

[학생별 기여 내역]
${contributionLines}

[수여 가능한 상]
${bonusList}

[규칙]
- 각 학생은 최대 ${MAX_BONUSES_PER_STUDENT}개의 상을 받을 수 있고, 보너스 합산은 ${MAX_BONUS_PER_STUDENT}점을 넘지 않습니다.
- "BEST_QUESTION"은 전체에서 1명만 받습니다 (또는 0명).
- 다른 상은 받을 만한 학생만 받습니다 (모두에게 줄 필요 없음).

[응답 형식 — 이 JSON 외의 다른 텍스트는 절대 출력 금지]
{
  "bestQuestion": { "studentId": "...", "question": "...", "reason": "한 문장 칭찬" },
  "bonuses": [
    { "studentId": "...", "bonusType": "CREATIVITY", "reason": "한 문장 근거" },
    { "studentId": "...", "bonusType": "EFFORT", "reason": "한 문장 근거" }
  ],
  "summary": "전체 게임에 대한 따뜻한 총평 한 줄"
}`;
}

function tryParseAI(text: string): AIVerdictResponse | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callAI(req: AwardRequest, userId: string): Promise<AIVerdictResponse | null> {
  const aiCfg = await resolveUserAiConfig(userId);
  if (!aiCfg.apiKey) return null;

  const genAI = new GoogleGenerativeAI(aiCfg.apiKey);
  const prompt = buildPrompt(req);
  // 프롬프트 크기에 따라 모델 자동 선택
  // 같은 활동 → 같은 판정이 나오도록 온도 0
  const gemini = genAI.getGenerativeModel({
    model: chooseModelAuto(aiCfg.model, prompt.length),
    systemInstruction: AI_SYSTEM,
    generationConfig: { temperature: 0 },
  });
  try {
    const result = await gemini.generateContent(prompt);
    return tryParseAI(result.response.text());
  } catch {
    return null;
  }
}

interface Award { studentId: string; bonusType: string; points: number; reason: string }

function buildAwardList(req: AwardRequest, ai: AIVerdictResponse | null): {
  awards: Award[];
  bestQuestion?: { studentId: string; question: string; reason: string };
  summary?: string;
} {
  const awards: Award[] = [];
  const validIds = new Set(req.contributions.map((c) => c.studentId));

  // ── 기본 점수 (서버 자동) ──
  for (const c of req.contributions) {
    awards.push({
      studentId: c.studentId,
      bonusType: SYSTEM_BONUS.PARTICIPATION,
      points: BASE_POINTS.PARTICIPATION,
      reason: "게임 참여",
    });
    if (c.validQuestions > 0) {
      awards.push({
        studentId: c.studentId,
        bonusType: SYSTEM_BONUS.VALID_QUESTIONS,
        points: c.validQuestions * BASE_POINTS.PER_VALID_QUESTION,
        reason: `유효 질문 ${c.validQuestions}개`,
      });
    }
    awards.push({
      studentId: c.studentId,
      bonusType: SYSTEM_BONUS.COMPLETION,
      points: BASE_POINTS.COMPLETION,
      reason: "게임 완료",
    });
    if (c.isWinner) {
      awards.push({
        studentId: c.studentId,
        bonusType: SYSTEM_BONUS.WINNER,
        points: BASE_POINTS.WINNER_BONUS,
        reason: "우승",
      });
    }
  }

  // ── AI 보너스 (검증·클램프) ──
  let bestQuestion: AIVerdictResponse["bestQuestion"];
  let summary: string | undefined;
  if (ai) {
    summary = ai.summary;
    bestQuestion = ai.bestQuestion && validIds.has(ai.bestQuestion.studentId)
      ? ai.bestQuestion : undefined;

    // 학생별 보너스 누적 추적 (상한)
    const perStudent: Record<string, { count: number; sum: number; types: Set<string> }> = {};
    validIds.forEach((id) => { perStudent[id] = { count: 0, sum: 0, types: new Set() }; });

    // BEST_QUESTION은 1명만
    if (bestQuestion) {
      const bk = AI_BONUS_TYPES.BEST_QUESTION;
      awards.push({
        studentId: bestQuestion.studentId, bonusType: bk.key,
        points: bk.points, reason: bestQuestion.reason || "AI 베스트 질문 선정",
      });
      const s = perStudent[bestQuestion.studentId];
      s.count++; s.sum += bk.points; s.types.add(bk.key);
    }

    for (const b of ai.bonuses ?? []) {
      if (!validIds.has(b.studentId)) continue;
      if (!VALID_BONUS_KEYS.includes(b.bonusType as BonusKey)) continue;
      if (b.bonusType === "BEST_QUESTION") continue; // 이미 처리
      const def = AI_BONUS_TYPES[b.bonusType as BonusKey];
      const s = perStudent[b.studentId];
      if (s.types.has(def.key)) continue; // 같은 상 중복 금지
      if (s.count >= MAX_BONUSES_PER_STUDENT) continue;
      if (s.sum + def.points > MAX_BONUS_PER_STUDENT) continue;
      awards.push({
        studentId: b.studentId, bonusType: def.key,
        points: def.points, reason: b.reason || def.label,
      });
      s.count++; s.sum += def.points; s.types.add(def.key);
    }
  }

  return { awards, bestQuestion, summary };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const limited = checkRateLimit(`points-award:${(session.user as { id: string }).id}`, 10);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Partial<AwardRequest>;
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
  const contributions = Array.isArray(body.contributions) ? body.contributions : [];

  if (!gameId || !roomCode || contributions.length === 0) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 이미 지급됐는지 확인 (멱등)
  const existing = await prisma.pointLog.findFirst({
    where: { gameId, roomCode },
    select: { id: true },
  });
  if (existing) {
    // 기존 지급 결과 반환
    const logs = await prisma.pointLog.findMany({
      where: { gameId, roomCode },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ alreadyAwarded: true, awards: logs });
  }

  // AI 분석 (선택, 실패해도 기본 점수는 지급)
  const ai = await callAI({
    gameId, roomCode,
    topic: body.topic,
    contributions: contributions as StudentContribution[],
  }, (session.user as { id: string }).id);
  const { awards, bestQuestion, summary } = buildAwardList(
    { gameId, roomCode, topic: body.topic, contributions: contributions as StudentContribution[] },
    ai
  );

  // 트랜잭션: PointLog 생성 + User.totalPoints 누적
  // 같은 학생별 점수 합산
  const sumByStudent: Record<string, number> = {};
  for (const a of awards) {
    sumByStudent[a.studentId] = (sumByStudent[a.studentId] ?? 0) + a.points;
  }

  try {
    await prisma.$transaction([
      ...awards.map((a) =>
        prisma.pointLog.create({
          data: {
            studentId: a.studentId, gameId, roomCode,
            bonusType: a.bonusType, points: a.points, reason: a.reason,
          },
        })
      ),
      ...Object.entries(sumByStudent).map(([id, pts]) =>
        prisma.user.update({
          where: { id },
          data: { totalPoints: { increment: pts } },
        })
      ),
    ]);
  } catch (err) {
    // unique 위반(이미 지급) — 다른 클라이언트가 동시에 호출한 경우
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const logs = await prisma.pointLog.findMany({
        where: { gameId, roomCode },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ alreadyAwarded: true, awards: logs });
    }
    return NextResponse.json({ error: "포인트 지급 실패" }, { status: 500 });
  }

  return NextResponse.json({ awards, bestQuestion, summary });
}
