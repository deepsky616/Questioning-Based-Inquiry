import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  step: z.enum(["keywords", "sentences", "questions", "inquiry"]),
  subject: z.string(),
  gradeRange: z.string(),
  area: z.string(),
  coreIdea: z.string(),
  knowledgeItems: z.array(z.string()).optional().default([]),
  processItems: z.array(z.string()).optional().default([]),
  valueItems: z.array(z.string()).optional().default([]),
  achievements: z.array(z.object({ code: z.string(), content: z.string() })).optional().default([]),
  // 이전 단계 결과 (누적)
  selectedKeywords: z.array(z.string()).optional().default([]),
  coreSentences: z.array(z.string()).optional().default([]),
  essentialQuestions: z.array(z.string()).optional().default([]),
  context: z.string().optional(),
});

function buildPrompt(data: z.infer<typeof schema>): string {
  const gradeLabel = `초등학교 ${data.gradeRange}학년군`;
  const achievementsSummary = data.achievements
    .slice(0, 6)
    .map((a) => `${a.code} ${a.content}`)
    .join("\n");

  if (data.step === "keywords") {
    return `당신은 2022 개정 교육과정 전문가입니다.
아래 교육과정 데이터에서 ${gradeLabel} 학생이 깊이있게 탐구해야 할 핵심어(개념)를 5~8개 추천하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[핵심아이디어]
${data.coreIdea}
[지식·이해] ${data.knowledgeItems.slice(0, 10).join(", ")}
[과정·기능] ${data.processItems.slice(0, 8).join(", ")}
[가치·태도] ${data.valueItems.slice(0, 6).join(", ")}
[성취기준]
${achievementsSummary}

조건:
- 교과 고유의 핵심 개념 중심 (단순 사실 정보 X)
- 학생이 탐구를 통해 스스로 구성해야 하는 개념
- 3단어 이내 명사구
- 핵심아이디어와 성취기준을 모두 반영

아래 JSON만 출력 (다른 텍스트 없이):
{"keywords": ["개념1", "개념2", "개념3", "개념4", "개념5"]}`;
  }

  if (data.step === "sentences") {
    return `당신은 2022 개정 교육과정 전문가입니다.
아래 핵심어를 바탕으로 ${gradeLabel}에 맞는 핵심 문장을 2~3개 작성하세요.

[교과] ${data.subject}  [영역] ${data.area}
[핵심아이디어] ${data.coreIdea.split("\n")[0]}
[선택한 핵심어] ${data.selectedKeywords.join(", ")}
${data.context ? `[수업 맥락] ${data.context}` : ""}

재진술 원칙:
① 시·공간 초월 현재형 ("~한다")
② 특정 집단 한정 표현 금지
③ 가치 중립적 표현 사용
④ '왜?/어떻게?'를 생각해 2수준으로 심화

아래 JSON만 출력:
{"sentences": ["핵심 문장1", "핵심 문장2"]}`;
  }

  if (data.step === "questions") {
    return `당신은 수업 설계 전문가입니다.
아래 핵심 문장에서 단원 전체를 관통하는 핵심 질문을 1~2개 도출하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[핵심 문장]
${data.coreSentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

핵심 질문 조건:
- 개방형: "왜?", "어떻게?", "어떤 의미인가?" 형태
- 단원 전체를 관통하는 본질적 물음
- 하나의 정답 없이 반복 탐구 가치가 있는 질문
- 특정 사실이나 시기에 한정하지 않음
- 학생의 삶과 연결될 수 있는 질문

아래 JSON만 출력:
{"questions": ["핵심 질문1", "핵심 질문2"]}`;
  }

  // inquiry
  return `당신은 수업 설계 전문가입니다.
아래 핵심 질문에 도달하기 위한 탐구 질문을 세 유형으로 생성하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[핵심 질문]
${data.essentialQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

탐구 질문 유형 및 수:
- factual (사실적): 사실·정보 확인·기억 → 2~3개
- conceptual (개념적): 추론·비교·분석·해석 → 2~3개
- controversial (논쟁적): 판단·의견·가치·적용 → 2~3개

각 탐구 질문은 핵심 질문에 가까워지는 '징검다리' 역할을 해야 합니다.

아래 JSON만 출력:
{"inquiryQuestions": [
  {"type": "factual", "content": "..."},
  {"type": "factual", "content": "..."},
  {"type": "conceptual", "content": "..."},
  {"type": "conceptual", "content": "..."},
  {"type": "controversial", "content": "..."},
  {"type": "controversial", "content": "..."}
]}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const [keyRecord, modelRecord] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
      prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
    ]);

    if (!keyRecord?.value) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(keyRecord.value);
    const model = genAI.getGenerativeModel({ model: modelRecord?.value ?? "gemini-2.0-flash" });

    const prompt = buildPrompt(data);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI 응답을 파싱할 수 없습니다" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("unit-design generate error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
