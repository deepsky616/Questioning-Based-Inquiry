import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import {
  buildDemoClassInquiryQuestions,
  buildDemoLearningActivityPlans,
  DEMO_SESSION_BLUEPRINTS,
  DEMO_UNIT_DESIGN_BLUEPRINTS,
  STUDENT_NAMES,
} from "../../scripts/seed-usb-demo.mjs";

describe("USB 시연 학급 자료 생성 명령", () => {
  it("4학년 1반 학생 28명을 고정된 순서로 제공한다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");
    const namesMatch = source.match(
      /export const STUDENT_NAMES = \[(?<names>[\s\S]*?)\];/,
    );
    expect(namesMatch?.groups?.names).toBeTruthy();

    const names = [...(namesMatch?.groups?.names.matchAll(/"([^"]+)"/g) ?? [])]
      .map((match) => match[1]);

    expect(names).toHaveLength(28);
    expect(names[0]).toBe("김질문");
    expect(names[27]).toBe("고서아");
  });

  it("시연 사용자 범위만 초기화하고 반복 실행할 수 있다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");

    expect(source).toContain("isDemo: true");
    expect(source).toContain("isDemo: false");
    expect(source).toContain("deleteMany");
    expect(source).toContain('id: "usb-demo-teacher"');
    expect(source).toContain("`usb-demo-student-${pad(number)}`");
    expect(source).not.toContain("aiApiKey:");
  });

  it("질문수업, 탐구 자료, 질문, 답변, 연습과 세 방식 놀이 기록을 만든다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");

    expect(source).toContain("questionSession.create");
    expect(source).toContain("unitDesign.create");
    expect(source).toContain("question.create");
    expect(source).toContain("comment.create");
    expect(source).toContain("practiceAttempt.create");
    expect(source).toContain('"SOLO"');
    expect(source).toContain('"AI"');
    expect(source).toContain("`room:usb-demo:${pad(number)}`");
  });

  it("질문수업 여섯 개와 풍부한 학생 참여 자료를 중복 없이 계획한다", () => {
    const studentIds = STUDENT_NAMES.map(
      (_, index) => `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
    );
    const plans = buildDemoLearningActivityPlans(studentIds);

    expect(DEMO_SESSION_BLUEPRINTS).toHaveLength(6);
    expect(new Set(DEMO_SESSION_BLUEPRINTS.map(({ id }) => id)).size).toBe(6);
    expect(plans.questions.filter(({ authorId }) => authorId === studentIds[0]))
      .toHaveLength(11);
    expect(plans.comments.filter(({ authorId }) => authorId === studentIds[0]))
      .toHaveLength(12);
    expect(plans.likes.filter(({ userId }) => userId === studentIds[0]))
      .toHaveLength(18);

    for (const studentId of studentIds.slice(1)) {
      expect(plans.questions.filter(({ authorId }) => authorId === studentId).length)
        .toBeGreaterThanOrEqual(3);
      expect(plans.comments.filter(({ authorId }) => authorId === studentId))
        .toHaveLength(3);
      expect(plans.likes.filter(({ userId }) => userId === studentId))
        .toHaveLength(5);
    }

    expect(
      new Set(plans.likes.map(({ questionId, userId }) => `${questionId}:${userId}`))
        .size,
    ).toBe(plans.likes.length);
    const kimQuestionIds = new Set(
      plans.questions
        .filter(({ authorId }) => authorId === studentIds[0])
        .map(({ id }) => id),
    );
    expect(
      plans.comments.filter(({ questionId }) => kimQuestionIds.has(questionId)).length,
    ).toBeGreaterThanOrEqual(27);
    expect(
      plans.likes.filter(({ questionId }) => kimQuestionIds.has(questionId)).length,
    ).toBeGreaterThanOrEqual(27);

    const questionById = new Map(
      plans.questions.map((question) => [question.id, question]),
    );
    expect(plans.analyses).toHaveLength(5);
    for (const analysis of plans.analyses) {
      expect(analysis.studentId).toBe(studentIds[0]);
      expect(analysis.result.summary).not.toBe("");
      expect(analysis.result.growthInsights).not.toBe("");
      expect(analysis.result.rewriteExample).not.toBe("");
      expect(analysis.result.totalQuestions).toBeGreaterThan(0);
      expect(analysis.result.totalQuestions).toBe(
        plans.questions.filter(({ authorId, sessionId }) => (
          authorId === studentIds[0] && sessionId === analysis.sessionId
        )).length,
      );
      expect(analysis.result.totalComments).toBe(
        plans.comments.filter(({ authorId, questionId }) => (
          authorId === studentIds[0]
          && questionById.get(questionId)?.sessionId === analysis.sessionId
        )).length,
      );
      expect(analysis.result.totalLikes).toBe(
        plans.likes.filter(({ userId, questionId }) => (
          userId === studentIds[0]
          && questionById.get(questionId)?.sessionId === analysis.sessionId
        )).length,
      );
    }
  });

  it("모든 질문수업에 4학년 수준의 완전한 탐구 참고자료를 연결한다", () => {
    expect(DEMO_UNIT_DESIGN_BLUEPRINTS).toHaveLength(6);
    const designById = new Map(
      DEMO_UNIT_DESIGN_BLUEPRINTS.map((design) => [design.id, design]),
    );

    for (const session of DEMO_SESSION_BLUEPRINTS) {
      expect(session.unitDesignId).toBeTruthy();
      const design = designById.get(session.unitDesignId);
      expect(design).toBeDefined();
      expect(design?.grade).toBe("4");
      expect(design?.title.trim()).not.toBe("");
      expect(design?.coreIdea.trim()).not.toBe("");
      expect(design?.coreSentences.length).toBeGreaterThan(0);
      expect(design?.essentialQuestions.length).toBeGreaterThan(0);
      expect(design?.inquiryQuestions.map(({ type }) => type).sort()).toEqual(
        ["conceptual", "controversial", "factual"],
      );
      expect(design?.learningGuides.coreSentences).toHaveLength(
        design?.coreSentences.length,
      );
      expect(design?.learningGuides.essentialQuestions).toHaveLength(
        design?.essentialQuestions.length,
      );
      expect(
        design?.inquiryQuestions.every(({ studentGuide }) => (
          Boolean(studentGuide?.meaning)
          && Boolean(studentGuide?.thinkingStart)
          && (studentGuide?.keywords.length ?? 0) >= 2
        )),
      ).toBe(true);
    }
  });

  it("학생 질문을 묶고 수업 흐름에 맞춘 수업 탐구 질문을 참고자료에 배포한다", () => {
    const studentIds = STUDENT_NAMES.map(
      (_, index) => `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
    );
    const activityPlans = buildDemoLearningActivityPlans(studentIds);
    const designById = new Map(
      DEMO_UNIT_DESIGN_BLUEPRINTS.map((design) => [design.id, design]),
    );

    for (const session of DEMO_SESSION_BLUEPRINTS) {
      const design = designById.get(session.unitDesignId);
      expect(design).toBeDefined();
      const sharedQuestions = buildDemoClassInquiryQuestions(
        design!,
        session.id,
        activityPlans.questions,
      );

      expect(sharedQuestions.map(({ priority }) => priority)).toEqual([1, 2, 3]);
      expect(sharedQuestions.map(({ contentGroup }) => contentGroup)).toEqual([
        "사실 확인",
        "관계와 까닭",
        "판단과 토론",
      ]);
      expect(sharedQuestions.every(({ source }) => source === "student")).toBe(true);
      expect(
        sharedQuestions.every(({ mergedFrom }) => (mergedFrom?.length ?? 0) > 0),
      ).toBe(true);
    }
  });

  it("꾸러미 명령을 패키지 명령으로 제공한다", () => {
    expect(packageJson.scripts["demo:seed"]).toBe(
      "node scripts/seed-usb-demo.mjs",
    );
  });
});
