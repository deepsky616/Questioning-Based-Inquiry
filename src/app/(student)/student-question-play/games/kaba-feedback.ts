// 까바놀이 AI 피드백 프로토콜 — 프롬프트가 한국어 토큰(판정/이유/격려)으로
// 응답하도록 계약되어 있어, 파서 토큰은 로케일과 무관하게 한국어로 유지한다.
// 화면 표시는 KabaGame이 로케일별 텍스트로 따로 변환한다.
export type KabaVerdict = "잘했어요" | "다시해봐요";

export const KABA_VERDICT_GOOD: KabaVerdict = "잘했어요";
export const KABA_VERDICT_RETRY: KabaVerdict = "다시해봐요";

export interface ParsedKabaFeedback {
  verdict: KabaVerdict;
  reason: string;
  cheer: string;
}

export function parseKabaFeedbackText(text: string): ParsedKabaFeedback | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let verdict: KabaVerdict | null = null;
  let reason = "";
  let cheer = "";
  for (const line of lines) {
    if (line.startsWith("판정:")) {
      if (line.includes(KABA_VERDICT_GOOD)) verdict = KABA_VERDICT_GOOD;
      else if (line.includes(KABA_VERDICT_RETRY)) verdict = KABA_VERDICT_RETRY;
    }
    if (line.startsWith("이유:")) reason = line.replace("이유:", "").trim();
    if (line.startsWith("격려:")) cheer = line.replace("격려:", "").trim();
  }
  if (!verdict) return null;
  return { verdict, reason, cheer };
}
