import { AiBusyError, AiKeyMissingError, AiOutputTruncatedError, AiQuotaError } from "./ai-errors";
import { logger } from "./logger";

export function questionGameAiError(error: unknown, locale: string) {
  const english = locale === "en";
  const code = error instanceof AiKeyMissingError ? "AI_CONFIGURATION_REQUIRED"
    : error instanceof AiQuotaError ? "AI_QUOTA_EXCEEDED"
      : error instanceof AiOutputTruncatedError ? "AI_OUTPUT_TRUNCATED"
        : error instanceof AiBusyError ? "AI_BUSY" : "AI_UNAVAILABLE";
  const messages = {
    AI_CONFIGURATION_REQUIRED: english
      ? "AI is not set up yet. Please ask your teacher to check the AI settings."
      : "인공지능 연결 설정이 필요해요. 선생님께 설정 확인을 부탁해 주세요.",
    AI_QUOTA_EXCEEDED: english
      ? "The AI usage limit has been reached. Please let your teacher know."
      : "인공지능 사용 한도에 도달했어요. 선생님께 알려 주세요.",
    AI_OUTPUT_TRUNCATED: english
      ? "The AI response did not finish. Your entry is still here. Please try again."
      : "인공지능 답변을 끝까지 받지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.",
    AI_BUSY: english
      ? "AI is busy right now. Your entry is still here. Please try again shortly."
      : "인공지능 연결이 잠시 지연되고 있어요. 작성한 내용은 그대로 있으니 잠시 후 다시 시도해 주세요.",
    AI_UNAVAILABLE: english
      ? "The AI response could not be processed. Please try again."
      : "인공지능 답변을 처리하지 못했어요. 다시 시도해 주세요.",
  };
  // 질문·정답·모델 원문·인증 정보를 기록하지 않고 원인 종류만 남긴다.
  logger.warn("질문놀이 인공지능 요청을 완료하지 못했습니다", { code });
  return { error: messages[code], code };
}

export function mysteryUncertainAnswer(locale: string) {
  return {
    error: locale === "en"
      ? "I cannot answer this feature with certainty. Ask about one other feature, such as appearance, habitat, or purpose. Your turn has not been used."
      : "이 특징은 확실하게 답하기 어려워요. 생김새·사는 곳·쓰임새 등 다른 특징을 한 가지씩 물어보세요. 질문 횟수는 줄어들지 않았어요.",
    mysteryRewriteRequired: true,
    mysteryAnswerUncertain: true,
  };
}
