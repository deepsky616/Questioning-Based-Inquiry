import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import {
  buildDemoClassInquiryQuestions,
  buildDemoLearningActivityPlans,
  buildDemoQuestionGamePointProfiles,
  DEMO_RECENT_CONTENT_POINT_PLANS,
  DEMO_SESSION_BLUEPRINTS,
  DEMO_STUDENT_POINT_TOTALS,
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
    expect(plans.classInquiryQuestions).toHaveLength(25);

    for (const studentId of studentIds.slice(1)) {
      expect(plans.questions.filter(({ authorId }) => authorId === studentId).length)
        .toBeGreaterThanOrEqual(3);
      expect(plans.comments.filter(({ authorId }) => authorId === studentId))
        .toHaveLength(4);
      expect(plans.likes.filter(({ userId }) => userId === studentId))
        .toHaveLength(6);
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
      [...plans.questions, ...plans.classInquiryQuestions]
        .map((question) => [question.id, question]),
    );
    for (const sharedQuestion of plans.classInquiryQuestions) {
      const comments = plans.comments.filter(
        ({ questionId }) => questionId === sharedQuestion.id,
      );
      const likes = plans.likes.filter(
        ({ questionId }) => questionId === sharedQuestion.id,
      );

      expect(comments).toHaveLength(2);
      expect(comments.every(({ content }) => content.length >= 20)).toBe(true);
      expect(likes.length).toBeGreaterThanOrEqual(4);
      expect(likes.length).toBeLessThanOrEqual(6);
      expect(new Set(likes.map(({ userId }) => userId)).size).toBe(likes.length);
    }
    for (const session of DEMO_SESSION_BLUEPRINTS.slice(0, 5)) {
      const count = plans.classInquiryQuestions.filter(
        ({ sessionId }) => sessionId === session.id,
      ).length;
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(7);
    }
    for (const session of DEMO_SESSION_BLUEPRINTS.slice(0, 5)) {
      const sessionSharedIds = new Set(
        plans.classInquiryQuestions
          .filter(({ sessionId }) => sessionId === session.id)
          .map(({ id }) => id),
      );
      expect(
        plans.comments.some(({ authorId, questionId }) => (
          authorId === studentIds[0] && sessionSharedIds.has(questionId)
        )),
      ).toBe(true);
      expect(
        plans.likes.some(({ userId, questionId }) => (
          userId === studentIds[0] && sessionSharedIds.has(questionId)
        )),
      ).toBe(true);
    }
    expect(plans.analyses).toHaveLength(5);
    expect(
      new Set(plans.analyses.map(({ result }) => result.summary)).size,
    ).toBe(5);
    for (const analysis of plans.analyses) {
      expect(analysis.studentId).toBe(studentIds[0]);
      expect(analysis.result.summary).toContain("질문아");
      expect(analysis.result.growthInsights).toMatch(/지난|첫 질문수업/);
      expect(analysis.result.rewriteExample).toContain("원래 질문:");
      expect(analysis.result.rewriteExample).toContain("더 좋은 질문:");
      expect(analysis.result.relevanceInsights).toContain("질문아");
      expect(analysis.result.insights).toContain("다음");
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

  it("전체 학생의 포인트와 순위를 다양하게 구성한다", () => {
    const studentIds = STUDENT_NAMES.map(
      (_, index) => `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
    );
    const profiles = buildDemoQuestionGamePointProfiles(studentIds);
    const ranked = [...profiles].sort(
      (a, b) => b.totalPoints - a.totalPoints,
    );

    expect(DEMO_STUDENT_POINT_TOTALS).toHaveLength(28);
    expect(new Set(DEMO_STUDENT_POINT_TOTALS).size).toBe(28);
    expect(Math.min(...DEMO_STUDENT_POINT_TOTALS)).toBe(13);
    expect(Math.max(...DEMO_STUDENT_POINT_TOTALS)).toBe(40);
    expect(profiles[0].totalPoints).toBe(35);
    expect(profiles[0].contentPoints).toBe(6);
    expect(profiles[0].gamePoints).toBe(29);
    expect(ranked.findIndex(({ studentId }) => studentId === studentIds[0]) + 1)
      .toBe(6);

    for (const profile of profiles) {
      const recognizedTotal = Object.values(profile.validQuestions).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(Object.values(profile.validQuestions).every(
        (count) => count >= 1 && count <= 10,
      )).toBe(true);
      expect(profile.gamePoints).toBe(10 + recognizedTotal);
      expect(profile.totalPoints).toBe(
        profile.gamePoints + profile.contentPoints,
      );
    }
  });

  it("김질문의 최근 질문과 댓글 작성 포인트를 제공한다", () => {
    const studentIds = STUDENT_NAMES.map(
      (_, index) => `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
    );
    const activityPlans = buildDemoLearningActivityPlans(studentIds);
    const kimId = studentIds[0];

    expect(DEMO_RECENT_CONTENT_POINT_PLANS).toHaveLength(4);
    expect(DEMO_RECENT_CONTENT_POINT_PLANS.map(({ bonusType }) => bonusType))
      .toEqual([
        "QUESTION_WRITE",
        "QUESTION_WRITE",
        "COMMENT_WRITE",
        "COMMENT_WRITE",
      ]);
    expect(
      DEMO_RECENT_CONTENT_POINT_PLANS.reduce(
        (sum, plan) => sum + plan.points,
        0,
      ),
    ).toBe(6);

    for (const plan of DEMO_RECENT_CONTENT_POINT_PLANS) {
      if (plan.relatedQuestionId) {
        expect(activityPlans.questions).toContainEqual(
          expect.objectContaining({
            id: plan.relatedQuestionId,
            authorId: kimId,
          }),
        );
      }
      if (plan.relatedCommentId) {
        expect(activityPlans.comments).toContainEqual(
          expect.objectContaining({
            id: plan.relatedCommentId,
            authorId: kimId,
          }),
        );
      }
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
      expect(design?.achievements.length).toBeGreaterThan(0);
      expect(design?.learningGuides.achievements).toHaveLength(
        design?.achievements.length,
      );
      expect(design?.learningGuides.achievements.every((guide, index) => (
        guide.index === index && guide.explanation.trim()
      ))).toBe(true);
      expect(design?.coreSentences.length).toBeGreaterThan(0);
      expect(design?.essentialQuestions.length).toBeGreaterThan(0);
      expect(design?.inquiryQuestions).toHaveLength(5);
      expect(
        design?.inquiryQuestions.reduce<Record<string, number>>((counts, question) => {
          counts[question.type] = (counts[question.type] ?? 0) + 1;
          return counts;
        }, {}),
      ).toEqual({
        factual: 2,
        conceptual: 2,
        controversial: 1,
      });
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

  it("학생 질문 전체를 묶고 단원 설계 흐름에 맞춘 수업 탐구 질문을 만든다", () => {
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
      const studentQuestions = activityPlans.questions.filter(
        (question) => question.sessionId === session.id,
      );
      const sharedQuestions = buildDemoClassInquiryQuestions(
        design!,
        session.id,
        activityPlans.questions,
      );

      if (studentQuestions.length === 0) {
        expect(sharedQuestions).toEqual([]);
        continue;
      }

      expect(sharedQuestions.length).toBeGreaterThanOrEqual(4);
      expect(sharedQuestions.length).toBeLessThanOrEqual(7);
      expect(sharedQuestions).toHaveLength(
        new Set(studentQuestions.map(({ content }) => content)).size,
      );
      expect(sharedQuestions.map(({ priority }) => priority)).toEqual(
        sharedQuestions.map((_, index) => index + 1),
      );
      const flowOrder = new Map([
        ["사실 확인", 0],
        ["관계와 까닭", 1],
        ["판단과 토론", 2],
      ]);
      const contentGroupOrder = sharedQuestions.map(
        ({ contentGroup }) => flowOrder.get(contentGroup),
      );
      expect(contentGroupOrder.every((order) => order !== undefined)).toBe(true);
      expect(contentGroupOrder).toEqual(
        [...contentGroupOrder].sort((a, b) => a! - b!),
      );
      expect(
        sharedQuestions.every(({ content }) => (
          studentQuestions.some((question) => question.content === content)
        )),
      ).toBe(true);
      expect(sharedQuestions.every(({ source }) => source === "student")).toBe(true);
      expect(
        sharedQuestions.every(({ flowId }) => flowId === "cognitive-development"),
      ).toBe(true);
      expect(
        sharedQuestions.every(({ flowTitle }) => flowTitle === "인지적 발달 흐름"),
      ).toBe(true);
      expect(
        sharedQuestions.every(({ lessonPhase, rationale }) => (
          Boolean(lessonPhase) && Boolean(rationale)
        )),
      ).toBe(true);
      expect(
        sharedQuestions.every(({ mergedFrom }) => (mergedFrom?.length ?? 0) > 0),
      ).toBe(true);
      expect(
        sharedQuestions.flatMap(({ mergedFrom }) => mergedFrom ?? []).sort(),
      ).toEqual(studentQuestions.map(({ content }) => content).sort());
    }
  });

  it("꾸러미 명령을 패키지 명령으로 제공한다", () => {
    expect(packageJson.scripts["demo:seed"]).toBe(
      "node scripts/seed-usb-demo.mjs",
    );
  });
});
