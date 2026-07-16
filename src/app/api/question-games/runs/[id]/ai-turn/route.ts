import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { generateText } from "@/lib/ai";
import { AiBusyError, AiKeyMissingError, AiQuotaError } from "@/lib/ai-errors";
import { getQuestionDiceTypes } from "@/lib/question-game-i18n";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
  readQuestionGameRunBody,
} from "@/lib/question-game-run-route";
import {
  QuestionGameRunError,
  issueQuestionGameAiTurn,
  prepareQuestionGameAiTurn,
  releaseQuestionGameAiTurnLease,
  type PreparedQuestionGameAiTurn,
} from "@/lib/question-game-run-service";

type Params = { params: Promise<{ id: string }> };

function promptFor(prepared: PreparedQuestionGameAiTurn) {
  if (prepared.gameId === "story-dice") {
    const words = prepared.storyRolledWords;
    const story = prepared.story;
    if (!words || !story || prepared.storyPairCount === undefined) {
      throw new QuestionGameRunError("이야기 주사위 인공지능 문맥이 올바르지 않습니다", 409);
    }
    const previous = prepared.previousAnswer
      ? prepared.previousAnswer
      : prepared.locale === "en"
        ? "(no previous answer)"
        : "(아직 대답 없음)";
    if (prepared.locale === "en") {
      return {
        systemInstruction: [
          "You are a story-dice question partner for school students.",
          "Return exactly one new question in English and nothing else.",
          "Ask a short question that naturally continues the story and does not repeat an earlier question.",
        ].join("\n"),
        prompt: [
          `Rolled words: protagonist=${words.protagonist}, place=${words.place}, event=${words.event}`,
          `Story: ${story}`,
          `Previous student answer: ${previous}`,
          `Completed pairs: ${prepared.storyPairCount}`,
          "Write the next question.",
        ].join("\n"),
      };
    }
    return {
      systemInstruction: [
        "당신은 학생과 함께 이야기 주사위를 하는 질문 짝입니다.",
        "한국어로 된 새로운 질문 하나만 쓰고 다른 말은 쓰지 마세요.",
        "이야기와 직전 대답에서 자연스럽게 이어지고 앞 질문과 겹치지 않는 짧은 질문을 만드세요.",
      ].join("\n"),
      prompt: [
        `주사위 단어: 주인공=${words.protagonist}, 장소=${words.place}, 사건 또는 물건=${words.event}`,
        `이야기: ${story}`,
        `직전 학생 대답: ${previous}`,
        `완료한 질문과 대답 쌍: ${prepared.storyPairCount}`,
        "다음 질문을 하나 써 주세요.",
      ].join("\n"),
    };
  }
  if (prepared.gameId === "dice") {
    const face = prepared.diceFace;
    const typeInfo = face ? getQuestionDiceTypes(prepared.locale)[face - 1] : undefined;
    if (!typeInfo) {
      throw new QuestionGameRunError("질문 주사위 얼굴 정보가 올바르지 않습니다", 409);
    }
    if (prepared.locale === "en") {
      return {
        systemInstruction: [
          "You are a question dice partner for school students.",
          "Return exactly one new question in English and nothing else.",
          `Write a ${typeInfo.type} that matches this guide: ${typeInfo.desc}`,
        ].join("\n"),
        prompt: `The dice rolled ${face}. Write one ${typeInfo.type}.`,
      };
    }
    return {
      systemInstruction: [
        "당신은 학생과 함께하는 질문 주사위 짝입니다.",
        "한국어로 된 새로운 질문 하나만 쓰고 다른 말은 쓰지 마세요.",
        `${typeInfo.type}을 다음 안내에 맞게 작성하세요: ${typeInfo.desc}`,
      ].join("\n"),
      prompt: `주사위 ${face}번이 나왔습니다. ${typeInfo.type} 하나를 작성하세요.`,
    };
  }
  if (prepared.locale === "en") {
    return {
      systemInstruction: [
        "You are a question relay partner for school students.",
        "Return exactly one new question in English and nothing else.",
        "The question must connect to the previous question without repeating it.",
      ].join("\n"),
      prompt: `Topic: ${prepared.topic}\nPrevious student question: ${prepared.previousQuestion}\nWrite the next connected question.`,
    };
  }
  return {
    systemInstruction: [
      "당신은 학생과 질문을 이어 가는 질문 릴레이 짝입니다.",
      "한국어로 된 새로운 질문 하나만 쓰고 다른 말은 쓰지 마세요.",
      "직전 질문과 이어지되 같은 질문을 되풀이하지 마세요.",
    ].join("\n"),
    prompt: `주제: ${prepared.topic}\n직전 학생 질문: ${prepared.previousQuestion}\n이어서 물을 새 질문 하나를 작성하세요.`,
  };
}

