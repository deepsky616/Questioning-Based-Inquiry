import { createJsonGenerationSession, type GenerateOptions } from "@/lib/ai";
import { AiInvalidResponseError } from "@/lib/ai-errors";
import { JsonExtractionError } from "@/lib/json-extract";

interface ActivityTarget {
  targetId: string;
  targetType: "question" | "comment";
}

interface ActivityAnalysis {
  bonuses: unknown[];
  summary: string;
}

const BATCH_SIZE = 6;
const targetKey = (target: ActivityTarget) => `${target.targetType}:${target.targetId}`;

/** 전체 비교 맥락은 보존하고, 결과를 생성하는 대상만 나누어 출력 잘림을 예방한다. */
export async function analyzeActivityBonuses(
  options: GenerateOptions,
  targets: ActivityTarget[],
): Promise<ActivityAnalysis> {
  if (targets.length === 0) return { bonuses: [], summary: "" };
  const generate = await createJsonGenerationSession(options.userId);
  const document = JSON.parse(options.prompt);

  async function analyze(batch: ActivityTarget[], compactRetry = false): Promise<ActivityAnalysis> {
    try {
      const response = await generate<unknown>({
        ...options,
        prompt: JSON.stringify({
          ...document,
          trustedEvaluationPolicy: {
            ...document.trustedEvaluationPolicy,
            analysisTargets: batch,
            batchPolicy: "Evaluate only analysisTargets. Compare each target against ALL activity evidence, including work outside this batch. Use createdAt, then targetId to identify earlier work. Never award or flag targets outside analysisTargets. Return at most two bonuses per target; a flagged target gets only its flag. The server enforces the student point cap across all batches.",
            responseLengthPolicy: compactRetry
              ? "Keep each reason within 80 characters and the summary within 120 characters."
              : "Keep each reason within 160 characters and the summary within 300 characters.",
          },
        }),
        // 시연의 2,048토큰 상한에서도 사고가 결과 예산을 소진하지 않도록 한다.
        // Pro 사용 시 공통 계층에서 필수 최소 사고 예산을 보장한다.
        thinkingBudget: 0,
        maxOutputTokens: 4_096,
        retryTruncatedOutput: false,
        timeoutMs: 45_000,
      });
      if (!response || typeof response !== "object" || !("bonuses" in response) || !Array.isArray(response.bonuses)) {
        throw new AiInvalidResponseError();
      }
      const allowed = new Set(batch.map(targetKey));
      return {
        // 모델이 맥락에 있는 다른 묶음까지 평가해도 해당 결과를 섞지 않는다.
        bonuses: response.bonuses.filter(candidate =>
          candidate && typeof candidate === "object" &&
          allowed.has(`${candidate.targetType}:${candidate.targetId}`),
        ),
        summary: "summary" in response && typeof response.summary === "string" ? response.summary.trim().slice(0, 300) : "",
      };
    } catch (error) {
      const recoverable = error instanceof AiInvalidResponseError || error instanceof JsonExtractionError || error instanceof SyntaxError;
      if (!recoverable) throw error;
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        const left = await analyze(batch.slice(0, middle));
        const right = await analyze(batch.slice(middle));
        return combine([left, right]);
      }
      if (!compactRetry) return analyze(batch, true);
      throw error;
    }
  }

  const results: ActivityAnalysis[] = [];
  for (let offset = 0; offset < targets.length; offset += BATCH_SIZE) {
    results.push(await analyze(targets.slice(offset, offset + BATCH_SIZE)));
  }
  // 전체가 성공한 뒤에만 호출자에게 반환해 부분 채점 결과가 저장되지 않도록 한다.
  return combine(results);
}

function combine(results: ActivityAnalysis[]): ActivityAnalysis {
  return {
    bonuses: results.flatMap(result => result.bonuses),
    summary: [...new Set(results.map(result => result.summary).filter(Boolean))].join("\n").slice(0, 4_000),
  };
}
