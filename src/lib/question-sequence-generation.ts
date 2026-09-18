import { AiInvalidResponseError } from "./ai-errors";
import { buildSequencePrompt, normalizeSequencedQuestions } from "./unit-sequence";

type SequenceParams = Parameters<typeof buildSequencePrompt>[0];
type Generate = (prompt: string, responseJsonSchema: unknown) => Promise<unknown>;

function responseSchema(params: SequenceParams) {
  const merge = params.mode === "merge";
  const text = { type: "string", minLength: 1 };
  const id = { ...text, enum: params.questions.map((question, index) => question.id ?? `manual-${index + 1}`) };
  const properties = {
    ...(merge ? { mergedFrom: { type: "array", minItems: 1, maxItems: params.questions.length, items: id } } : { id }),
    type: { type: "string", enum: ["factual", "conceptual", "controversial", "student"] },
    ...(merge ? { content: { ...text, maxLength: 500 } } : {}),
    contentGroup: { ...text, maxLength: 80 },
    priority: { type: "integer", minimum: 1 },
    lessonPhase: { ...text, maxLength: 40 },
    rationale: { ...text, maxLength: 200 },
  };
  return {
    type: "object",
    required: ["sequencedQuestions"],
    properties: {
      sequencedQuestions: {
        type: "array",
        minItems: merge ? 1 : params.questions.length,
        maxItems: params.questions.length,
        items: { type: "object", properties, required: Object.keys(properties) },
      },
    },
  };
}

function coverageFeedback(value: unknown, params: SequenceParams) {
  const expected = params.questions.map((question, index) => question.id ?? `manual-${index + 1}`);
  const counts = new Map<string, number>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const ids = params.mode === "merge" ? item.mergedFrom : [item.id];
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return JSON.stringify({
    missingIds: expected.filter(id => !counts.has(id)),
    duplicateIds: [...counts].filter(([, count]) => count > 1).map(([id]) => id),
    unknownIds: [...counts.keys()].filter(id => !expected.includes(id)),
  });
}

/** 누락·중복이 있는 응답은 한 번 보완하고, 끝까지 검증되지 않으면 사용하지 않는다. */
export async function generateQuestionSequence(params: SequenceParams, generate: Generate) {
  const prompt = buildSequencePrompt(params);
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const correction = attempt === 0 ? "" : `

[완전성 검증 실패에 따른 재작성]
이전 결과는 원본 누락, 중복, 알 수 없는 번호 또는 잘못된 항목 때문에 사용할 수 없습니다.
검증 내역: ${feedback}
전체 입력을 다시 확인하고 모든 원본 id를 정확히 한 번씩 포함한 완전한 결과를 작성하세요.
묶기에서는 각 mergedFrom에 실제 원본 id만 넣고 content와 구체적인 contentGroup을 빠짐없이 쓰세요.
정렬에서는 입력 id만 사용하고 질문 개수와 문장을 유지하세요. 부분 결과는 반환하지 마세요.`;
    const raw = await generate(prompt + correction, responseSchema(params));
    const items = raw && typeof raw === "object" && "sequencedQuestions" in raw
      ? raw.sequencedQuestions : undefined;
    const result = normalizeSequencedQuestions(items, params.questions, params.mode, params.flowId);
    if (result.length > 0) return result;
    feedback = coverageFeedback(items, params);
  }
  throw new AiInvalidResponseError();
}