function storyDiceFallbackQuestions(prepared: PreparedQuestionGameAiTurn) {
  const index = prepared.storyPairCount ?? 0;
  const questions = prepared.locale === "en"
    ? [
        "What happened next?",
        "Why did the main character act that way?",
        "How did the story end?",
      ]
    : [
        "그다음에는 어떤 일이 있었나요?",
        "주인공은 왜 그렇게 행동했나요?",
        "이야기는 어떻게 끝났나요?",
      ];
  const ordered = questions.map((_, offset) =>
    questions[(index + offset) % questions.length]
  );
  const uniqueAlternatives = Array.from(
    { length: index + 1 },
    (_, offset) => prepared.locale === "en"
      ? `What new detail could we explore in story round ${index + 1}, idea ${offset + 1}?`
      : `이야기 ${index + 1}번째 차례에서 새롭게 알아볼 점 ${offset + 1}은 무엇인가요?`,
  );
  return [...new Set([...ordered, ...uniqueAlternatives])];
}

async function issueStoryDiceFallbackTurn(prepared: PreparedQuestionGameAiTurn) {
  let collision: QuestionGameRunError | undefined;
  for (const question of storyDiceFallbackQuestions(prepared)) {
    try {
      return await issueQuestionGameAiTurn(prepared, question);
    } catch (error) {
      if (!(error instanceof QuestionGameRunError) || error.status !== 409) throw error;
      collision = error;
    }
  }
  throw collision ?? new QuestionGameRunError(
    "사용할 수 있는 이야기 주사위 대체 질문이 없습니다",
    409,
  );
}

function aiGenerationFailure(error: unknown) {
  if (error instanceof AiKeyMissingError) {
    return NextResponse.json(
      { error: "인공지능 모델이 준비되지 않았습니다" },
      { status: 503 },
    );
  }
  if (error instanceof AiBusyError || error instanceof AiQuotaError) {
    return NextResponse.json(
      { error: "인공지능 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "인공지능 질문을 만들지 못했습니다" },
    { status: 502 },
  );
}

async function releaseLease(prepared: PreparedQuestionGameAiTurn) {
  try {
    await releaseQuestionGameAiTurnLease(prepared);
  } catch {
    // 임대 만료가 다음 재시도를 열어 주므로 원래 모델 오류 응답을 유지한다.
  }
}

export async function POST(req: Request, { params }: Params) {
  const actorId = await authenticatedQuestionGameActorId();
  if (typeof actorId !== "string") return actorId;
  const limited = checkRateLimit(`question-game-run-ai-turn:${actorId}`, 20);
  if (limited) return limited;

  let prepared: PreparedQuestionGameAiTurn;
  try {
    const { id } = await params;
    prepared = await prepareQuestionGameAiTurn(
      actorId,
      id,
      await readQuestionGameRunBody(req),
    );
  } catch (error) {
    return questionGameRunFailure(error);
  }

  if (prepared.cachedResponse) {
    return NextResponse.json(prepared.cachedResponse);
  }

  let prompt: ReturnType<typeof promptFor>;
  try {
    prompt = promptFor(prepared);
  } catch (error) {
    await releaseLease(prepared);
    return questionGameRunFailure(error);
  }
  let generatedOutput: string;
  try {
    generatedOutput = await generateText({
      userId: actorId,
      prompt: prompt.prompt,
      systemInstruction: prompt.systemInstruction,
      maxOutputTokens: 80,
      timeoutMs: 12_000,
      temperature: 0.7,
    });
  } catch (error) {
    if (prepared.gameId === "story-dice") {
      try {
        return NextResponse.json(await issueStoryDiceFallbackTurn(prepared));
      } catch {
        await releaseLease(prepared);
        return aiGenerationFailure(error);
      }
    }
    await releaseLease(prepared);
    return aiGenerationFailure(error);
  }

  try {
    return NextResponse.json(await issueQuestionGameAiTurn(prepared, generatedOutput));
  } catch (error) {
    if (prepared.gameId === "story-dice") {
      try {
        return NextResponse.json(await issueStoryDiceFallbackTurn(prepared));
      } catch {
        // 아래의 공통 오류 응답으로 처리한다.
      }
    }
    await releaseLease(prepared);
    if (error instanceof QuestionGameRunError && error.status === 503) {
      return questionGameRunFailure(error);
    }
    return aiGenerationFailure(error);
  }
}
