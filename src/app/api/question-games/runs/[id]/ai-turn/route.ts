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
    await releaseLease(prepared);
    return aiGenerationFailure(error);
  }

  try {
    return NextResponse.json(await issueQuestionGameAiTurn(prepared, generatedOutput));
  } catch (error) {
    await releaseLease(prepared);
    if (error instanceof QuestionGameRunError && error.status === 503) {
      return questionGameRunFailure(error);
    }
    return aiGenerationFailure(error);
  }
}
