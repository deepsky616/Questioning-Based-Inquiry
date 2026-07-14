import { describe, expect, it } from "vitest";
import {
  buildPracticeDiagnostic,
  collectCustomPracticeItemIds,
  practiceSelectionForRecommendation,
  type PracticeAttemptInput,
  type PracticeCustomItemType,
  type PracticeFocus,
  type PracticeRecommendation,
} from "@/lib/practice-diagnostics";
import { PRACTICE_QUIZ_BANK } from "@/lib/question-practice-data";

const attempt = (overrides: Partial<PracticeAttemptInput> = {}): PracticeAttemptInput => ({
  id: "base",
  studentId: "s1",
  mode: "quiz",
  itemId: "q01",
  quizType: "closure",
  correct: true,
  createdAt: new Date("2026-07-13T01:00:00Z"),
  ...overrides,
});

const focusItems: Record<PracticeFocus, { itemId: string; quizType: "closure" | "cognitive" }> = {
  closed: { itemId: "q01", quizType: "closure" },
  open: { itemId: "q11", quizType: "closure" },
  factual: { itemId: "q01", quizType: "cognitive" },
  conceptual: { itemId: "q10", quizType: "cognitive" },
  controversial: { itemId: "q19", quizType: "cognitive" },
};

const focusOrder: PracticeFocus[] = ["closed", "open", "factual", "conceptual", "controversial"];

function attemptsForFocus(focus: PracticeFocus, answers: boolean[]): PracticeAttemptInput[] {
  const item = focusItems[focus];
  return answers.map((correct, index) =>
    attempt({
      id: `${focus}-${index}`,
      ...item,
      correct,
      createdAt: new Date(`2026-07-${String(index + 1).padStart(2, "0")}T01:00:00Z`),
    }),
  );
}

function attemptsForAllTypes(
  answers: (focus: PracticeFocus) => boolean[],
): PracticeAttemptInput[] {
  return focusOrder.flatMap((focus) => attemptsForFocus(focus, answers(focus)));
}

