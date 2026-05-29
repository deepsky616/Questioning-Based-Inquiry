import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveGeminiModel } from "@/lib/api-config";

const SYSTEM_PROMPT = `당신은 초등학생과 중학생을 위한 질문놀이 파트너입니다.
- 쉽고 친근한 말투로 대화하세요.
- 학생들이 스스로 생각하도록 돕는 좋은 질문을 만들어주세요.
- 대답은 항상 간결하고 명확하게 해주세요.
- 한국어로만 답하세요.`;

const PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  "dice:generate": (c) =>
    `"${c.questionType}" 유형의 질문을 하나 만들어주세요.\n유형 설명: ${c.typeDesc ?? ""}\n질문만 한 줄로 출력하세요. 다른 말은 하지 마세요.`,

  "dice:feedback": (c) =>
    `학생 질문: "${c.studentQuestion}"\nAI 질문: "${c.aiQuestion}"\n두 질문을 비교하며 학생에게 격려와 한 줄 팁을 주세요. 두 문장 이내로.`,

  "hot-potato:generate": (c) =>
    `주제: "${c.topic}"\n이 주제와 관련된 좋은 질문을 하나 만들어주세요.\n질문만 한 줄로 출력하세요.`,

  "hot-potato:feedback": (c) =>
    `학생 질문: "${c.studentQuestion}"\nAI 질문: "${c.aiQuestion}"\n두 질문 중 어떤 점이 좋은지 한 줄로 비교해 주세요.`,

  "bingo:fill": (c) =>
    `"${c.questionType}" 유형의 질문을 하나 만들어주세요.\n질문만 한 줄로 출력하세요.`,

  "relay:answer": (c) =>
    `학생의 질문: "${c.question}"\n이 질문에 대해 초등학생이 이해할 수 있도록 2~3문장으로 간단히 대답해 주세요.\n대답만 출력하세요.`,

  "relay:question": (c) =>
    `다음 대답에서 새로운 질문을 하나 이어 만들어주세요.\n대답: "${c.answer}"\n질문만 한 줄로 출력하세요.`,

  "mystery-box:setup": (_c) =>
    `미스터리 박스 게임용 물건을 초등학생이 알만한 것에서 하나 골라주세요.\n다음 JSON 형식으로만 답하세요 (다른 말 없이):\n{"name":"물건 이름","category":"카테고리","emoji":"이모지 1개"}`,

  "mystery-box:answer": (c) =>
    `미스터리 박스 게임입니다. 상자 안의 것은 "${c.itemName}"입니다.\n학생의 질문: "${c.question}"\n반드시 "네", "아니오", "잘 모르겠어요" 중 하나만 답하세요. 다른 말은 절대 하지 마세요.`,

  "ladder:suggest": (c) =>
    `주제: "${c.topic}"\n이 주제로 만들 수 있는 좋은 질문 2가지를 짧게 제안해주세요.\n번호 없이 각 질문을 한 줄씩, 총 2줄로 출력하세요.`,

  "kaba:check": (c) =>
    `초등학교 1~2학년 학생이 평서문을 질문으로 바꾸는 '까바놀이'를 하고 있어요.\n\n원래 평서문: "${c.original}"\n학생이 바꾼 질문: "${c.student}"\n\n다음 두 가지를 확인해 주세요:\n1. 평서문이 질문 형태(~나요? ~인가요? ~할까요? 등)로 바뀌었나요?\n2. 원래 문장의 의미가 잘 담겨 있나요?\n\n반드시 아래 형식으로만 답하세요 (다른 말 없이):\n판정: 잘했어요 또는 다시해봐요\n이유: (한 문장)\n격려: (따뜻한 한 문장)`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { action: string; context?: Record<string, string> };
  const { action, context = {} } = body;

  const promptFn = PROMPTS[action];
  if (!promptFn) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const [apiKeyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);

  if (!apiKeyRecord?.value) {
    return NextResponse.json(
      { error: "AI 모델이 설정되지 않았습니다. 선생님께 API 키 설정을 요청하세요." },
      { status: 503 }
    );
  }

  const model = resolveGeminiModel(modelRecord?.value);
  const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
  });

  const userPrompt = promptFn(context);

  try {
    const result = await gemini.generateContent(userPrompt);
    const text = result.response.text().trim();

    // mystery-box:setup → JSON 파싱 시도
    if (action === "mystery-box:setup") {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : text);
        return NextResponse.json({ text, parsed });
      } catch {
        // JSON 파싱 실패 시 텍스트만 반환
      }
    }

    return NextResponse.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI 응답 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
