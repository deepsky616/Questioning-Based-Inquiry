// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { RoomTurnNotice } from "@/components/question-games/RoomTurnNotice";

describe("질문놀이 차례 알림", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.title = "질문 놀이터";
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("내 차례를 읽어 주고 소리 설정과 문서 제목을 함께 제공한다", async () => {
    const view = render(<RoomTurnNotice active turnKey="room-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("지금 내 차례예요.");
    const soundButton = await screen.findByRole("button", {
      name: "차례 소리 켜기",
    });
    fireEvent.click(soundButton);
    expect(window.localStorage.getItem("question-game-turn-sound")).toBe("on");
    expect(await screen.findByRole("button", { name: "차례 소리 끄기" }))
      .toBeInTheDocument();
    await waitFor(() => expect(document.title).toContain("내 차례"));

    view.rerender(<RoomTurnNotice active={false} turnKey="room-1" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("질문 놀이터"));
  });
});
