import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as pointsPolicy from "@/lib/points-policy";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("질문수업 사용자 용어", () => {
  it("한국어 번역에서 옛 수업세션 표현을 제거하고 대표 이름을 유지한다", () => {
    const source = read("messages/ko.json");
    const messages = JSON.parse(source);

    expect(source).not.toMatch(/수업\s?세션/);
    expect(messages.nav.sessions).toBe("질문수업");
    expect(messages.pages.teacherSessions.title).toBe("질문수업");
    expect(messages.ask.pastSessionsLabel).toBe("지난 수업");
    expect(messages.pointReview.noSessionGroup).toBe("수업 정보 없음");
    expect(messages.sessions.deleteConfirm).toContain("수업 미지정 상태");
    expect(messages.report.docNoAnalysis).toBe("분석된 수업이 없습니다.");
    expect(messages.seqEditor.emptyNoQuestions).toContain("이 수업의 학생 질문");
  });

  it("영어 번역도 질문수업 의미를 같은 문맥으로 전달한다", () => {
    const messages = JSON.parse(read("messages/en.json"));

    expect(messages.nav.sessions).toBe("Question Classes");
    expect(messages.pages.teacherQuestions.description).toContain("question class");
    expect(messages.ask.noSession).toBe("No question classes yet");
    expect(messages.pointReview.selectTitle).toBe("Select question classes to analyze");
    expect(messages.sessions.deleteConfirm).toContain("no longer be assigned to a class");
    expect(messages.report.docNoAnalysis).toBe("No analyzed classes.");
    expect(messages.pointLabel.act_QUESTION_WRITE).toBe("Wrote a question in a question class");
  });

  it("사용자에게 직접 노출되는 오류와 전자 우편 문구를 질문수업 용어로 통일한다", () => {
    const expectedCopyByFile: Record<string, readonly string[]> = {
      "src/lib/app-queries.ts": ["질문수업을 불러오지 못했습니다"],
      "src/lib/email.ts": [
        "로그인 후 학생 등록과 질문수업을 시작할 수 있습니다.",
        "질문수업: ${sessionTitle}",
        "<strong>질문수업:</strong>",
      ],
      "src/lib/question-route-service.ts": [
        "비활성화된 수업에서는 질문을 작성할 수 없습니다",
        'reason: "질문수업 질문 작성"',
      ],
      "src/app/api/questions/[id]/comments/route.ts": [
        "비활성화된 수업에서는 댓글을 작성할 수 없습니다",
      ],
      "src/lib/publish-questions-service.ts": ["질문수업을 찾을 수 없습니다"],
      "src/app/api/sessions/[id]/participation/route.ts": ["질문수업을 찾을 수 없습니다"],
      "src/app/api/sessions/[id]/remind/route.ts": ["질문수업을 찾을 수 없습니다"],
      "src/app/api/sessions/[id]/analysis/route.ts": [
        "교사만 수업 분석을 실행할 수 있습니다",
        "질문수업을 찾을 수 없습니다",
        "수업 분석 권한이 없습니다",
      ],
      "src/app/api/reports/student-session-analysis/route.ts": ["이 수업에서 한 활동이 없어요"],
      "src/app/api/reports/session-analysis/translate/route.ts": ["질문수업을 찾을 수 없습니다"],
      "src/app/api/unit-design/sequence/route.ts": ["질문수업을 찾을 수 없습니다"],
      "src/app/api/teacher/points/analyze/route.ts": ["질문수업을 찾을 수 없습니다"],
    };

    for (const [path, copies] of Object.entries(expectedCopyByFile)) {
      const source = read(path);
      for (const copy of copies) expect(source).toContain(copy);
    }
  });

  it("옛값과 새값을 모두 기본 포인트 사유로 보아 중복 표시하지 않는다", () => {
    const shouldShowPointReason = Reflect.get(pointsPolicy, "shouldShowPointReason") as
      | ((reason: string, defaultLabel: string, bonusType: string) => boolean)
      | undefined;

    expect(typeof shouldShowPointReason).toBe("function");
    expect(pointsPolicy.pointBonusLabel("QUESTION_WRITE").label).toBe("질문수업 질문 작성");
    expect(shouldShowPointReason?.("수업세션 질문 작성", "Wrote a question class question", "QUESTION_WRITE")).toBe(false);
    expect(shouldShowPointReason?.("질문수업 질문 작성", "질문수업 질문 작성", "QUESTION_WRITE")).toBe(false);
    expect(shouldShowPointReason?.("instance:activity-1", "질문수업 질문 작성", "QUESTION_WRITE")).toBe(false);
    expect(shouldShowPointReason?.("성실한 참여", "질문수업 질문 작성", "QUESTION_WRITE")).toBe(true);
    expect(shouldShowPointReason?.("수업세션 질문 작성", "교사 지급", "TEACHER_GRANT")).toBe(true);

    expect(read("src/components/shared/PointsCard.tsx")).toContain("shouldShowPointReason");
    expect(read("src/app/(teacher)/teacher-students/StudentDetailDialog.tsx")).toContain(
      "shouldShowPointReason",
    );
  });
});
