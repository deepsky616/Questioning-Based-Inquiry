import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const teacherDashboard = readFileSync(
  "src/app/(teacher)/teacher-dashboard/page.tsx",
  "utf8",
);
const studentDashboard = readFileSync(
  "src/app/(student)/student-dashboard/page.tsx",
  "utf8",
);
const studentAsk = readFileSync(
  "src/app/(student)/student-ask/page.tsx",
  "utf8",
);

describe("대시보드 오늘 날짜 갱신", () => {
  it("교사와 학생 대시보드가 자정 갱신 날짜 훅을 사용한다", () => {
    expect(teacherDashboard).toContain('import { useLocalDateKey } from "@/lib/use-local-date-key"');
    expect(teacherDashboard).toContain("const today = useLocalDateKey();");
    expect(studentDashboard).toContain('import { useLocalDateKey } from "@/lib/use-local-date-key"');
    expect(studentDashboard).toContain("const todayStr = useLocalDateKey();");
    expect(studentAsk).toContain('import { useLocalDateKey } from "@/lib/use-local-date-key"');
    expect(studentAsk).toContain("const todayStr = useLocalDateKey();");
  });
});
