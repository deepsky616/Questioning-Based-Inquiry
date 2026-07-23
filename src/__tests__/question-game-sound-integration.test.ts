import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("질문놀이 핵심 효과음 연결", () => {
  it("질문 주사위와 이야기 주사위에 굴림 및 결과 공개음을 연결한다", () => {
    for (const file of [
      "src/app/(student)/student-question-play/games/DiceGame.tsx",
      "src/app/(student)/student-question-play/games/StoryDiceGame.tsx",
    ]) {
      const text = source(file);
      expect(text).toContain("useLearningSounds");
      expect(text).toContain('playSound("start")');
      expect(text).toContain('playSound("reveal")');
    }
  });

  it("까바놀이 판정과 짝 찾기 카드 동작에 학습 피드백음을 연결한다", () => {
    const kaba = source("src/app/(student)/student-question-play/games/KabaGame.tsx");
    expect(kaba).toContain('playSound(correct ? "success" : "retry")');

    const memory = source("src/app/(student)/student-question-play/games/MemoryGame.tsx");
    expect(memory).toContain('playSound("flip")');
    expect(memory).toMatch(/useLearningSoundEvent\(\s*"retry"/);
    expect(memory).toMatch(/useLearningSoundEvent\(\s*"success"/);
  });

  it("질문 사다리의 경로 공개와 질문 저장을 소리로 구분한다", () => {
    const ladder = source("src/app/(student)/student-question-play/games/LadderGame.tsx");
    expect(ladder).toContain("LearningSoundToggle");
    expect(ladder).toContain('playSound("reveal")');
    expect(ladder).toContain('playSound("success")');
  });

  it("공용 머리말을 쓰지 않는 놀이에서도 효과음 설정을 항상 제공한다", () => {
    for (const file of [
      "src/app/(student)/student-question-play/games/DiceGame.tsx",
      "src/app/(student)/student-question-play/games/KabaGame.tsx",
      "src/app/(student)/student-question-play/games/RelayGame.tsx",
      "src/app/(student)/student-question-play/games/MysteryBoxGame.tsx",
    ]) {
      expect(source(file)).toContain("LearningSoundToggle");
    }
  });

  it("질문 릴레이 저장과 미스터리 답변 확정에도 결과음을 연결한다", () => {
    const relay = source("src/app/(student)/student-question-play/games/RelayGame.tsx");
    expect(relay).toContain('playSound("success")');

    const mystery = source("src/app/(student)/student-question-play/games/MysteryBoxGame.tsx");
    expect(mystery).toContain('playSound("reveal")');
    expect(mystery).toContain('playSound("retry")');
  });
});
