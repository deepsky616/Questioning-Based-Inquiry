import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx",
  "utf8",
);

describe("저장된 설계 학생용 설명 무결성", () => {
  it("새 설계와 같은 원문 서명과 완전성 검사를 사용한다", () => {
    expect(source).toContain("buildStudentGuideSourceSignature");
    expect(source).toContain("validateStudentGuideBundle");
    expect(source).toContain("editGuideSourceSignature");
    expect(source).toContain("hasFreshEditStudentGuides");
  });

  it("설명 생성에 저장된 핵심 낱말을 포함하고 늦게 도착한 이전 결과를 버린다", () => {
    const generate = source.slice(
      source.indexOf("const generateEditStudentGuides"),
      source.indexOf("const saveEditDesign"),
    );

    expect(generate).toContain("selectedKeywords: design.selectedKeywords ?? []");
    expect(generate).toContain("latestEditGuideSourceSignatureRef.current !== requestSourceSignature");
    expect(generate).toContain("validateStudentGuideBundle(data, expected)");
  });

  it("현재 원문과 맞는 완전한 설명만 수정 요청에 포함한다", () => {
    const patchDesign = source.slice(
      source.indexOf("const patchEditDesign"),
      source.indexOf("const generateEditStudentGuides"),
    );

    expect(patchDesign).toContain("hasFreshEditStudentGuides");
    expect(patchDesign).toContain("learningGuides: hasFreshEditStudentGuides");
    expect(patchDesign).toContain(": null,");
    expect(patchDesign).toContain("...(hasFreshEditStudentGuides && studentGuide ? { studentGuide } : {})");
  });

  it("불완전하거나 오래된 설명을 제외하기 전에 저장과 수업 만들기 모두 확인한다", () => {
    const omissionGate = source.slice(
      source.indexOf("const confirmEditStudentGuideOmission"),
      source.indexOf("const saveEditDesign"),
    );
    const saveEdit = source.slice(
      source.indexOf("const saveEditDesign"),
      source.indexOf("const createQuestionClassFromDesign"),
    );
    const createStart = source.indexOf("const createQuestionClassFromDesign");
    const createClass = source.slice(createStart, source.indexOf("\n  return (", createStart));

    expect(omissionGate).toContain("hasIncompleteEditStudentGuides || hasStaleEditStudentGuides");
    expect(saveEdit).toContain("if (!(await confirmEditStudentGuideOmission())) return");
    expect(createClass).toContain("if (!(await confirmEditStudentGuideOmission())) return");
  });

  it("다시 만든 뒤 저장된 설계의 직전 설명도 한 번 복원할 수 있다", () => {
    expect(source).toContain("previousEditStudentGuides");
    expect(source).toContain("restorePreviousEditStudentGuides");
    expect(source).toContain('t("studentGuideRestorePrevious")');
    expect(source).toContain("latestEditLearningGuidesRef.current");
    expect(source).toContain("latestEditQuestionsRef.current");
  });

  it("설명을 만드는 동안 저장과 새 수업 만들기를 잠근다", () => {
    expect(source).toContain("disabled={savingEdit || generatingGuides || !editTitle.trim()}");
    expect(source).toContain("disabled={savingEdit || generatingGuides || !editTitle.trim() || !editDate}");
  });
});
