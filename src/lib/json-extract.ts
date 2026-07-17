/**
 * AI 응답에서 JSON 객체를 견고하게 추출.
 * - markdown 코드 fence(```json ... ``` / ``` ... ```) 제거
 * - 첫 '{'부터 시작해 따옴표·이스케이프를 인식하며 균형 잡힌 '}'를 찾음
 * - 추출된 부분만 JSON.parse — 평문 안의 중괄호에 영향받지 않음
 *
 * 모든 단계에서 실패 시 구체적인 에러 메시지를 던집니다.
 */
export class JsonExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonExtractionError";
  }
}

function extractBalancedJson(raw: string, open: "{" | "[", close: "}" | "]", label: string): unknown {
  if (!raw) throw new JsonExtractionError("AI 응답이 비어있습니다");
  let text = raw.replace(/^```(?:json|JSON)?\s*/m, "").replace(/```\s*$/m, "").trim();

  const start = text.indexOf(open);
  if (start < 0) throw new JsonExtractionError(`${label}를 찾을 수 없습니다`);

  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new JsonExtractionError(`${label}가 닫히지 않았습니다`);

  const sliced = text.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new JsonExtractionError(`JSON 파싱 실패: ${msg}`);
  }
}

export function extractJsonObject(raw: string): unknown {
  return extractBalancedJson(raw, "{", "}", "JSON 객체");
}

export function extractJsonArray(raw: string): unknown {
  return extractBalancedJson(raw, "[", "]", "JSON 배열");
}
