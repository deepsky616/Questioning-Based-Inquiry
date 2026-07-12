import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { AiBusyError, AiKeyMissingError, AiQuotaError, generateJsonWithMetadata } from "@/lib/ai";

// 질문 연습용 AI 실시간 출제 (바꾸기·만들기 모드 전용).
// 분류 퀴즈는 정답·해설의 신뢰성이 필요해 검수된 문항 은행만 사용하고,
// 이 두 모드는 판정도 AI가 하므로 출제도 AI가 해도 정합성이 유지된다.
// 실패 시 클라이언트는 기존 문항 은행으로 폴백한다.

const requestSchema = z.object({
  mode: z.enum(["transform", "create"]),
});

const TARGETS = ["open", "conceptual", "controversial"] as const;

const transformResponseSchema = z.object({
  source: z.string().min(5).max(200),
  hint: z.string().min(5).max(200),
  example: z.string().min(5).max(200),
});

const createResponseSchema = z.object({
  title: z.string().min(1).max(40),
  passage: z.string().min(30).max(400),
});

const TARGET_LABEL: Record<(typeof TARGETS)[number], string> = {
  open: "열린 질문(여러 답이 가능하고 추론·상상이 필요한 질문)",
  conceptual: "개념적 질문(관계·원인·의미를 연결해 생각하는 질문)",
  controversial: "논쟁적 질문(정답이 없고 가치 판단·찬반이 갈리는 질문)",
};

function buildTransformPrompt(target: (typeof TARGETS)[number]): string {
  return `당신은 초등학생의 질문 만들기 연습 문제를 출제하는 선생님입니다.

학생이 "닫힌·사실적 질문"을 "${TARGET_LABEL[target]}"으로 바꿔 쓰는 연습을 합니다.

조건:
- source: 초등 교과(국어·수학·과학·사회·도덕·실과 등) 내용에서 나올 법한, 답이 하나로 정해진 짧은 닫힌·사실적 질문 1개 (60자 이내, 매번 다른 교과·주제로 다양하게)
- hint: 목표 유형으로 바꾸는 요령을 학생 눈높이로 1문장 (예: "'무엇'을 '왜'로 바꿔 원인을 물어보세요")
- example: source를 목표 유형으로 바꾼 모범 예시 질문 1개 (80자 이내)

아래 JSON만 출력:
{"source": "...", "hint": "...", "example": "..."}`;
}

const CREATE_PROMPT = `당신은 초등학생의 질문 만들기 연습 문제를 출제하는 선생님입니다.

학생이 짧은 제시문을 읽고 사실적/개념적/논쟁적 질문을 만들어 보는 연습을 합니다.

조건:
- title: 제시문의 주제 (10자 이내)
- passage: 초등학생 눈높이의 제시문 2~3문장 (기본 정보 + 생각해 볼 거리나 서로 생각이 갈릴 수 있는 상황을 함께 담아, 세 유형의 질문이 모두 나올 수 있게)
- 교과(국어·수학·과학·사회·도덕·실과·예체능)와 소재를 매번 다양하게

아래 JSON만 출력:
{"title": "...", "passage": "..."}`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const { success } = rateLimit(`practice-gen:${userId}`, { limit: 10, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  let mode: "transform" | "create";
  try {
    mode = requestSchema.parse(await req.json()).mode;
  } catch {
    return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
  }

  try {
    if (mode === "transform") {
      const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
      const generated = await generateJsonWithMetadata<unknown>({
        userId,
        prompt: buildTransformPrompt(target),
        req,
        localize: true,
        temperature: 0.9, // 매번 다른 문제가 나오도록 다양성 우선
      });
      const item = transformResponseSchema.parse(generated.data);
      return NextResponse.json({ ...item, target });
    }

    const generated = await generateJsonWithMetadata<unknown>({
      userId,
      prompt: CREATE_PROMPT,
      req,
      localize: true,
      temperature: 0.9,
    });
    const topic = createResponseSchema.parse(generated.data);
    return NextResponse.json(topic);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // 요청 형식 오류와 AI 응답 형식 오류 모두 — 클라이언트는 은행 문항으로 폴백
      return NextResponse.json({ error: "AI 출제 형식이 올바르지 않습니다" }, { status: 502 });
    }
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 키가 설정되지 않았습니다" }, { status: 503 });
    }
    if (error instanceof AiQuotaError) {
      return NextResponse.json({ error: "AI 무료 사용량 한도를 초과했어요. 내일 다시 시도하거나 유료 API 키를 설정해 주세요." }, { status: 503 });
    }
    if (error instanceof AiBusyError) {
      return NextResponse.json({ error: "AI 모델이 혼잡합니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
    }
    logger.error("Practice generate error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
