import { describe, expect, it } from "vitest";
import { buildTargetLabel, buildClassSelectionLabel } from "@/lib/session-targeting";

/**
 * 수업세션 대상 라벨 국제화 — 하드코딩 한국어 대신 번역 키를 사용한다.
 * buildTargetLabel은 sessions, buildClassSelectionLabel은 targetSelector
 * 네임스페이스의 번역 함수를 주입받는다.
 */

function fakeT(calls: Array<{ key: string; values?: Record<string, unknown> }>) {
  return (key: string, values?: Record<string, string | number>) => {
    calls.push({ key, values });
    return values ? `${key}:${JSON.stringify(values)}` : key;
  };
}

describe("buildTargetLabel", () => {
  it("학급 대상은 targetClass 키에 학년·반 값을 채운다", () => {
    const calls: Array<{ key: string }> = [];
    const label = buildTargetLabel(fakeT(calls), {
      targetType: "CLASS",
      targetGrade: "6",
      targetClassName: "1",
    });
    expect(label).toBe('targetClass:{"grade":"6","className":"1"}');
  });

  it("이름 있는 개별 학생은 targetStudentNamed 키를 쓴다", () => {
    const calls: Array<{ key: string }> = [];
    buildTargetLabel(fakeT(calls), { targetType: "STUDENT", targetStudentName: "김학생" });
    expect(calls[0].key).toBe("targetStudentNamed");
  });

  it("이름 없는 개별 학생은 targetStudentSingle 키를 쓴다", () => {
    const calls: Array<{ key: string }> = [];
    buildTargetLabel(fakeT(calls), { targetType: "STUDENT" });
    expect(calls[0].key).toBe("targetStudentSingle");
  });

  it("일부 학생 대상은 targetClassPartial 키를 쓴다", () => {
    const calls: Array<{ key: string }> = [];
    buildTargetLabel(fakeT(calls), {
      targetType: "CUSTOM",
      targetGrade: "6",
      targetClassName: "1",
    });
    expect(calls[0].key).toBe("targetClassPartial");
  });

  it("그 외에는 전체 담당 학급 키를 쓴다", () => {
    const calls: Array<{ key: string }> = [];
    buildTargetLabel(fakeT(calls), { targetType: "ALL" });
    expect(calls[0].key).toBe("targetAllClasses");
  });
});

describe("buildClassSelectionLabel", () => {
  const students = [
    { id: "s1", name: "가", grade: "6", className: "1", studentNumber: "1" },
    { id: "s2", name: "나", grade: "6", className: "1", studentNumber: "2" },
    { id: "s3", name: "다", grade: "6", className: "2", studentNumber: "1" },
  ];

  it("전체 선택은 allClassesCount 키에 전체 수를 채운다", () => {
    const calls: Array<{ key: string; values?: Record<string, unknown> }> = [];
    buildClassSelectionLabel(fakeT(calls), {
      targetClassValue: "all",
      selectedStudentIds: [],
      students,
    });
    expect(calls[0]).toEqual({ key: "allClassesCount", values: { selected: 3, total: 3 } });
  });

  it("학급 선택은 classCount 키에 학년·반·선택/전체 수를 채운다", () => {
    const calls: Array<{ key: string; values?: Record<string, unknown> }> = [];
    buildClassSelectionLabel(fakeT(calls), {
      targetClassValue: "class:6:1",
      selectedStudentIds: ["s1"],
      students,
    });
    expect(calls[0]).toEqual({
      key: "classCount",
      values: { grade: "6", className: "1", selected: 1, total: 2 },
    });
  });
});
