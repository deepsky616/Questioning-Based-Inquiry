import { expect, it } from "vitest";
import { normalizeCognitiveType } from "@/lib/question-labels";
import { getQuestionContentIssue } from "@/lib/question-content-quality";
import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { aggregateTeacherStats } from "@/lib/teacher-stats-aggregate";
import { buildInquiryGraphSummary } from "@/lib/inquiry-graph";
import { buildDemoModerationQuestions } from "../../scripts/demo-moderation-content.mjs";

it("분류 불가 기록을 사실적 질문으로 바꾸거나 유형 통계에 넣지 않는다", () => {
  expect(normalizeCognitiveType("unclassified")).toBeNull();
  expect(summarizeQuestionTypes([
    { closure: "closed", cognitive: "factual" },
    { closure: "unclassified", cognitive: "unclassified" },
  ])).toEqual({
    total: 1,
    closure: { closed: 1, open: 0 },
    cognitive: { factual: 1, conceptual: 0, controversial: 0 },
  });
});

it("반복 문자 시연 사례를 분류 불가로 보관하면서 교사 검토 표시를 유지한다", () => {
  const rows = buildDemoModerationQuestions({
    sessionId: "usb-demo-session-explore-math",
    context: "빛의 성질",
    studentIds: Array.from({ length: 28 }, (_, i) => `usb-demo-student-${String(i + 1).padStart(2, "0")}`),
  });
  expect(rows.find(q => /^ㅋ+$/.test(q.content))).toMatchObject({
    closure: "unclassified", cognitive: "unclassified", inquiryType: null,
    flagged: true, isPublic: false,
  });
});

it.each([
  "왜?", "왜요?", "주황색인가요?", "1+1?", "123은 소수인가요?",
  "이 표현에 ㅋㅋ가 들어간 이유가 뭘까요?", "물은 왜 증발하나요?",
])("의미 있는 짧은 질문과 수식을 허용한다: %s", content => {
  expect(getQuestionContentIssue(content)).toBeNull();
});

it.each([
  "ㅋ\u200bㅋ\u200bㅋ", "ㅎ ㅎ ㅎ", "ㄱㄴㄷㄹ", "ㅋㅋ!!!😂",
  "가가가가가가", "하하하하하하", "!!!", "",
])("명백히 읽을 수 없는 입력을 차단한다: %s", content => {
  expect(getQuestionContentIssue(content)).toBeTruthy();
});

it("분류 불가 기록을 교사 통계와 탐구 그래프의 정상 질문으로 세지 않는다", () => {
  const invalid = {
    content: "ㅋㅋㅋㅋ", closure: "unclassified", cognitive: "unclassified",
    createdAt: new Date("2026-09-15"),
    author: { id: "s1", name: "학생", className: "1", grade: "5", studentNumber: "1" },
  };
  expect(aggregateTeacherStats([invalid], new Date("2026-09-01"), new Date("2026-09-16")).total).toBe(0);
  const graph = buildInquiryGraphSummary([], [invalid]);
  expect(graph.studentQuestionCount).toBe(0);
  expect(graph.byCognitive.factual).toBe(0);
  expect(graph.byClosure.open).toBe(0);
});
