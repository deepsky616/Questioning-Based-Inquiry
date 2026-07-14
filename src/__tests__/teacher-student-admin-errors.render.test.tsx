// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { StudentBulkRegisterCard } from "@/components/teacher/StudentBulkRegisterCard";
import { StudentPasswordResetCard } from "@/components/teacher/StudentPasswordResetCard";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("학생 계정 관리 자료 오류", () => {
  it("교사 정보 실패를 등록 양식 대신 보여주고 다시 불러온다", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/teacher/profile");
      attempts += 1;
      if (attempts === 1) return response({}, false);
      return response({
        school: "한빛초등학교",
        teacherClasses: [{ grade: "5", className: "2" }],
      });
    }));

    renderWithProviders(<StudentBulkRegisterCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "담당 학급 정보를 불러오지 못했습니다.",
    );
    expect(screen.queryByLabelText(ko.settings.schoolLabel)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByDisplayValue("한빛초등학교")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5학년 2반")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("학생 목록 실패를 빈 상태와 구분하고 다시 불러온다", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/teacher/students?view=directory");
      attempts += 1;
      if (attempts === 1) return response({}, false);
      return response({
        students: [{
          id: "student-1",
          name: "김하늘",
          grade: "5",
          className: "2",
          studentNumber: "7",
        }],
        teacherClasses: [{ grade: "5", className: "2" }],
      });
    }));

    renderWithProviders(<StudentPasswordResetCard embedded />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "학생 목록을 불러오지 못했습니다.",
    );
    expect(screen.queryByText(ko.account.noStudents)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => expect(screen.getByText("김하늘")).toBeInTheDocument());
    expect(attempts).toBe(2);
  });

  it("일부 학생 선택과 비밀번호 변경 결과를 화면 읽기 도구에 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href === "/api/teacher/students?view=directory") {
        return response({
          students: [
            { id: "student-1", name: "김하늘", grade: "5", className: "2", studentNumber: "7" },
            { id: "student-2", name: "이바다", grade: "5", className: "2", studentNumber: "12" },
          ],
          teacherClasses: [{ grade: "5", className: "2" }],
        });
      }
      if (href === "/api/teacher/students/reset-password" && init?.method === "POST") {
        return response({ count: 1 });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    renderWithProviders(<StudentPasswordResetCard embedded />);

    const firstStudent = await screen.findByRole("checkbox", { name: /김하늘/ });
    const selectAll = screen.getByRole("checkbox", { name: ko.account.selectAll });
    fireEvent.click(firstStudent);
    expect(selectAll).toBePartiallyChecked();

    const password = screen.getByLabelText(ko.account.newPassword);
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "1명 비밀번호 재설정" }));
    expect(screen.getByRole("alert")).toHaveTextContent("비밀번호는 8~16자로 입력해주세요.");

    fireEvent.change(password, { target: { value: "Valid123!" } });
    fireEvent.click(screen.getByRole("button", { name: "1명 비밀번호 재설정" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1명의 비밀번호를 재설정했어요.");
  });
});