describe("연습 진단 집계", () => {
  it("퀴즈 정오는 실제로 물은 축 하나에만 반영한다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "a1", quizType: "closure", correct: false }),
      attempt({
        id: "a2",
        quizType: "cognitive",
        correct: true,
        createdAt: new Date("2026-07-13T02:00:00Z"),
      }),
    ]);

    expect(result.types.closed).toEqual({ attempts: 1, correct: 0, accuracy: 0 });
    expect(result.types.factual).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.types.open.attempts).toBe(0);
    expect(result.types.conceptual.attempts).toBe(0);
    expect(result.types.controversial.attempts).toBe(0);
    expect(result.unknownTypeAttempts).toBe(0);
  });

  it("같은 서울 날짜의 같은 문항과 축은 가장 최근 결과만 진단한다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "old", correct: false, createdAt: new Date("2026-07-13T00:00:00Z") }),
      attempt({ id: "new", correct: true, createdAt: new Date("2026-07-13T03:00:00Z") }),
    ]);

    expect(result.activityAttempts).toBe(2);
    expect(result.diagnosticAttempts).toBe(1);
    expect(result.overall).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
  });

  it("서울 자정이 지나면 같은 문항과 축도 별도 진단 시도로 센다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "before", createdAt: new Date("2026-07-13T14:59:59Z") }),
      attempt({ id: "after", createdAt: new Date("2026-07-13T15:00:00Z") }),
    ]);

    expect(result.diagnosticAttempts).toBe(2);
  });

  it("학생, 원래 모드, 문항, 퀴즈 축이 다르면 중복으로 합치지 않는다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "quiz-closure" }),
      attempt({ id: "other-student", studentId: "s2" }),
      attempt({ id: "quiz-cognitive", quizType: "cognitive" }),
      attempt({ id: "other-item", itemId: "q02" }),
      attempt({ id: "other-mode", mode: "transform", quizType: null }),
    ]);

    expect(result.diagnosticAttempts).toBe(5);
  });

  it("교사 문항과 식별값 없는 인공지능 문항은 전체와 모드에만 반영한다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "custom", itemId: "teacher-item", correct: true }),
      attempt({
        id: "ai-old",
        mode: "transform-ai",
        itemId: null,
        quizType: null,
        correct: false,
        createdAt: new Date("2026-07-13T01:00:00Z"),
      }),
      attempt({
        id: "ai-new",
        mode: "transform-ai",
        itemId: null,
        quizType: null,
        correct: true,
        createdAt: new Date("2026-07-13T02:00:00Z"),
      }),
      attempt({ id: "create-ai", mode: "create-ai", itemId: null, quizType: null, correct: false }),
      attempt({ id: "transform", mode: "transform", itemId: "t03", quizType: null, correct: true }),
      attempt({ id: "create", mode: "create", itemId: "c01", quizType: null, correct: true }),
    ]);

    expect(result.activityAttempts).toBe(6);
    expect(result.diagnosticAttempts).toBe(5);
    expect(result.overall).toEqual({ attempts: 5, correct: 4, accuracy: 80 });
    expect(result.modes).toEqual({
      quiz: { attempts: 1, correct: 1, accuracy: 100 },
      transform: { attempts: 2, correct: 2, accuracy: 100 },
      create: { attempts: 2, correct: 1, accuracy: 50 },
    });
    expect(result.types.conceptual).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.unknownTypeAttempts).toBe(4);
  });

  it("교사 커스텀 문항은 유형 정보를 넘기면 유형 정답률에 반영한다", () => {
    const customTypes = new Map<string, PracticeCustomItemType>([
      ["cust-quiz", { closure: "open", cognitive: "controversial", target: null }],
      ["cust-transform", { closure: null, cognitive: null, target: "conceptual" }],
      ["cust-broken", { closure: "??", cognitive: null, target: null }],
    ]);
    const result = buildPracticeDiagnostic(
      [
        attempt({ id: "c1", itemId: "cust-quiz", quizType: "closure", correct: true }),
        attempt({ id: "c2", itemId: "cust-quiz", quizType: "cognitive", correct: false }),
        attempt({
          id: "c3",
          mode: "transform",
          itemId: "cust-transform",
          quizType: null,
          correct: true,
          createdAt: new Date("2026-07-13T02:00:00Z"),
        }),
        // 알 수 없는 유형 값은 조용히 유형 미상으로 남긴다
        attempt({ id: "c4", itemId: "cust-broken", quizType: "closure", correct: true, createdAt: new Date("2026-07-13T03:00:00Z") }),
      ],
      customTypes,
    );

    expect(result.types.open).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.types.controversial).toEqual({ attempts: 1, correct: 0, accuracy: 0 });
    expect(result.types.conceptual).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.unknownTypeAttempts).toBe(1);
  });

  it("내장 은행에 없는 시도 문항 id만 커스텀 조회 대상으로 모은다", () => {
    const ids = collectCustomPracticeItemIds([
      attempt({ id: "b1", itemId: "q01" }), // 내장 퀴즈
      attempt({ id: "b2", mode: "transform", itemId: "t01", quizType: null }), // 내장 바꾸기
      attempt({ id: "c1", itemId: "cust-quiz" }),
      attempt({ id: "c2", itemId: "cust-quiz" }), // 중복 제거
      attempt({ id: "c3", mode: "transform", itemId: "cust-transform", quizType: null }),
      attempt({ id: "ai", mode: "transform-ai", itemId: null, quizType: null }), // id 없음
      attempt({ id: "cr", mode: "create", itemId: "cust-topic", quizType: null }), // 만들기는 유형 매핑 없음
    ]);

    expect(ids.sort()).toEqual(["cust-quiz", "cust-transform"]);
  });

  it("바꾸기는 내장 문항의 목표 유형 하나에만 반영한다", () => {
    const result = buildPracticeDiagnostic([
      attempt({ id: "open", mode: "transform", itemId: "t01", quizType: null }),
      attempt({ id: "conceptual", mode: "transform", itemId: "t03", quizType: null }),
      attempt({ id: "controversial", mode: "transform", itemId: "t07", quizType: null, correct: false }),
    ]);

    expect(result.types.open).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.types.conceptual).toEqual({ attempts: 1, correct: 1, accuracy: 100 });
    expect(result.types.controversial).toEqual({ attempts: 1, correct: 0, accuracy: 0 });
    expect(result.types.closed.attempts).toBe(0);
    expect(result.types.factual.attempts).toBe(0);
  });

  it("빈 자료와 시도 없는 지표의 정답률은 null이다", () => {
    const result = buildPracticeDiagnostic([]);

    expect(result.activityAttempts).toBe(0);
    expect(result.diagnosticAttempts).toBe(0);
    expect(result.overall).toEqual({ attempts: 0, correct: 0, accuracy: null });
    expect(result.modes.quiz.accuracy).toBeNull();
    expect(result.types.closed.accuracy).toBeNull();
    expect(result.recommendation).toEqual({
      kind: "collect",
      tab: "quiz",
      quizMode: "cognitive",
      focus: null,
    });
  });

  it("집계하면서 입력 배열의 순서를 바꾸지 않는다", () => {
    const input = [
      attempt({ id: "old", createdAt: new Date("2026-07-01T00:00:00Z") }),
      attempt({ id: "new", createdAt: new Date("2026-07-02T00:00:00Z") }),
    ];

    buildPracticeDiagnostic(input);

    expect(input.map(({ id }) => id)).toEqual(["old", "new"]);
  });
});

