// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import {
  ReportPrintDoc,
  type PrintReportItem,
} from "@/components/reports/ReportPrintDoc";

afterEach(cleanup);

describe("학생 상세리포트 인쇄 질문수업 학년", () => {
  it("질문수업별 분석 제목에 학생 학년을 표시한다", () => {
    const item: PrintReportItem = {
      name: "김질문",
      grade: "4",
      className: "1",
      studentNumber: "1",
      school: "질문초등학교",
      totals: {
        questions: 1,
        likesGiven: 1,
        comments: 1,
        likesReceived: 1,
        commentsReceived: 1,
      },
      classification: {
        total: 1,
        closure: { closed: 0, open: 1 },
        cognitive: { factual: 0, conceptual: 1, controversial: 0 },
      },
      sessions: [
        {
          id: "session-1",
          date: "2026-07-28",
          subject: "수학",
          topic: "6. 평면도형의 둘레와 넓이",
          analysis: { summary: "수업에 적극적으로 참여했어요." },
        },
      ],
    };

    render(
      <NextIntlClientProvider
        locale="ko"
        messages={ko}
        timeZone="Asia/Seoul"
      >
        <ReportPrintDoc items={[item]} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "2026-07-28 · 4학년 · 수학 · 6. 평면도형의 둘레와 넓이",
      }),
    ).toBeInTheDocument();
  });
});
