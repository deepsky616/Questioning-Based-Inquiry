import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hideStudentReportAnalysisModels } from "@/lib/student-report-visibility";

const reportViewSource = readFileSync(
  "src/components/reports/ReportView.tsx",
  "utf8",
);
const studentReportSource = readFileSync(
  "src/components/reports/StudentReportView.tsx",
  "utf8",
);

describe("학생 상세리포트 분석 모델 표시", () => {
  it("학생 본인 리포트에서는 분석 모델을 숨긴다", () => {
    expect(studentReportSource).toContain("showAnalysisModel={false}");
    expect(studentReportSource).toContain(
      "hideStudentReportAnalysisModels(data.sessions)",
    );
  });

  it("공용 리포트는 분석 모델 표시 설정을 적용한다", () => {
    expect(reportViewSource).toContain("showAnalysisModel = true");
    expect(reportViewSource).toContain(
      "showAnalysisModel && rv.analysisModel",
    );
  });

  it("기존 질문수업 분석에서도 모델 항목을 제거한다", () => {
    const sessions = [
      {
        id: "session-1",
        date: "2026-07-28",
        subject: "과학",
        topic: "식물의 생활",
        analysis: {
          summary: "질문을 구체적으로 잘 만들었어요.",
          analysisModel: "gemini-2.5-flash",
        },
      },
    ];

    const result = hideStudentReportAnalysisModels(sessions);

    expect(result?.[0].analysis).toEqual({
      summary: "질문을 구체적으로 잘 만들었어요.",
    });
    expect(sessions[0].analysis.analysisModel).toBe("gemini-2.5-flash");
  });
});
