import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { languageName } from "@/lib/locale";
import { alternateModel, chooseModelAuto } from "@/lib/api-config";
import { isTransientAiError } from "@/lib/ai-errors";

/** 원문 변경 감지용 해시 (원문이 수정되면 캐시된 번역을 폐기·재생성한다) */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * 한국어 사용자 콘텐츠(질문·댓글)를 targetLocale로 번역한다.
 * 여러 텍스트를 한 번의 Gemini 호출로 처리(JSON 배열 입출력)해 비용을 줄인다.
 * 순서/개수는 입력과 동일하게 보장하며, 실패 시 예외를 던진다.
 */
export async function translateTexts(
  texts: string[],
  targetLocale: string,
  apiKey: string,
  model: string,
): Promise<string[]> {
  if (texts.length === 0) return [];
  const target = languageName(targetLocale);

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate the following numbered Korean texts (questions or comments written by K-12 students) into ${target}.
Keep the meaning faithful and the tone natural for students. Do not add explanations.
Return ONLY a JSON array of strings, one per input, in the same order. No markdown, no extra keys.

Texts:
${numbered}`;

  // 프롬프트 크기에 따라 모델 자동 선택(짧은 배치 flash-lite / 긴 배치 flash)
  const primary = chooseModelAuto(model, prompt.length);
  const genAI = new GoogleGenerativeAI(apiKey);
  const runWith = async (modelName: string) => {
    // JSON 출력 강제 — 마크다운·설명이 섞여 파싱에 실패하는 것을 방지
    const gemini = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    return gemini.generateContent(prompt);
  };

  let result;
  try {
    result = await runWith(primary);
  } catch (err) {
    // 혼잡(503/429)이면 대체 모델로 1회 페일오버
    if (!isTransientAiError(err)) throw err;
    result = await runWith(alternateModel(primary));
  }
  const raw = result.response.text().trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Invalid translation response");
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error("Translation count mismatch");
  }
  return parsed.map((v) => String(v));
}
