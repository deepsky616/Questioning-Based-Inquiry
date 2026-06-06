/**
 * Gemini SDK 에러 메시지를 사용자에게 의미 있는 안내로 분류.
 * 키 만료/모델 미지원/권한/할당량/차단/네트워크를 명확히 구분합니다.
 */
export interface GeminiErrorClass {
  status: number;
  hint: string;
  action: string;
}

export function classifyGeminiError(raw: unknown): GeminiErrorClass {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? "")).toLowerCase();

  if (msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("invalid api key")) {
    return {
      status: 400,
      hint: "API 키가 유효하지 않아요.",
      action: "Google AI Studio에서 키를 다시 발급받아 입력해주세요.",
    };
  }
  if (msg.includes("permission_denied") || msg.includes(" 403 ") || msg.includes("[403")) {
    return {
      status: 403,
      hint: "이 API 키는 해당 모델 사용 권한이 없어요.",
      action: "Google Cloud 프로젝트에서 Generative Language API를 활성화하거나, 다른 모델을 선택해보세요.",
    };
  }
  if (msg.includes("not found") || msg.includes(" 404 ") || msg.includes("[404") || msg.includes("is not supported")) {
    return {
      status: 404,
      hint: "선택한 모델 이름을 현재 사용할 수 없어요.",
      action: "다른 Gemini 모델(예: Pro ↔ Flash)을 선택해 다시 테스트해주세요.",
    };
  }
  // 선불 크레딧 소진 (429 안에서 가장 명확한 신호)
  if (msg.includes("prepayment") || msg.includes("credits are depleted") || msg.includes("credit") && msg.includes("deplete")) {
    return {
      status: 402,
      hint: "Google AI Studio의 선불 크레딧이 모두 소진됐어요.",
      action: "https://ai.studio/projects 에서 결제 정보 추가 또는 새 무료 키 발급 후 다시 시도해주세요.",
    };
  }
  if (msg.includes("quota") || msg.includes("rate") || msg.includes(" 429 ") || msg.includes("[429") || msg.includes("resource_exhausted")) {
    return {
      status: 429,
      hint: "할당량 또는 요청 한도를 초과했어요.",
      action: "잠시 후 다시 시도하거나 결제·할당량 설정을 확인해주세요.",
    };
  }
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("finishreason")) {
    return {
      status: 422,
      hint: "응답이 안전 정책에 의해 차단됐어요.",
      action: "프롬프트나 모델 설정을 조정해보세요. (테스트 메시지로는 드물어요)",
    };
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("enetunreach") || msg.includes("etimedout")) {
    return {
      status: 503,
      hint: "네트워크 오류로 Gemini에 닿지 못했어요.",
      action: "인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.",
    };
  }
  return {
    status: 500,
    hint: "알 수 없는 오류가 발생했어요.",
    action: "아래 자세한 원인을 확인하거나, 다시 시도해주세요.",
  };
}
