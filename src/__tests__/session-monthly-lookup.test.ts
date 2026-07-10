import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const teacherQuestionSelector = readFileSync("src/app/(teacher)/teacher-questions/TeacherQuestionSessionSelector.tsx", "utf8");
const teacherSessionsPage = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const deployedDesignList = readFileSync("src/app/(teacher)/teacher-questions/DeployedDesignList.tsx", "utf8");
const pointReviewView = readFileSync("src/components/teacher/PointReviewView.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");
const studentExplore = readFileSync("src/components/student/ExploreQuestionsView.tsx", "utf8");
const studentMyQuestions = readFileSync("src/components/student/MyQuestionsView.tsx", "utf8");
const studentUnitDesign = readFileSync("src/components/student/UnitDesignView.tsx", "utf8");

describe("session monthly lookup surfaces", () => {
  it("groups teacher and student session selectors by month", () => {
    for (const source of [teacherQuestionSelector, studentExplore, studentMyQuestions]) {
      expect(source).toContain("groupSessionsByMonth");
      expect(source).toContain("SelectGroup");
      expect(source).toContain("SelectLabel");
    }
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
});
