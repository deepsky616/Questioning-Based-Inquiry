// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";

const fixtures = vi.hoisted(() => ({
  classReport: {
    klass: { grade: "4", className: "1", studentCount: 1 },
    perStudent: [
      {
        id: "student-kim",
        name: "김질문",
        studentNumber: "1",
        questions: 3,
        likesGiven: 4,
        comments: 5,
      },
    ],
    sessions: [],
    totals: {},
    weekly: [],
    monthly: [],
    classification: {},
  },
  studentReport: {
    student: {
      id: "student-kim",
      name: "김질문",
      grade: "4",
      className: "1",
      studentNumber: "1",
      school: "질문초등학교",
    },
    sessions: [],
    totals: {},
    weekly: [],
    monthly: [],
    classification: {},
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey[0];
      const data = key === "report-classes"
        ? [{ grade: "4", className: "1", studentCount: 1 }]
        : key === "class-report"
          ? fixtures.classReport
          : key === "teacher-student-report"
            ? fixtures.studentReport
            : { byId: new Map(), total: 0, sumPoints: 0 };
      return {
        data,
        isLoading: false,
        isFetching: false,
        error: null,
        dataUpdatedAt: Date.now(),
        refetch: vi.fn(),
      };
    },
  };
});

vi.mock("@/components/reports/ReportView", () => ({
  ReportView: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <section>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </section>
  ),
}));

vi.mock("@/components/reports/ReportPrintDoc", () => ({
  ReportPrintDoc: () => null,
}));

vi.mock("@/components/teacher/ReportPrintControls", () => ({
  ReportPrintControls: () => null,
}));

import { TeacherReportsView } from "@/components/teacher/TeacherReportsView";

afterEach(cleanup);

describe("교사 학생별 상세리포트 학년", () => {
  it("학생별 상세리포트 머리말에 학년·반·번호를 표시한다", () => {
    renderWithIntl(<TeacherReportsView />);

    fireEvent.click(screen.getByRole("button", { name: "학생별" }));

    expect(
      screen.getByRole("heading", { name: "김질문 학생 활동 리포트" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4학년 1반 1번")).toBeInTheDocument();
  });
});
