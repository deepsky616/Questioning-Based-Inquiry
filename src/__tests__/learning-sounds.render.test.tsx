// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";
import { CurrentUserIdentityProvider } from "@/components/shared/current-user-identity";
import { installMockAudioContext } from "@/__tests__/test-utils/mock-audio-context";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import {
  LEARNING_SOUND_KEY,
  useLearningSoundEvent,
} from "@/lib/learning-sounds";

function SoundEvent({
  eventKey,
  active = true,
}: {
  eventKey: string | null;
  active?: boolean;
}) {
  useLearningSoundEvent("reveal", eventKey, active);
  return null;
}

function soundToggleFor(userId: string, audience: "student" | "teacher" = "student") {
  return (
    <CurrentUserIdentityProvider userId={userId}>
      <LearningSoundToggle audience={audience} />
    </CurrentUserIdentityProvider>
  );
}

describe("학습 효과음 사건 재생", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LEARNING_SOUND_KEY, "on");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("같은 사건은 화면이 다시 그려져도 한 번만 재생한다", async () => {
    const audio = installMockAudioContext();
    const view = render(<SoundEvent eventKey="round-1" />);

    await waitFor(() => expect(audio.contexts).toHaveBeenCalledTimes(1));
    view.rerender(<SoundEvent eventKey="round-1" />);
    expect(audio.contexts).toHaveBeenCalledTimes(1);

    view.rerender(<SoundEvent eventKey="round-2" />);
    await waitFor(() => expect(audio.contexts).toHaveBeenCalledTimes(2));
  });

  it("비활성 사건은 재생하지 않고 활성화됐을 때 한 번만 재생한다", async () => {
    const audio = installMockAudioContext();
    const view = render(<SoundEvent active={false} eventKey="round-1" />);

    await Promise.resolve();
    expect(audio.contexts).not.toHaveBeenCalled();

    view.rerender(<SoundEvent active eventKey="round-1" />);
    await waitFor(() => expect(audio.contexts).toHaveBeenCalledTimes(1));
  });
});

describe("학습 효과음 첫 안내", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/student-practice");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("학생이 선택하지 않고 나가면 다음 진입에도 안내를 보여 준다", async () => {
    const first = renderWithIntl(soundToggleFor("student-1"));

    expect(await screen.findByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeTruthy();
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith("question-learning-sound-guide-seen-v2"),
      ),
    ).toEqual([]);
    first.unmount();

    renderWithIntl(soundToggleFor("student-1"));
    expect(await screen.findByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeTruthy();
  });

  it("한 화면에 소리 버튼이 여러 개여도 안내는 하나만 보여 준다", async () => {
    renderWithIntl(
      <>
        <LearningSoundToggle />
        <LearningSoundToggle />
      </>,
    );

    expect(
      await screen.findAllByText("차례, 성공, 완료를 소리로 알 수 있어요."),
    ).toHaveLength(1);
  });

  it("효과음 켜기를 선택하면 설정을 저장하고 안내를 닫는다", async () => {
    installMockAudioContext();
    const first = renderWithIntl(soundToggleFor("student-1"));

    const guide = await screen.findByRole("region", { name: "효과음 안내" });
    fireEvent.click(within(guide).getByRole("button", { name: "효과음 사용하기" }));

    await waitFor(() => {
      expect(localStorage.getItem(LEARNING_SOUND_KEY)).toBe("on");
      expect(screen.queryByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeNull();
    });
    expect(
      localStorage.getItem(
        "question-learning-sound-guide-seen-v2:student:student-1",
      ),
    ).toBe("seen");
    expect(screen.getByRole("button", { name: "효과음 끄기" })).toBeTruthy();
    first.unmount();

    renderWithIntl(soundToggleFor("student-1"));
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "효과음 안내" })).toBeNull();
    });
  });

  it("괜찮아요를 선택하면 꺼짐을 저장하고 안내를 닫는다", async () => {
    renderWithIntl(<LearningSoundToggle />);

    fireEvent.click(await screen.findByRole("button", { name: "괜찮아요" }));

    await waitFor(() => {
      expect(localStorage.getItem(LEARNING_SOUND_KEY)).toBe("off");
      expect(screen.queryByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeNull();
    });
  });

  it("학생과 교사의 안내 확인 기록을 구분한다", async () => {
    const student = renderWithIntl(soundToggleFor("shared-user", "student"));
    expect(await screen.findByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "괜찮아요" }));
    student.unmount();

    window.history.replaceState({}, "", "/teacher-practice");
    renderWithIntl(soundToggleFor("shared-user", "teacher"));

    expect(await screen.findByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeTruthy();
  });

  it("같은 브라우저에서도 다른 학생에게는 첫 안내를 따로 보여 준다", async () => {
    const firstStudent = renderWithIntl(soundToggleFor("student-1"));
    fireEvent.click(await screen.findByRole("button", { name: "괜찮아요" }));
    firstStudent.unmount();

    renderWithIntl(soundToggleFor("student-2"));

    expect(await screen.findByText("차례, 성공, 완료를 소리로 알 수 있어요.")).toBeTruthy();
  });
});
