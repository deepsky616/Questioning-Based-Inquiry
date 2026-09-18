import { describe, expect, it, vi } from "vitest";
import { generateQuestionSequence } from "@/lib/question-sequence-generation";
import { AiInvalidResponseError } from "@/lib/ai-errors";

const params = {
  flowId: "cognitive-development", subject: "과학", topic: "식물", mode: "merge" as const,
  questions: [
    { id: "a", content: "식물은 빛이 왜 필요할까?", context: "햇빛과 식물의 자람을 관찰한 뒤" },
    { id: "b", content: "식물에게 햇빛이 필요한 까닭은?" },
    { id: "c", content: "물을 얼마나 주어야 할까?" },
  ],
};
const valid = { sequencedQuestions: [
  { mergedFrom: ["a", "b"], content: "식물에게 빛이 필요한 이유는 무엇일까?", contentGroup: "빛의 필요성" },
  { mergedFrom: ["c"], content: params.questions[2].content, contentGroup: "물의 양" },
] };

describe("질문 묶음 생성의 완전성 검사", () => {
  it("질문 맥락을 전달하고 모든 원본을 보존한 결과를 채택한다", async () => {
    const generate = vi.fn().mockResolvedValue(valid);
    const result = await generateQuestionSequence(params, generate);
    expect(result.flatMap(q => q.mergedFrom)).toEqual(params.questions.map(q => q.content));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain(params.questions[0].context);
    expect(generate.mock.calls[0][1]).toMatchObject({ properties: { sequencedQuestions: { minItems: 1, maxItems: 3 } } });
  });

  it("일부 원본이 빠지면 전체 결과를 한 번 다시 생성한다", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ sequencedQuestions: valid.sequencedQuestions.slice(0, 1) }).mockResolvedValueOnce(valid);
    const result = await generateQuestionSequence(params, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("완전성 검증 실패");
    expect(generate.mock.calls[1][0]).toContain('"missingIds":["c"]');
    expect(result.flatMap(q => q.mergedFrom)).toHaveLength(3);
  });

  it("두 번 모두 불완전하면 성공으로 표시할 결과를 반환하지 않는다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: valid.sequencedQuestions.slice(0, 1) });
    await expect(generateQuestionSequence(params, generate)).rejects.toBeInstanceOf(AiInvalidResponseError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("통신 오류는 검증 재시도로 중복 호출하지 않는다", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("모델 연결 실패"));
    await expect(generateQuestionSequence(params, generate)).rejects.toThrow("모델 연결 실패");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("모두 다른 질문을 억지로 합칠 필요가 없다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: params.questions.map(q => ({ mergedFrom: [q.id], content: q.content, contentGroup: q.content })) });
    expect(await generateQuestionSequence(params, generate)).toHaveLength(3);
  });
});
