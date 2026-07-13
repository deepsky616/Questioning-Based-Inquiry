import { describe, expect, it } from "vitest";
import { aggregateTeacherStats } from "@/lib/teacher-stats-aggregate";

describe("교사 대시보드 통계 집계", () => {
  it("전체와 학생별 통계를 한 번의 질문 순회로 함께 만든다", () => {
    const source = [
      {
        createdAt: new Date("2026-06-20T09:00:00.000Z"),
        closure: "open",
        cognitive: "conceptual",
        author: {
          id: "student-1",
          name: "첫번째 학생",
          grade: "5",
          className: "1",
          studentNumber: "2",
        },
      },
      {
        createdAt: new Date("2026-06-05T09:00:00.000Z"),
        closure: "closed",
        cognitive: "legacy-type",
        author: {
          id: "student-2",
          name: "두번째 학생",
          grade: "5",
          className: "2",
          studentNumber: "10",
        },
      },
      {
        createdAt: new Date("2026-06-21T09:00:00.000Z"),
        closure: "open",
        cognitive: "controversial",
        author: {
          id: "student-2",
          name: "두번째 학생",
          grade: "5",
          className: "2",
          studentNumber: "10",
        },
      },
    ];
    let traversals = 0;
    const questions = new Proxy(source, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return function* iterator() {
            traversals += 1;
            yield* target;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const result = aggregateTeacherStats(
      questions,
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z"),
    );

    expect(traversals).toBe(1);
    expect(result.total).toBe(3);
    expect(result.byClosure).toEqual({ closed: 1, open: 2 });
    expect(result.byCognitive).toEqual({ factual: 1, conceptual: 1, controversial: 1 });
    expect(result.timeline).toEqual([
      { date: "2026-06-05", count: 1 },
      { date: "2026-06-20", count: 1 },
      { date: "2026-06-21", count: 1 },
    ]);

    expect(result.byStudent.map((student) => student.studentId)).toEqual([
      "student-1",
      "student-2",
    ]);
    expect(result.byStudent[0]).toMatchObject({
      total: 1,
      distribution: { closed: 0, open: 1 },
      cognitiveDistribution: { factual: 0, conceptual: 1, controversial: 0 },
      trend: null,
      sparkline: [0, 0, 0, 1, 0, 0],
    });
    expect(result.byStudent[1]).toMatchObject({
      total: 2,
      distribution: { closed: 1, open: 1 },
      cognitiveDistribution: { factual: 1, conceptual: 0, controversial: 1 },
      trend: 0,
      sparkline: [1, 0, 0, 0, 1, 0],
    });
  });

  it("질문이 없으면 기존 빈 응답 모양을 만든다", () => {
    expect(
      aggregateTeacherStats(
        [],
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-07-01T00:00:00.000Z"),
      ),
    ).toEqual({
      total: 0,
      byClosure: { closed: 0, open: 0 },
      byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
      byStudent: [],
      timeline: [],
    });
  });
});
