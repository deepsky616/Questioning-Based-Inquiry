import { describe, expect, it } from "vitest";
import {
  buildStudentGuideRepairPrompt,
  validateStudentGuideBundle,
} from "@/lib/student-guide-completeness";

const expected = {
  achievementCount: 2,
  coreSentenceCount: 2,
  essentialQuestionCount: 1,
  inquiryQuestionCount: 2,
};
const complete = {
  learningGuides: {
    coreIdea: {
      explanation: "큰 뜻을 쉽게 풀어요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생태계", meaning: "생물과 환경이 관계를 맺는 체계" },
        { term: "광합성", meaning: "식물이 빛으로 양분을 만드는 과정" },
        { term: "먹이 사슬", meaning: "먹고 먹히는 관계의 연결" },
      ],
    },
    achievements: [
      { index: 0, explanation: "첫 성취기준을 학생 눈높이로 풀어요." },
      { index: 1, explanation: "둘째 성취기준을 학생 눈높이로 풀어요." },
    ],
    coreSentences: [
      { index: 0, explanation: "첫 문장을 쉽게 풀어요." },
      { index: 1, explanation: "둘째 문장을 쉽게 풀어요." },
    ],
    essentialQuestions: [
      { index: 0, thinkingFocus: "관계와 변화를 살펴봐요.", perspectives: ["관계", "변화"] },
    ],
  },
  guides: [0, 1].map((index) => ({
    index,
    meaning: `${index + 1}번 질문이 묻는 뜻`,
    keywords: [
      { term: `${index + 1}번 낱말 하나`, meaning: "첫째 쉬운 뜻" },
      { term: `${index + 1}번 낱말 둘`, meaning: "둘째 쉬운 뜻" },
    ],
    thinkingStart: "처음 살펴볼 단서예요.",
  })),
};

describe("학생용 설명 묶음 완전성", () => {
  it("모든 필수 설명과 핵심 낱말이 있으면 정규화된 결과를 반환한다", () => {
    const result = validateStudentGuideBundle(complete, expected);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.guides).toHaveLength(2);
  });

  it.each([
    ["핵심 아이디어 낱말 부족", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.slice(0, 2) } } }],
    ["빈 낱말 뜻", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.map((item, index) => index === 0 ? { ...item, meaning: "" } : item) } } }],
    ["중복 낱말", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.map((item, index) => index === 1 ? { ...item, term: "생태계" } : item) } } }],
    ["핵심 아이디어 낱말 6개", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: [...complete.learningGuides.coreIdea.keywords, { term: "서식지", meaning: "생물이 살아가는 곳" }, { term: "분해자", meaning: "죽은 생물을 분해하는 생물" }, { term: "생산자", meaning: "스스로 양분을 만드는 생물" }] } } }],
    ["성취기준 설명 누락", { ...complete, learningGuides: { ...complete.learningGuides, achievements: complete.learningGuides.achievements.slice(0, 1) } }],
    ["성취기준 설명 빈칸", { ...complete, learningGuides: { ...complete.learningGuides, achievements: complete.learningGuides.achievements.map((item, index) => index === 0 ? { ...item, explanation: "" } : item) } }],
    ["문장 설명 누락", { ...complete, learningGuides: { ...complete.learningGuides, coreSentences: complete.learningGuides.coreSentences.slice(0, 1) } }],
    ["탐구 질문 낱말 부족", { ...complete, guides: complete.guides.map((guide, index) => index === 0 ? { ...guide, keywords: guide.keywords.slice(0, 1) } : guide) }],
    ["탐구 질문 낱말 6개", { ...complete, guides: complete.guides.map((guide, index) => index === 0 ? { ...guide, keywords: [...guide.keywords, { term: "추가 낱말 셋", meaning: "셋째 쉬운 뜻" }, { term: "추가 낱말 넷", meaning: "넷째 쉬운 뜻" }, { term: "추가 낱말 다섯", meaning: "다섯째 쉬운 뜻" }, { term: "추가 낱말 여섯", meaning: "여섯째 쉬운 뜻" }] } : guide) }],
  ])("%s을 거부한다", (_name, value) => {
    const result = validateStudentGuideBundle(value, expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it("보완 요청에 원래 요청과 문제와 12000자로 자른 이전 응답을 넣는다", () => {
    const originalPrompt = "학생용 설명을 만들어 주세요.";
    const issues = ["핵심 낱말이 부족합니다.", "질문 설명이 빠졌습니다."];
    const includedResponse = "가".repeat(12000);
    const prompt = buildStudentGuideRepairPrompt(
      originalPrompt,
      `${includedResponse}잘림`,
      issues,
    );

    expect(prompt).toContain(originalPrompt);
    expect(prompt).toContain("- 핵심 낱말이 부족합니다.");
    expect(prompt).toContain("- 질문 설명이 빠졌습니다.");
    expect(prompt).toContain(includedResponse);
    expect(prompt).not.toContain("잘림");
  });
});
