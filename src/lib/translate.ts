import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { languageName } from "@/lib/locale";

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

  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({ model });

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate the following numbered Korean texts (questions or comments written by K-12 students) into ${target}.
Keep the meaning faithful and the tone natural for students. Do not add explanations.
Return ONLY a JSON array of strings, one per input, in the same order. No markdown, no extra keys.

Texts:
${numbered}`;

  const result = await gemini.generateContent(prompt);
  const raw = result.response.text().trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Invalid translation response");
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error("Translation count mismatch");
  }
  return parsed.map((v) => String(v));
}
