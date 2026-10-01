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
  { mergedFrom: ["q1", "q2"], content: "식물에게 빛이 필요한 이유는 무엇일까?", contentGroup: "빛의 필요성" },
  { mergedFrom: ["q3"], content: params.questions[2].content, contentGroup: "물의 양" },
] };

describe("질문 묶음 생성의 완전성 검사", () => {
  it("모델이 긴 저장 번호를 잘못 옮겨도 짧은 번호로 생성해 원본 연결을 보존한다", async () => {
    const longIds = {
      ...params,
      questions: params.questions.map((q, index) => ({ ...q, id: `cmu0000000000000000000000${index + 1}` })),
    };
    const result = await generateQuestionSequence(longIds, async (prompt) => {
      const input = JSON.parse(prompt.split("[분석할 질문 데이터]\n")[1].split("\n\n")[0]) as { id: string; content: string }[];
      return { sequencedQuestions: input.map(q => ({
        mergedFrom: [q.id.length > 12 ? q.id.slice(0, 12) : q.id], content: q.content, contentGroup: "식물의 자람",
      })) };
    });
    expect(result.map(q => q.id)).toEqual(longIds.questions.map(q => q.id));
    expect(result.flatMap(q => q.mergedFrom)).toEqual(params.questions.map(q => q.content));
  });

  it("질문 맥락을 전달하고 모든 원본을 보존한 결과를 채택한다", async () => {
    const generate = vi.fn().mockResolvedValue(valid);
    const result = await generateQuestionSequence(params, generate);
    expect(result.flatMap(q => q.mergedFrom)).toEqual(params.questions.map(q => q.content));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain(params.questions[0].context);
    expect(generate.mock.calls[0][1]).toMatchObject({ properties: { sequencedQuestions: { minItems: 1 } } });
  });

  it("일부 원본이 빠지면 전체 결과를 한 번 다시 생성한다", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ sequencedQuestions: valid.sequencedQuestions.slice(0, 1) }).mockResolvedValueOnce(valid);
    const result = await generateQuestionSequence(params, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("완전성 검증 실패");
    expect(generate.mock.calls[1][0]).toContain('"missingIds":["q3"]');
    expect(result.flatMap(q => q.mergedFrom)).toHaveLength(3);
  });

  it("두 번 모두 불완전하면 성공으로 표시할 결과를 반환하지 않는다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: [{ mergedFrom: ["q1", "q1"], content: "빛의 역할은?", contentGroup: "빛" }] });
    await expect(generateQuestionSequence(params, generate)).rejects.toBeInstanceOf(AiInvalidResponseError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("보완 후에도 일부만 누락되면 검증된 묶음을 유지하고 빠진 원본을 개별 질문으로 보존한다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: valid.sequencedQuestions.slice(0, 1) });
    const result = await generateQuestionSequence(params, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].mergedFrom).toEqual([params.questions[0].content, params.questions[1].content]);
    expect(result[1]).toMatchObject({ id: "c", content: params.questions[2].content, mergedFrom: [params.questions[2].content] });
  });

  it("복원할 때 모르는 번호가 섞인 묶음은 채택하지 않는다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: [{ mergedFrom: ["q1", "없는 질문"], content: "빛의 역할은?", contentGroup: "빛" }] });
    await expect(generateQuestionSequence(params, generate)).rejects.toBeInstanceOf(AiInvalidResponseError);
  });

  it("통신 오류는 검증 재시도로 중복 호출하지 않는다", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("모델 연결 실패"));
    await expect(generateQuestionSequence(params, generate)).rejects.toThrow("모델 연결 실패");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("모두 다른 질문을 억지로 합칠 필요가 없다", async () => {
    const generate = vi.fn().mockResolvedValue({ sequencedQuestions: params.questions.map((q, index) => ({ mergedFrom: [`q${index + 1}`], content: q.content, contentGroup: q.content })) });
    expect(await generateQuestionSequence(params, generate)).toHaveLength(3);
  });
});
