import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const classifySchema = z.object({
  apiKey: z.string().min(10),
  model: z.string(),
  content: z.string().min(10).max(500),
  context: z.string().optional(),
});

const CLASSIFICATION_PROMPT = `당신은 질문 유형 분류 전문가입니다. 다음 질문을 분석해주세요.

[분류 기준]
1. 페쇄형/개방형:
   - 페쇄형: "무엇", "언제", "몇", "어디", "누구"로 시작, 정답이 명확
   - 개방형: "왜", "어떻게", "무슨", "어떤"로 시작, 다양한 답 가능

2. 인지적 수준:
   - 사실적: 사실/정보 확인, 검색적 질문
   - 해석적: 내용 파악, 추론, 비교 분석
   - 평가적: 판단, 의견, 가치 기준 적용

[출력 형식]
아래 JSON만 출력:
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "interpretive" 또는 "evaluative",
  "closureScore": 0.0부터 1.0 사이의 숫자,
  "cognitiveScore": 0.0부터 1.0 사이의 숫자,
  "reasoning": "분류 근거 50자 이내"
}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, model, content, context } = classifySchema.parse(body);

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${context ? `\n[맥락] ${context}` : ""}`;

    const result = await genModel.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        closure: parsed.closure,
        cognitive: parsed.cognitive,
        closureScore: parsed.closureScore,
        cognitiveScore: parsed.cognitiveScore,
        reasoning: parsed.reasoning,
      });
    }

    return NextResponse.json(fallbackClassification(content));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }

    console.error("Gemini classify error:", error);
    return NextResponse.json(fallbackClassification(""), { status: 500 });
  }
}

function fallbackClassification(content: string) {
  const closedKeywords = ["무엇", "언제", "몇", "어디", "누구", "얼마"];
  const openKeywords = ["왜", "어떻게", "무슨", "어떤", "그래서"];
  const evaluativeKeywords = ["어떻게 생각해", "판단해", "평가해", "의견"];
  const interpretiveKeywords = ["어떻게", "비교해", "분석해", "추론해"];

  let closureScore = 0.5;
  let closure: "closed" | "open" = "open";
  let cognitive: "factual" | "interpretive" | "evaluative" = "factual";

  for (const kw of closedKeywords) {
    if (content.includes(kw)) {
      closureScore += 0.15;
      closure = "closed";
    }
  }

  for (const kw of openKeywords) {
    if (content.includes(kw)) {
      closureScore -= 0.15;
      closure = "open";
    }
  }

  for (const kw of evaluativeKeywords) {
    if (content.includes(kw)) {
      cognitive = "evaluative";
    }
  }

  for (const kw of interpretiveKeywords) {
    if (content.includes(kw)) {
      cognitive = "interpretive";
    }
  }

  closureScore = Math.max(0, Math.min(1, closureScore));

  return {
    closure,
    cognitive,
    closureScore,
    cognitiveScore: 0.5,
    reasoning: "키워드 기반 자동 분류",
  };
}