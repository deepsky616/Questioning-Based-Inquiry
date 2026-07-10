import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const teacherQuestionSelector = readFileSync("src/app/(teacher)/teacher-questions/TeacherQuestionSessionSelector.tsx", "utf8");
const teacherSessionListControls = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx", "utf8");
const teacherSessionMonthList = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionMonthList.tsx", "utf8");
const teacherSessionsPage = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const deployedDesignList = readFileSync("src/app/(teacher)/teacher-questions/DeployedDesignList.tsx", "utf8");
const savedDesignsTab = readFileSync("src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx", "utf8");
const pointReviewView = readFileSync("src/components/teacher/PointReviewView.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");
const studentAskSelector = readFileSync("src/app/(student)/student-ask/StudentAskSessionSelector.tsx", "utf8");
const studentExplore = readFileSync("src/components/student/ExploreQuestionsView.tsx", "utf8");
const studentMyQuestions = readFileSync("src/components/student/MyQuestionsView.tsx", "utf8");
const studentUnitDesign = readFileSync("src/components/student/UnitDesignView.tsx", "utf8");
const studentMonthlyLookup = readFileSync("src/components/student/StudentMonthlySessionLookup.tsx", "utf8");

describe("session monthly lookup surfaces", () => {
  it("groups teacher and student session selectors by month", () => {
    expect(teacherQuestionSelector).toContain("groupSessionsByMonth");
    expect(teacherQuestionSelector).toContain("<select");
    expect(teacherQuestionSelector).toContain("<optgroup");
    expect(deployedDesignList).toContain("deploySessionMonthGroups");
    expect(deployedDesignList).toContain("<optgroup");

    for (const source of [studentExplore, studentMyQuestions]) {
      expect(source).toContain("StudentMonthlySessionLookup");
    }

    for (const source of [studentMonthlyLookup]) {
      expect(source).toContain("groupSessionsByMonth");
      expect(source).toContain("sessionMonthGroups.map");
      expect(source).toContain("<select");
      expect(source).toContain("<optgroup");
    }
  });

  it("groups the date lookup filters in the main session lookup tabs by month", () => {
    for (const source of [
      teacherQuestionSelector,
      teacherSessionListControls,
      deployedDesignList,
      savedDesignsTab,
      studentAskSelector,
      studentUnitDesign,
    ]) {
      expect(source).toContain("groupSessionDatesByMonth");
    }
    expect(teacherSessionListControls).toContain("<optgroup");
    expect(savedDesignsTab).toContain("savedDateMonthGroups");
    expect(savedDesignsTab).toContain("<optgroup");
    for (const source of [studentExplore, studentMyQuestions]) {
      expect(source).toContain("StudentMonthlyDateSelect");
    }
    expect(studentMonthlyLookup).toContain("<optgroup");
  });

  it("groups the point review analysis session dropdown by month", () => {
    expect(pointReviewView).toContain("groupSessionsByMonth");
    expect(pointReviewView).toContain("<optgroup");
  });

  it("groups session list surfaces by month", () => {
    for (const source of [teacherSessionsPage, deployedDesignList, reportView, studentUnitDesign]) {
      expect(source).toContain("groupSessionsByMonth");
    }
  });

  it("keeps past teacher session months collapsed by default", () => {
    expect(teacherSessionMonthList).toContain("const defaultExpanded: string[] = []");
    expect(teacherSessionMonthList).toContain("expandedKeys ? expandedKeys.has(group.key) : false");
  });
});