describe("연습 추천", () => {
  it("어느 유형도 세 번에 이르지 않으면 유형을 고정하지 않고 자료를 모은다", () => {
    const result = buildPracticeDiagnostic(attemptsForAllTypes(() => [true, false]));

    expect(result.recommendation.kind).toBe("collect");
  });

  it("한 유형이 세 번에 이른 뒤에는 고정 순서상 첫 부족 유형의 자료를 채운다", () => {
    const result = buildPracticeDiagnostic(attemptsForFocus("closed", [true, true, true]));

    expect(result.recommendation).toEqual({
      kind: "focus",
      tab: "quiz",
      quizMode: "closure",
      focus: "open",
    });
  });

  it.each(focusOrder)("%s 유형의 정답률이 가장 낮으면 그 유형을 추천한다", (weakFocus) => {
    const result = buildPracticeDiagnostic(
      attemptsForAllTypes((focus) => (focus === weakFocus ? [false, false, false] : [true, true, true])),
    );

    expect(result.recommendation).toEqual({
      kind: "focus",
      tab: "quiz",
      quizMode: weakFocus === "closed" || weakFocus === "open" ? "closure" : "cognitive",
      focus: weakFocus,
    });
  });

  it("같은 정답률이면 더 최근 오답이 있는 유형을 먼저 추천한다", () => {
    const result = buildPracticeDiagnostic(
      attemptsForAllTypes((focus) => {
        if (focus === "closed") return [false, true, true];
        if (focus === "open") return [true, true, false];
        return [true, true, true];
      }),
    );

    expect(result.recommendation).toMatchObject({ kind: "focus", focus: "open" });
  });

  it("정답률과 최근 오답 시각도 같으면 닫힌 질문부터 정한 고정 순서를 따른다", () => {
    const result = buildPracticeDiagnostic(
      attemptsForAllTypes((focus) =>
        focus === "closed" || focus === "open" ? [true, false, true] : [true, true, true],
      ),
    );

    expect(result.recommendation).toMatchObject({ kind: "focus", focus: "closed" });
  });

  it("다섯 유형이 정확히 팔십 퍼센트이면 질문 바꾸기로 나아간다", () => {
    const result = buildPracticeDiagnostic(attemptsForAllTypes(() => [true, true, true, true, false]));

    expect(result.recommendation).toEqual({
      kind: "advance",
      tab: "transform",
      quizMode: null,
      focus: null,
    });
  });

  it("표시 정답률이 팔십으로 반올림되어도 실제 비율이 낮으면 나아가지 않는다", () => {
    const closedItems = PRACTICE_QUIZ_BANK.filter((item) => item.closure === "closed").slice(0, 22);
    const closedAttempts = closedItems
      .flatMap((item) =>
        [1, 2].map((day) =>
          attempt({
            id: `${item.id}-${day}`,
            itemId: item.id,
            createdAt: new Date(`2026-07-${String(day).padStart(2, "0")}T01:00:00Z`),
          }),
        ),
      )
      .map((item, index) => ({ ...item, correct: index < 35 }));
    const otherAttempts = focusOrder
      .filter((focus) => focus !== "closed")
      .flatMap((focus) => attemptsForFocus(focus, [true, true, true]));

    expect(closedAttempts).toHaveLength(44);
    const result = buildPracticeDiagnostic([...closedAttempts, ...otherAttempts]);

    expect(result.types.closed.accuracy).toBe(80);
    expect(result.recommendation).toMatchObject({ kind: "focus", focus: "closed" });
  });

  it("하나라도 팔십 퍼센트보다 낮으면 그 유형을 계속 추천한다", () => {
    const result = buildPracticeDiagnostic(
      attemptsForAllTypes((focus) =>
        focus === "closed" ? [true, true, true, false] : [true, true, true, true, false],
      ),
    );

    expect(result.recommendation).toMatchObject({ kind: "focus", focus: "closed" });
  });
});

describe("추천 이동", () => {
  const cases: Array<[string, PracticeRecommendation, ReturnType<typeof practiceSelectionForRecommendation>]> = [
    [
      "자료 모으기",
      { kind: "collect", tab: "quiz", quizMode: "cognitive", focus: null },
      { tab: "quiz", quizMode: "cognitive", focus: null },
    ],
    ...focusOrder.map((focus): [string, PracticeRecommendation, ReturnType<typeof practiceSelectionForRecommendation>] => [
      focus,
      {
        kind: "focus",
        tab: "quiz",
        quizMode: focus === "closed" || focus === "open" ? "closure" : "cognitive",
        focus,
      },
      {
        tab: "quiz",
        quizMode: focus === "closed" || focus === "open" ? "closure" : "cognitive",
        focus,
      },
    ]),
    [
      "전체 숙달",
      { kind: "advance", tab: "transform", quizMode: null, focus: null },
      { tab: "transform", quizMode: "cognitive", focus: null },
    ],
  ];

  it.each(cases)("%s 추천을 허용된 연습 선택으로 바꾼다", (_name, recommendation, expected) => {
    expect(practiceSelectionForRecommendation(recommendation)).toEqual(expected);
  });
});
