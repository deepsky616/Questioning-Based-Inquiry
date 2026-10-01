import { AiInvalidResponseError, AiSafetyBlockedError } from "./ai-errors";
import { buildSequencePrompt, fallbackSequenceQuestions, normalizeSequencedQuestions } from "./unit-sequence";

type SequenceParams = Parameters<typeof buildSequencePrompt>[0];
type Generate = (prompt: string, responseJsonSchema: unknown, validateResponse: (data: unknown) => boolean) => Promise<unknown>;

function responseSchema(params: SequenceParams) {
  const merge = params.mode === "merge";
  const text = { type: "string", minLength: 1 };
  // 질문 수에 따라 커지는 배열 제약은 Gemini의 구조화 출력을 복잡하게 만든다.
  // 번호·개수·중복·누락은 normalizeSequencedQuestions에서 검증한다.
  const id = text;
  const properties = {
    ...(merge ? { mergedFrom: { type: "array", minItems: 1, items: id } } : { id }),
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
        minItems: 1,
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

/** 완전성을 검사하고 보완한다. 누락만 남으면 검증된 묶음과 원본 개별 질문을 보존한다. */
export async function generateQuestionSequence(params: SequenceParams, generate: Generate) {
  // 긴 저장 번호를 모델이 그대로 옮기게 하지 않고 실행 안에서만 짧은 번호를 쓴다.
  const modelParams = {
    ...params,
    questions: params.questions.map((question, index) => ({ ...question, id: `q${index + 1}` })),
  };
  const sourceIds = new Map(modelParams.questions.map((question, index) => [
    question.id, params.questions[index].id ?? `manual-${index + 1}`,
  ]));
  const normalize = (items: unknown) => {
    if (!Array.isArray(items)) return [];
    const restored = items.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const raw = item as Record<string, unknown>;
      return params.mode === "merge"
        ? { ...raw, mergedFrom: Array.isArray(raw.mergedFrom)
          ? raw.mergedFrom.map(id => typeof id === "string" ? sourceIds.get(id) : undefined) : raw.mergedFrom }
        : { ...raw, id: typeof raw.id === "string" ? sourceIds.get(raw.id) : undefined };
    });
    return normalizeSequencedQuestions(restored, params.questions, params.mode, params.flowId);
  };
  const prompt = buildSequencePrompt(modelParams);
  let feedback = "";
  let preservedResult: ReturnType<typeof normalize> = [];
  let preservedCoverage = 0;
  const preserveMissing = (items: unknown) => {
    if (params.mode !== "merge" || !Array.isArray(items) || !items.some(item =>
      item && typeof item === "object" && Array.isArray(item.mergedFrom) && item.mergedFrom.length > 1,
    )) return;
    const included = new Set(items.flatMap(item =>
      item && typeof item === "object" && Array.isArray(item.mergedFrom) ? item.mergedFrom : [],
    ));
    const missing = modelParams.questions.filter(question => !included.has(question.id));
    if (missing.length === 0) return;
    const individuals = fallbackSequenceQuestions(missing, params.flowId).map((question, index) => ({
      ...question, mergedFrom: [question.id], contentGroup: "개별 질문",
      priority: items.length + index + 1,
    }));
    // 전체를 다시 검사하므로 중복·알 수 없는 번호·잘못된 대표 질문은 복원으로 우회할 수 없다.
    const result = normalize([...items, ...individuals]);
    if (result.length > 0 && included.size > preservedCoverage) {
      preservedResult = result;
      preservedCoverage = included.size;
    }
  };
  const itemsFrom = (raw: unknown) => raw && typeof raw === "object" && "sequencedQuestions" in raw
    ? raw.sequencedQuestions : undefined;
  const validateResponse = (raw: unknown) => {
    const items = itemsFrom(raw);
    const valid = normalize(items).length > 0;
    if (!valid) {
      feedback = coverageFeedback(items, modelParams);
      preserveMissing(items);
    }
    return valid;
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const correction = attempt === 0 ? "" : `

[완전성 검증 실패에 따른 재작성]
이전 결과는 원본 누락, 중복, 알 수 없는 번호 또는 잘못된 항목 때문에 사용할 수 없습니다.
검증 내역: ${feedback}
전체 입력을 다시 확인하고 모든 원본 id를 정확히 한 번씩 포함한 완전한 결과를 작성하세요.
묶기에서는 각 mergedFrom에 실제 원본 id만 넣고 content와 구체적인 contentGroup을 빠짐없이 쓰세요.
정렬에서는 입력 id만 사용하고 질문 개수와 문장을 유지하세요. 부분 결과는 반환하지 마세요.`;
    let raw: unknown;
    try {
      // 공통 AI 계층 안에서 검증해야 불완전한 경량 모델 응답을 Flash로 대체할 수 있다.
      raw = await generate(prompt + correction, responseSchema(modelParams), validateResponse);
    } catch (error) {
      if (error instanceof AiInvalidResponseError && !(error instanceof AiSafetyBlockedError)) {
        if (attempt === 0) continue;
        if (preservedResult.length > 0) return preservedResult;
      }
      throw error;
    }
    const items = itemsFrom(raw);
    const result = normalize(items);
    if (result.length > 0) return result;
    validateResponse(raw);
  }
  if (preservedResult.length > 0) return preservedResult;
  throw new AiInvalidResponseError();
}
