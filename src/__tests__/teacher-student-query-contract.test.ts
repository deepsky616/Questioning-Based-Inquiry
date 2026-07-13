import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appQueries = readFileSync("src/lib/app-queries.ts", "utf8");
const dashboard = readFileSync("src/app/(teacher)/teacher-dashboard/page.tsx", "utf8");
const studentManagement = readFileSync("src/app/(teacher)/teacher-students/page.tsx", "utf8");
const bulkRegister = readFileSync("src/components/teacher/StudentBulkRegisterCard.tsx", "utf8");

describe("교사 학생 조회 계약", () => {
  it("공용 캐시와 서버 보기를 명단과 활동으로 나눈다", () => {
    expect(appQueries).toContain('teacherStudentDirectory: ["teacher-students", "directory"]');
    expect(appQueries).toContain('teacherStudentActivity: (today: string) =>');
    expect(appQueries).toContain('fetch("/api/teacher/students?view=directory")');
    expect(appQueries).toContain('view: "activity", today');
    expect(appQueries).toContain("totalPoints: number");
    expect(appQueries).toContain("refetchInterval: visibleReportRefetchInterval");
  });

  it("대시보드와 학생 관리는 명단과 활동을 따로 받고 학생 식별값으로 합친다", () => {
    for (const source of [dashboard, studentManagement]) {
      expect(source).toContain("useTeacherStudentDirectory");
      expect(source).toContain("useTeacherStudentActivity");
      expect(source).toContain("mergeTeacherStudentActivity");
    }
    expect(dashboard).toContain("refetchInterval: visibleReportRefetchInterval");
    expect(studentManagement).toMatch(
      /teacherStudentDirectoryQuery\.isError\s*\|\|\s*teacherStudentActivityQuery\.isError/,
    );
  });

  it("일괄 등록에 성공하면 학생 조회 캐시 전체를 새로 읽는다", () => {
    expect(bulkRegister).toContain("useQueryClient");
    expect(bulkRegister).toContain("appQueryKeys.teacherStudents");
    expect(bulkRegister).toContain("invalidateQueries");
  });
});
