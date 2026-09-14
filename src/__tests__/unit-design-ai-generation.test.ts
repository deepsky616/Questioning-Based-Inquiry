import { describe, expect, it, vi } from "vitest";
import { generateUnitDesignData } from "@/lib/unit-design-ai-generation";
import { unitDesignGenerateSchema } from "@/lib/unit-design-prompt";
import { AiOutputTruncatedError } from "@/lib/ai-errors";

const keywords = [{ term: "평균", meaning: "자료를 고르게 나눈 값" }, { term: "자료", meaning: "모아서 살펴보는 값" }];
const guide = (index: number, label = "질문") => ({ index, meaning: `${label}의 뜻을 알아봐요.`, thinkingStart: "자료를 비교해 보세요.", keywords });
const input = (step = "learning_guides") => unitDesignGenerateSchema.parse({
  step, subject: "수학", gradeRange: "5~6", area: "자료와 가능성", coreIdea: "자료를 비교한다.",
  achievements: Array.from({ length: 3 }, (_, index) => ({ code: `기준${index}`, content: `내용${index}` })),
  coreSentences: ["문장0", "문장1", "문장2"], essentialQuestions: ["핵심질문0", "핵심질문1"],
  inquiryQuestions: Array.from({ length: 5 }, (_, index) => ({ type: "conceptual", content: `탐구질문${index}인가요?` })),
});
const bundle = (batch: number, achievements: number, sentences: number, questions: number, guides: number) => ({
  learningGuides: {
    coreIdea: { explanation: "평균으로 자료를 비교해요.", lifeConnection: "우리 반 독서 시간을 살펴봐요.", keywords: [...keywords, { term: "비교", meaning: "같고 다른 점 찾기" }] },
    achievements: Array.from({ length: achievements }, (_, index) => ({ index, explanation: `성취기준${batch * 2 + index}` })),
    coreSentences: Array.from({ length: sentences }, (_, index) => ({ index, explanation: `문장${batch * 2 + index}` })),
    essentialQuestions: Array.from({ length: questions }, (_, index) => ({ index, thinkingFocus: `핵심질문${batch + index}`, perspectives: ["같은 점", "다른 점"] })),
  },
  guides: Array.from({ length: guides }, (_, index) => guide(index, `탐구질문${batch * 2 + index}`)),
});

describe("긴 학생용 설명을 나누어 완성하기", () => {
  it.each([{ keywords: [{}] }, { keywords: "평균" }, { keywords: [] }])("핵심어가 잘못된 형식이면 화면에 전달하지 않는다: %j", async (response) => {
    await expect(generateUnitDesignData(input("keywords"), vi.fn().mockResolvedValue(JSON.stringify(response)))).rejects.toThrow("AI_INVALID_RESPONSE");
  });
  it("묶음별 지역 번호를 원래 성취기준·문장·질문 번호로 되돌린다", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(bundle(0, 2, 2, 1, 2)))
      .mockResolvedValueOnce(JSON.stringify(bundle(1, 1, 1, 1, 2)))
      .mockResolvedValueOnce(JSON.stringify(bundle(2, 0, 0, 0, 1)));
    const result = await generateUnitDesignData(input(), generate) as ReturnType<typeof bundle>;
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.guides.map(item => item.index)).toEqual([0, 1, 2, 3, 4]);
    expect(result.guides[4].meaning).toContain("탐구질문4");
    expect(result.learningGuides.achievements.map(item => item.index)).toEqual([0, 1, 2]);
    expect(result.learningGuides.coreSentences[2]).toEqual({ index: 2, explanation: "문장2" });
    expect(result.learningGuides.essentialQuestions[1].thinkingFocus).toBe("핵심질문1");
    expect(generate.mock.calls[0][0]).toContain("탐구질문0인가요?");
    expect(generate.mock.calls[0][0]).not.toContain("탐구질문4인가요?");
    expect(generate.mock.calls[0][1]).toMatchObject({
      required: ["learningGuides", "guides"],
      properties: { guides: { minItems: 2, maxItems: 2 } },
    });
    expect(generate.mock.calls[2][1]).toMatchObject({ properties: {
      guides: { minItems: 1, maxItems: 1 },
      learningGuides: { properties: { achievements: { maxItems: 0 }, coreSentences: { maxItems: 0 }, essentialQuestions: { maxItems: 0 } } },
    } });
  });

  it("한 묶음이라도 잘리면 앞의 일부 설명만 반환하지 않는다", async () => {
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify(bundle(0, 2, 2, 1, 2))).mockRejectedValueOnce(new AiOutputTruncatedError());
    await expect(generateUnitDesignData(input(), generate)).rejects.toBeInstanceOf(AiOutputTruncatedError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("모델이 번호 순서와 다르게 반환해도 설명이 다른 질문에 붙지 않는다", async () => {
    const data = input();
    data.achievements = data.achievements.slice(0, 2);
    data.coreSentences = data.coreSentences.slice(0, 2);
    data.essentialQuestions = data.essentialQuestions.slice(0, 1);
    data.inquiryQuestions = data.inquiryQuestions!.slice(0, 2);
    const reversed = bundle(0, 2, 2, 1, 2);
    reversed.guides.reverse();
    reversed.learningGuides.achievements.reverse();
    const result = await generateUnitDesignData(data, vi.fn().mockResolvedValue(JSON.stringify(reversed))) as ReturnType<typeof bundle>;
    expect(result.guides[0].meaning).toContain("탐구질문0");
    expect(result.learningGuides.achievements[0].explanation).toBe("성취기준0");
  });

  it("학생 안내만 생성할 때도 모든 질문 번호를 유지한다", async () => {
    const generate = vi.fn();
    for (const [batch, count] of [[0, 2], [1, 2], [2, 1]]) generate.mockResolvedValueOnce(JSON.stringify({ guides: bundle(batch, 0, 0, 0, count).guides }));
    const result = await generateUnitDesignData(input("student_guides"), generate) as { guides: ReturnType<typeof guide>[] };
    expect(result.guides.map(item => item.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("질문 번호가 중복된 안내는 한 번 보완한 후에도 잘못되면 반환하지 않는다", async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ guides: [guide(0), guide(0)] }));
    await expect(generateUnitDesignData(input("student_guides"), generate)).rejects.toThrow("AI_INVALID_RESPONSE");
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
