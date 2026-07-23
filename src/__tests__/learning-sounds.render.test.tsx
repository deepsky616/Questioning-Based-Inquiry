// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installMockAudioContext } from "@/__tests__/test-utils/mock-audio-context";
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
