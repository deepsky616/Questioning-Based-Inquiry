// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import StudentQuestionPlayPage from "@/app/(student)/student-question-play/page";
import TeacherQuestionPlayPage from "@/app/(teacher)/teacher-question-play/page";
import { BUILT_IN_GAMES, type CustomGame } from "@/lib/question-games-data";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/lib/app-queries", () => ({
  useTeacherStudents: () => ({
    data: { students: [], teacherClasses: [] },
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => vi.fn(),
}));

const customGame: CustomGame = {
  id: "custom-not-runnable",
  teacherId: "teacher-1",
  title: "직접 만든 놀이",
  description: "교사가 만든 놀이 설명",
  emoji: "🎮",
  gradientCss: "linear-gradient(135deg, #4338CA 0%, #7C3AED 100%)",
  accentColor: "#4338CA",
  playerCount: "2~8명",
  duration: "10분",
  instructions: ["놀이 순서"],
  isBuiltIn: false,
  order: 100,
};

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      {children}
    </NextIntlClientProvider>,
  );
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  vi.unstubAllGlobals();
});

describe("질문놀이 실행 가능 상태", () => {
  it("학생 화면은 응답에 섞인 직접 만든 놀이를 표시하지 않는다", async () => {
    const builtInGame = BUILT_IN_GAMES[0];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([customGame, builtInGame])),
    );

    renderWithIntl(<StudentQuestionPlayPage />);

    expect(await screen.findByText(builtInGame.title)).toBeVisible();
    expect(screen.queryByText(customGame.title)).not.toBeInTheDocument();
    expect(
      screen.getByText(ko.playLanding.gameCount.replace("{count}", "1")),
    ).toBeVisible();
  });

  it("교사 화면은 직접 만든 놀이가 아직 학생 실행 불가임을 알린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          url.endsWith("/stats")
            ? jsonResponse({ byGame: {} })
            : jsonResponse({ games: [customGame], visibilityMap: {} }),
        );
      }),
    );

    renderWithIntl(<TeacherQuestionPlayPage />);

    const customTitle = await screen.findByText(customGame.title);
    const customCard = customTitle.closest("[draggable]");

    expect(customCard).not.toBeNull();
    expect(
      within(customCard as HTMLElement).getByText("아직 학생이 실행할 수 없어요."),
    ).toBeVisible();
    expect(
      within(customCard as HTMLElement).queryByText(ko.qPlay.vis_all, { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      within(customCard as HTMLElement).queryByRole("button", {
        name: ko.qPlay.visSettings,
      }),
    ).not.toBeInTheDocument();
  });

  it("직접 만든 놀이는 공개 수치와 공개 탭 목록에서 제외한다", async () => {
    const builtInGame = BUILT_IN_GAMES[0];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          url.endsWith("/stats")
            ? jsonResponse({ byGame: {} })
            : jsonResponse({
              games: [customGame, builtInGame],
              visibilityMap: {},
            }),
        );
      }),
    );

    renderWithIntl(<TeacherQuestionPlayPage />);

    expect(await screen.findByText(customGame.title)).toBeVisible();
    const publicStat = screen.getByText(ko.qPlay.statPublic).parentElement;
    expect(publicStat).not.toBeNull();
    expect(within(publicStat as HTMLElement).getByText("1")).toBeVisible();

    const publicTab = screen.getByRole("tab", { name: "공개 (1)" });
    fireEvent.mouseDown(publicTab, { button: 0, ctrlKey: false });

    expect(screen.getByText(builtInGame.title)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText(customGame.title)).not.toBeInTheDocument(),
    );
  });

  it("직접 만든 놀이의 저장된 숨김 값은 숨김 수치에 포함하지 않는다", async () => {
    const builtInGame = BUILT_IN_GAMES[0];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          url.endsWith("/stats")
            ? jsonResponse({ byGame: {} })
            : jsonResponse({
              games: [customGame, builtInGame],
              visibilityMap: {
                [customGame.id]: { type: "hidden" },
                [builtInGame.id]: { type: "hidden" },
              },
            }),
        );
      }),
    );

    renderWithIntl(<TeacherQuestionPlayPage />);

    const customTitle = await screen.findByText(customGame.title);
    const customCard = customTitle.closest("[draggable]");
    expect(customCard).not.toBeNull();
    expect(
      within(customCard as HTMLElement).getByText("아직 학생이 실행할 수 없어요."),
    ).toBeVisible();

    const hiddenStat = screen.getByText(ko.qPlay.statHidden).parentElement;
    expect(hiddenStat).not.toBeNull();
    expect(within(hiddenStat as HTMLElement).getByText("1")).toBeVisible();
    expect(screen.getByRole("tab", { name: "비공개 (1)" })).toBeVisible();
  });

  it("직접 만든 놀이는 저장된 숨김 값과 무관하게 숨김 탭에서 제외한다", async () => {
    const builtInGame = BUILT_IN_GAMES[0];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(
          url.endsWith("/stats")
            ? jsonResponse({ byGame: {} })
            : jsonResponse({
              games: [customGame, builtInGame],
              visibilityMap: {
                [customGame.id]: { type: "hidden" },
                [builtInGame.id]: { type: "hidden" },
              },
            }),
        );
      }),
    );

    renderWithIntl(<TeacherQuestionPlayPage />);

    expect(await screen.findByText(customGame.title)).toBeVisible();
    const hiddenTab = screen.getByRole("tab", { name: /비공개/ });
    fireEvent.mouseDown(hiddenTab, { button: 0, ctrlKey: false });

    expect(screen.getByText(builtInGame.title)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText(customGame.title)).not.toBeInTheDocument(),
    );
  });
});
