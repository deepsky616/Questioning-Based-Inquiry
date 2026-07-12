import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { generateText, AiKeyMissingError } from "@/lib/ai";
import { extractJsonObject } from "@/lib/json-extract";

function systemPromptFor(locale: string, action?: string) {
  if (action?.endsWith(":bilingual") || action === "memory:pairs-bilingual") {
    return `You are a question game partner for elementary and middle school students.
- Use clear, friendly language.
- When asked for bilingual JSON, include both Korean and English text in the requested fields.
- Keep the Korean and English versions semantically equivalent.
- Return only the requested output format.`;
  }
  if (locale === "en") {
    return `You are a question game partner for elementary and middle school students.
- Use clear, friendly language.
- Create good questions that help students think for themselves.
- Keep answers concise and clear.
- Answer in English only.`;
  }
  return `당신은 초등학생과 중학생을 위한 질문놀이 파트너입니다.
- 쉽고 친근한 말투로 대화하세요.
- 학생들이 스스로 생각하도록 돕는 좋은 질문을 만들어주세요.
- 대답은 항상 간결하고 명확하게 해주세요.
- 한국어로만 답하세요.`;
}

function languageLine(ctx: Record<string, string>) {
  return ctx.locale === "en"
    ? "\nOutput language: English."
    : "\n출력 언어: 한국어.";
}

const PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  "dice:generate": (c) =>
    `"${c.questionType}" 유형의 질문을 하나 만들어주세요.\n유형 설명: ${c.typeDesc ?? ""}${languageLine(c)}\n질문만 한 줄로 출력하세요. 다른 말은 하지 마세요.`,

  "dice:feedback": (c) =>
    `학생 질문: "${c.studentQuestion}"\nAI 질문: "${c.aiQuestion}"${languageLine(c)}\n두 질문을 비교하며 학생에게 격려와 한 줄 팁을 주세요. 두 문장 이내로.`,

  "hot-potato:generate": (c) =>
    `주제: "${c.topic}"\n이 주제와 관련된 좋은 질문을 하나 만들어주세요.\n질문만 한 줄로 출력하세요.`,

  "hot-potato:feedback": (c) =>
    `학생 질문: "${c.studentQuestion}"\nAI 질문: "${c.aiQuestion}"\n두 질문 중 어떤 점이 좋은지 한 줄로 비교해 주세요.`,

  "bingo:fill": (c) =>
    `"${c.questionType}" 유형의 질문을 하나 만들어주세요.\n질문만 한 줄로 출력하세요.`,

  "relay:check": (c) =>
    `질문 릴레이 게임입니다. 규칙: 대답 금지, 질문만 이어가기, 앞 질문과 반드시 연결되어야 함.\n\n앞 질문: "${c.prev}"\n학생의 새 질문: "${c.next}"\n\n새 질문이 앞 질문과 연결되는지 확인해주세요. 느슨한 연결도 인정해요.\n다음 형식으로만 답하세요 (다른 말 없이):\n판정: 연결돼요 또는 연결 안 돼요\n이유: (한 문장)\n격려: (한 문장)`,

  "relay:ai-turn": (c) =>
    `질문 릴레이 게임입니다. 규칙: 대답 금지, 질문만 이어가기.\n\n처음 주제: "${c.topic}"\n가장 최근 질문: "${c.prev}"\n지금까지 나온 질문들: ${c.history}${languageLine(c)}\n\n이 게임의 다음 질문 하나를 만들어주세요.\n조건: 1) 가장 최근 질문과 연결될 것 2) 지금까지 나온 질문과 중복되지 않을 것 3) 질문 형태일 것\n질문만 한 줄로 출력하세요.`,

  "mystery-box:setup": (_c) =>
    `미스터리 박스 게임용 물건을 초등학생이 알만한 것에서 하나 골라주세요.${languageLine(_c)}\n다음 JSON 형식으로만 답하세요 (다른 말 없이):\n{"name":"물건 이름","category":"카테고리","emoji":"이모지 1개"}`,

  "mystery-box:answer": (c) =>
    c.locale === "en"
      ? `Mystery Box game. The hidden object is "${c.itemName}".\nQuestion: "${c.question}"\nAnswer with exactly one of these only: "Yes", "No", "Not sure". Do not add anything else.`
      : `미스터리 박스 게임입니다. 상자 안의 것은 "${c.itemName}"입니다.\n질문: "${c.question}"\n반드시 "네", "아니오", "잘 모르겠어요" 중 하나만 답하세요. 다른 말은 절대 하지 마세요.`,

  // AI가 참가자로서 자기 차례에 예/아니오 질문을 만들고, 확신하면 추측까지 한다(물건 이름은 절대 모름)
  "mystery-box:ai-turn": (c) =>
    `미스터리 박스 스무고개 게임이에요. 당신(AI)은 상자 안의 숨은 물건을 맞히려는 참가자입니다. 물건이 무엇인지 전혀 모릅니다.\n지금까지 나온 질문과 대답:\n${c.history || (c.locale === "en" ? "(none yet)" : "(아직 없음)")}${languageLine(c)}\n\n규칙:\n1) 단서로 물건을 확신할 수 있으면 "guess"에 물건 이름 하나를 쓰세요. 확신이 없으면 "guess"는 빈 문자열("")로 두세요.\n2) "question"에는 다음에 물어볼, 아직 안 물어본 새로운 예/아니오 질문 하나를 쓰세요(짧게).\n\n반드시 아래 JSON으로만 답하세요 (다른 말 없이):\n{"question":"...","guess":""}`,

  "ladder:suggest": (c) =>
    `주제: "${c.topic}"${languageLine(c)}\n이 주제로 만들 수 있는 좋은 질문 2가지를 짧게 제안해주세요.\n번호 없이 각 질문을 한 줄씩, 총 2줄로 출력하세요.`,

  "memory:pairs": (c) =>
    `초등학생이 흥미를 느낄 만한 질문과 그에 가장 알맞은 짧은 대답 ${c.count}쌍을 만들어주세요.${languageLine(c)}\n- 질문은 호기심을 자극하는 한 문장, 너무 어려운 학술 용어는 피해주세요.\n- 대답은 1~2문장, 초등학생이 이해할 수 있는 표현으로.\n- 질문과 대답은 명확하게 짝이 맞아야 합니다.\n\n반드시 JSON 배열로만 응답하세요 (다른 텍스트 금지):\n[\n  {"question": "...", "answer": "..."},\n  {"question": "...", "answer": "..."}\n]`,

  "memory:pairs-bilingual": (c) =>
    `초등학생이 흥미를 느낄 만한 질문과 그에 가장 알맞은 짧은 대답 ${c.count}쌍을 만들어주세요.
- 각 쌍은 한국어와 영어를 모두 포함해야 합니다.
- ko와 en은 같은 의미여야 합니다.
- 질문은 호기심을 자극하는 한 문장, 너무 어려운 학술 용어는 피해주세요.
- 대답은 1~2문장, 초등학생이 이해할 수 있는 표현으로.
- 질문과 대답은 명확하게 짝이 맞아야 합니다.

반드시 JSON 배열로만 응답하세요 (다른 텍스트 금지):
[
  {"question":{"ko":"...","en":"..."},"answer":{"ko":"...","en":"..."}},
  {"question":{"ko":"...","en":"..."},"answer":{"ko":"...","en":"..."}}
]`,

  "story-dice:words": (_c) =>
    `초등학생이 이야기를 만들 수 있는 수준의 단어를 다음 세 카테고리로 각각 8개씩 골라주세요. 매번 새롭게 만들어야 하므로 흔하지 않은 조합도 환영합니다.${languageLine(_c)}\n\n- 주인공: 사람·동물·상상의 존재 (예: 로봇, 탐정, 마법사, 외계인)\n- 장소: 어디서 일어나는 일인지 (예: 학교, 숲, 우주, 무인도)\n- 사건/물건: 이야기를 흥미롭게 만드는 요소 (예: 보물상자, 비밀지도, 타임머신, 알 수 없는 소리)\n\n또한 각 단어에 가장 어울리는 이모지 1개씩을 "emojis" 맵에 함께 담아주세요. 단어마다 서로 다른 이모지를 골라 같은 이모지가 반복되지 않게 하세요.\n\n반드시 다음 JSON 형식으로만 답하세요 (다른 텍스트 금지):\n{\n  "protagonist": ["...", "...", ... 8개],\n  "place": ["...", "...", ... 8개],\n  "event": ["...", "...", ... 8개],\n  "emojis": { "단어": "이모지", ... 24개 단어 모두 }\n}`,

  "story-dice:words-bilingual": (_c) =>
    `초등학생이 이야기를 만들 수 있는 수준의 단어를 다음 세 카테고리로 각각 8개씩 골라주세요.
- 각 단어는 한국어 ko와 영어 en을 모두 포함해야 합니다.
- ko와 en은 같은 의미여야 합니다.
- 흔하지 않은 조합도 좋지만 학생이 이해할 수 있어야 합니다.
- emojis 맵의 키는 한국어 ko 단어로 작성하세요.

반드시 다음 JSON 형식으로만 답하세요 (다른 텍스트 금지):
{
  "protagonist": [{"ko":"로봇","en":"robot"}, ... 8개],
  "place": [{"ko":"숲","en":"forest"}, ... 8개],
  "event": [{"ko":"비밀지도","en":"secret map"}, ... 8개],
  "emojis": { "로봇": "🤖", "숲": "🌳", "비밀지도": "🗺️" }
}`,

  "story-dice:ai-question": (c) =>
    `이야기 주사위 놀이입니다.\n주사위로 나온 단어: 주인공=${c.protagonist}, 장소=${c.place}, 사건/물건=${c.event}\n술래가 만든 이야기: "${c.story}"\n지금까지의 질문·대답: ${c.history || (c.locale === "en" ? "(none)" : "(없음)")}${languageLine(c)}\n\n위 이야기와 흐름에 어울리는 새 질문 한 개를 만들어주세요. 너무 길지 않게 한 문장이면 좋아요.\n질문만 한 줄로 출력하세요.`,

  "story-dice:ai-answer": (c) =>
    `이야기 주사위 놀이입니다. 당신은 술래입니다.\n주사위 단어: 주인공=${c.protagonist}, 장소=${c.place}, 사건/물건=${c.event}\n이야기: "${c.story}"\n지금까지의 흐름: ${c.history || (c.locale === "en" ? "(none)" : "(없음)")}\n학생의 질문: "${c.question}"${languageLine(c)}\n\n이야기 흐름에 어울리고 자연스럽게 이야기를 확장하는 짧은 대답을 한 문장으로 해주세요.\n대답만 한 줄로 출력하세요.`,

  "game:best": (c) =>
    `초등·중학생이 질문놀이에서 만든 질문 목록입니다:\n${c.questions}\n\n이 중에서 가장 창의적이고 좋은 질문 1개를 골라주세요.\n반드시 아래 형식으로만 답하세요 (다른 말 없이):\n베스트: (질문을 그대로)\n학생: (그 질문을 만든 학생 이름)\n총평: (왜 좋은 질문인지 따뜻하게 한 문장)`,

  "kaba:check": (c) =>
    `초등학교 1~2학년 학생이 평서문을 질문으로 바꾸는 '까바놀이'를 하고 있어요.\n\n원래 평서문: "${c.original}"\n학생이 바꾼 질문: "${c.student}"${languageLine(c)}\n\n다음 두 가지를 확인해 주세요:\n1. 평서문이 질문 형태로 바뀌었나요?\n2. 원래 문장의 의미가 잘 담겨 있나요?\n\n반드시 아래 형식으로만 답하세요 (다른 말 없이):\n판정: 잘했어요 또는 다시해봐요\n이유: (한 문장)\n격려: (따뜻한 한 문장)`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const limited = checkRateLimit(`ai-play:${(session.user as { id: string }).id}`, 20);
  if (limited) return limited;

  const body = await req.json() as { action: string; context?: Record<string, string>; locale?: string };
  const { action } = body;
  const locale = body.locale === "en" ? "en" : "ko";
  const context = { ...(body.context ?? {}), locale };

  const promptFn = PROMPTS[action];
  if (!promptFn) {
    return NextResponse.json({ error: `알 수 없는 동작입니다: ${action}` }, { status: 400 });
  }

  const userPrompt = promptFn(context);

  let text: string;
  try {
    text = await generateText({
      userId: (session.user as { id: string }).id,
      prompt: userPrompt,
      req,
      localize: true,
      systemInstruction: systemPromptFor(locale, action),
    });
  } catch (err: unknown) {
    if (err instanceof AiKeyMissingError) {
      return NextResponse.json(
        { error: "AI 모델이 설정되지 않았습니다. 선생님께 API 키 설정을 요청하세요." },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : "AI 응답 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // JSON 응답 파싱이 필요한 액션들 — 실패 시 텍스트만 반환
  if (
    action === "mystery-box:setup" ||
    action === "mystery-box:ai-turn" ||
    action === "story-dice:words" ||
    action === "story-dice:words-bilingual"
  ) {
    try {
      const parsed = extractJsonObject(text);
      return NextResponse.json({ text, parsed });
    } catch {
      // JSON 파싱 실패 시 텍스트만 반환
    }
  }

  return NextResponse.json({ text });
}
