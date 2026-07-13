import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildQuestionActivityScopeHref,
  readQuestionActivityScope,
} from "@/lib/teacher-student-question-activity-scope";

function paramsFromHref(href: string) {
  return new URLSearchParams(href.split("?")[1] ?? "");
}

const teacherStudentsPage = readFileSync(
  "src/app/(teacher)/teacher-students/page.tsx",
  "utf8",
);

describe.each(["attention", "noQuestions"])("%s 학급 범위", (filter) => {
  it("특정 학급에서 전체 학급으로 바꾸면 주소와 통계 범위를 함께 초기화한다", () => {
    const initialParams = new URLSearchParams(
      `filter=${filter}&period=month&grade=5&className=2`,
    );

    const href = buildQuestionActivityScopeHref(initialParams, null);
    const nextParams = paramsFromHref(href);
    const scope = readQuestionActivityScope(nextParams);

    expect(href).toBe(`/teacher-students?filter=${filter}&period=month`);
    expect(scope.filterClass).toBe("all");
    expect(scope.queryKey).toEqual([
      "teacher-students-question-activity-filter",
      "month",
      null,
      null,
    ]);
    expect(scope.statsPath).toBe("/api/stats?view=student-activity&period=month");
  });

  it("특정 학급에서 다른 학급으로 바꾸면 주소와 통계 범위를 함께 교체한다", () => {
    const initialParams = new URLSearchParams(
      `filter=${filter}&period=semester&grade=5&className=2`,
    );

    const href = buildQuestionActivityScopeHref(initialParams, {
      grade: "6",
      className: "1",
    });
    const nextParams = paramsFromHref(href);
    const scope = readQuestionActivityScope(nextParams);

    expect(href).toBe(
      `/teacher-students?filter=${filter}&period=semester&grade=6&className=1`,
    );
    expect(scope.filterClass).toBe("6-1");
    expect(scope.queryKey).toEqual([
      "teacher-students-question-activity-filter",
      "semester",
      "6",
      "1",
    ]);
    expect(scope.statsPath).toBe(
      "/api/stats?view=student-activity&period=semester&grade=6&className=1",
    );
  });
});

describe("교사 학생 화면 범위 연동", () => {
  it("목록 학급, 통계 조회 키와 요청 주소가 같은 주소 범위를 사용한다", () => {
    expect(teacherStudentsPage).toMatch(
      /const filterClass = questionActivityFilterOn\s*\? questionActivityScope\.filterClass\s*: localFilterClass/,
    );
    expect(teacherStudentsPage).toContain(
      "queryKey: questionActivityScope.queryKey",
    );
    expect(teacherStudentsPage).toContain(
      "fetch(questionActivityScope.statsPath)",
    );
    expect(teacherStudentsPage).toContain(
      "questionActivityStatsQuery.data?.activeStudentIds",
    );
    expect(teacherStudentsPage).toContain(
      "buildQuestionActivityScopeHref(searchParams, nextClass)",
    );
  });

  it("통계 범위를 전환하는 동안 이전 결과로 목록을 분류하지 않는다", () => {
    expect(teacherStudentsPage).toContain(
      "questionActivityFilterOn && questionActivityStatsQuery.isPending",
    );
    expect(teacherStudentsPage).toContain(
      "questionActivityStatsQuery.isSuccess &&",
    );
    expect(teacherStudentsPage).not.toContain("placeholderData:");
  });
});
