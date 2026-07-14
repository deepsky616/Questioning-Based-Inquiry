// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { QuestionGameRoomFlow } from "@/components/question-games/QuestionGameRoomFlow";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import { canAccess, getRequiredRole } from "@/lib/route-access";

const createRoom = vi.fn();
const joinRoom = vi.fn();

vi.mock("@/app/(student)/student-question-play/games/useRoom", () => ({
  useRoom: () => ({
    room: null,
    error: null,
    actionLoading: false,
    createRoom,
    joinRoom,
    sendAction: vi.fn(),
    leaveRoom: vi.fn(),
    setActiveCode: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("교사 질문놀이 친구 방", () => {
  const game = BUILT_IN_GAMES.find(({ id }) => id === "relay")!;

  it("교사 방 화면은 방 개설만 제공하고 학생 화면은 참가도 제공한다", () => {
    const view = render(
      <QuestionGameRoomFlow
        game={game}
        myId="teacher-1"
        allowJoin={false}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /방 개설하기/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /방 코드 입력/ })).not.toBeInTheDocument();

    view.rerender(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /방 코드 입력/ })).toBeVisible();
  });

  it("교사 목록과 호스트 경로가 공용 방 흐름으로 연결된다", () => {
    const teacherList = readFileSync(
      "src/app/(teacher)/teacher-question-play/page.tsx",
      "utf8",
    );
    const teacherHost = readFileSync(
      "src/app/(teacher)/teacher-question-play/[gameId]/host/page.tsx",
      "utf8",
    );
    const studentGame = readFileSync(
      "src/app/(student)/student-question-play/[gameId]/page.tsx",
      "utf8",
    );

    expect(teacherList).toContain("/teacher-question-play/${game.id}/host");
    expect(teacherHost).toContain("QuestionGameRoomFlow");
    expect(teacherHost).toContain("allowJoin={false}");
    expect(studentGame).toContain("QuestionGameRoomFlow");
    expect(studentGame).toContain("allowJoin");
  });

  it("교사 호스트 경로는 교사 역할만 허용한다", () => {
    const path = "/teacher-question-play/relay/host";
    expect(getRequiredRole(path)).toBe("TEACHER");
    expect(canAccess("TEACHER", path)).toBe(true);
    expect(canAccess("STUDENT", path)).toBe(false);
  });
});
